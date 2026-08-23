/*
 * Generatore QR Code compatto e puro in TypeScript (ISO/IEC 18004).
 *
 * Genera una matrice QR a partire da una stringa (come una chiave ed25519 a 64 char)
 * e la renderizza come elemento SVG vettoriale scalabile ad alto contrasto.
 * Nessuna dipendenza esterna necessaria.
 */

// Corpo di Galois GF(256) per Reed-Solomon
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(() => {
  let value = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = value;
    LOG_TABLE[value] = i;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d;
    }
  }
  EXP_TABLE[255] = EXP_TABLE[0] ?? 1;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  const logA = LOG_TABLE[a] ?? 0;
  const logB = LOG_TABLE[b] ?? 0;
  return EXP_TABLE[(logA + logB) % 255] ?? 0;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    const factor = EXP_TABLE[i] ?? 0;
    for (let j = 0; j < poly.length; j++) {
      const p = poly[j] ?? 0;
      nextPoly[j] = (nextPoly[j] ?? 0) ^ p;
      nextPoly[j + 1] = (nextPoly[j + 1] ?? 0) ^ gfMul(p, factor);
    }
    poly = nextPoly;
  }
  return poly;
}

function rsCompute(data: Uint8Array, numEcBytes: number): Uint8Array {
  const genPoly = rsGeneratorPoly(numEcBytes);
  const remainder = new Uint8Array(numEcBytes);

  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0;
    const factor = byte ^ (remainder[0] ?? 0);
    remainder.copyWithin(0, 1);
    remainder[numEcBytes - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < numEcBytes; j++) {
        const g = genPoly[j + 1] ?? 0;
        remainder[j] = (remainder[j] ?? 0) ^ gfMul(g, factor);
      }
    }
  }
  return remainder;
}

// Capacità di dati e parametri per Versioni 1-10 con Error Correction Level L
interface QrVersionSpec {
  version: number;
  size: number;
  totalBytes: number;
  dataBytes: number;
  ecBytes: number;
  numBlocks: number;
  alignPositions: number[];
}

const VERSIONS: QrVersionSpec[] = [
  {
    version: 1,
    size: 21,
    totalBytes: 26,
    dataBytes: 19,
    ecBytes: 7,
    numBlocks: 1,
    alignPositions: [],
  },
  {
    version: 2,
    size: 25,
    totalBytes: 44,
    dataBytes: 34,
    ecBytes: 10,
    numBlocks: 1,
    alignPositions: [6, 18],
  },
  {
    version: 3,
    size: 29,
    totalBytes: 70,
    dataBytes: 55,
    ecBytes: 15,
    numBlocks: 1,
    alignPositions: [6, 22],
  },
  {
    version: 4,
    size: 33,
    totalBytes: 100,
    dataBytes: 80,
    ecBytes: 20,
    numBlocks: 1,
    alignPositions: [6, 26],
  },
  {
    version: 5,
    size: 37,
    totalBytes: 134,
    dataBytes: 108,
    ecBytes: 26,
    numBlocks: 1,
    alignPositions: [6, 30],
  },
  {
    version: 6,
    size: 41,
    totalBytes: 172,
    dataBytes: 136,
    ecBytes: 18,
    numBlocks: 2,
    alignPositions: [6, 34],
  },
  {
    version: 7,
    size: 45,
    totalBytes: 196,
    dataBytes: 156,
    ecBytes: 20,
    numBlocks: 2,
    alignPositions: [6, 22, 38],
  },
  {
    version: 8,
    size: 49,
    totalBytes: 242,
    dataBytes: 194,
    ecBytes: 24,
    numBlocks: 2,
    alignPositions: [6, 24, 42],
  },
  {
    version: 9,
    size: 53,
    totalBytes: 292,
    dataBytes: 232,
    ecBytes: 30,
    numBlocks: 2,
    alignPositions: [6, 26, 46],
  },
  {
    version: 10,
    size: 57,
    totalBytes: 346,
    dataBytes: 274,
    ecBytes: 18,
    numBlocks: 4,
    alignPositions: [6, 28, 50],
  },
];

function selectVersion(dataLen: number): QrVersionSpec {
  for (const v of VERSIONS) {
    const countBits = v.version < 10 ? 8 : 16;
    const available = v.dataBytes - Math.ceil((4 + countBits) / 8);
    if (dataLen <= available) {
      return v;
    }
  }
  return VERSIONS[VERSIONS.length - 1] ?? VERSIONS[0]!;
}

class BitBuffer {
  private buffer: number[] = [];
  private length = 0;

  public put(num: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  public putBit(bit: boolean): void {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      const cur = this.buffer[bufIndex] ?? 0;
      this.buffer[bufIndex] = cur | (0x80 >>> (this.length % 8));
    }
    this.length++;
  }

  public getBits(): number {
    return this.length;
  }

  public getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

function encodeData(text: string, spec: QrVersionSpec): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  const bb = new BitBuffer();

  // Mode Byte: 0100
  bb.put(0b0100, 4);

  // Character count
  const countBits = spec.version < 10 ? 8 : 16;
  bb.put(textBytes.length, countBits);

  // Text payload
  for (let i = 0; i < textBytes.length; i++) {
    bb.put(textBytes[i] ?? 0, 8);
  }

  // Terminator (fino a 4 bit)
  const totalDataBits = spec.dataBytes * 8;
  const terminator = Math.min(4, totalDataBits - bb.getBits());
  bb.put(0, terminator);

  // Allineamento a multiplo di 8
  while (bb.getBits() % 8 !== 0) {
    bb.putBit(false);
  }

  // Byte di riempimento (Pad bytes 0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (bb.getBits() < totalDataBits) {
    bb.put(padBytes[padIndex % 2] ?? 0xec, 8);
    padIndex++;
  }

  return bb.getBytes();
}

function createQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);
  const spec = selectVersion(rawBytes.length);
  const dataBytes = encodeData(text, spec);

  // Suddivisione in blocchi e calcolo Reed-Solomon
  const blockSize = Math.floor(spec.dataBytes / spec.numBlocks);
  const ecPerBlock = spec.ecBytes;
  const blocksData: Uint8Array[] = [];
  const blocksEc: Uint8Array[] = [];

  let offset = 0;
  for (let b = 0; b < spec.numBlocks; b++) {
    const curBlockLen =
      blockSize + (b >= spec.numBlocks - (spec.dataBytes % spec.numBlocks) ? 1 : 0);
    const slice = dataBytes.slice(offset, offset + curBlockLen);
    offset += curBlockLen;
    blocksData.push(slice);
    blocksEc.push(rsCompute(slice, ecPerBlock));
  }

  // Interleaving dei dati
  const interleaved: number[] = [];
  const maxDataLen = Math.max(...blocksData.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      const block = blocksData[b];
      if (block !== undefined && i < block.length) {
        interleaved.push(block[i] ?? 0);
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      const ec = blocksEc[b];
      if (ec !== undefined && i < ec.length) {
        interleaved.push(ec[i] ?? 0);
      }
    }
  }

  // Costruzione griglia
  const size = spec.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );

  // 1. Finder patterns (angoli)
  const placeFinder = (x: number, y: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = y + r;
        const col = x + c;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          const rowArr = matrix[row];
          if (rowArr !== undefined) {
            if (
              (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
              (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4)
            ) {
              rowArr[col] = true;
            } else {
              rowArr[col] = false;
            }
          }
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(size - 7, 0);
  placeFinder(0, size - 7);

  // 2. Alignment patterns
  if (spec.alignPositions.length > 1) {
    const pos = spec.alignPositions;
    for (const r of pos) {
      for (const c of pos) {
        const rowArr = matrix[r];
        if (rowArr !== undefined && rowArr[c] !== null) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            const targetRow = matrix[r + dr];
            if (targetRow !== undefined) {
              targetRow[c + dc] = isBorder || isCenter;
            }
          }
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const row6 = matrix[6];
    if (row6 !== undefined && row6[i] === null) row6[i] = i % 2 === 0;
    const rowI = matrix[i];
    if (rowI !== undefined && rowI[6] === null) rowI[6] = i % 2 === 0;
  }

  // 4. Dark module
  const darkRow = matrix[4 * spec.version + 9];
  if (darkRow !== undefined) {
    darkRow[8] = true;
  }

  // 5. Riserva spazio per Format information
  for (let i = 0; i < 9; i++) {
    const row8 = matrix[8];
    if (row8 !== undefined && row8[i] === null) row8[i] = false;
    const rowI = matrix[i];
    if (rowI !== undefined && rowI[8] === null) rowI[8] = false;
    if (size - 1 - i < size && row8 !== undefined && row8[size - 1 - i] === null)
      row8[size - 1 - i] = false;
    const rowEnd = matrix[size - 1 - i];
    if (size - 1 - i < size && rowEnd !== undefined && rowEnd[8] === null) rowEnd[8] = false;
  }

  // 6. Posizionamento bit di dati (interleaved)
  const bitArray: boolean[] = [];
  for (const byte of interleaved) {
    for (let i = 7; i >= 0; i--) {
      bitArray.push(((byte >>> i) & 1) === 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Salta colonna timing
    const left = right - 1;
    for (let count = 0; count < size; count++) {
      const y = upwards ? size - 1 - count : count;
      for (const x of [right, left]) {
        const rowY = matrix[y];
        if (rowY !== undefined && rowY[x] === null) {
          let bit = bitIdx < bitArray.length ? (bitArray[bitIdx++] ?? false) : false;
          // Maschera 0: (x + y) % 2 === 0
          if ((x + y) % 2 === 0) {
            bit = !bit;
          }
          rowY[x] = bit;
        }
      }
    }
    upwards = !upwards;
  }

  // 7. Format Information (Level L, Mask 0)
  const FORMAT_BITS = [
    true,
    true,
    true,
    false,
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    true,
    false,
    false,
  ];

  const row8 = matrix[8];
  for (let i = 0; i < 6; i++) {
    if (row8 !== undefined) row8[i] = FORMAT_BITS[i] ?? false;
  }
  if (row8 !== undefined) {
    row8[7] = FORMAT_BITS[6] ?? false;
    row8[8] = FORMAT_BITS[7] ?? false;
  }
  const row7 = matrix[7];
  if (row7 !== undefined) row7[8] = FORMAT_BITS[8] ?? false;
  for (let i = 9; i < 15; i++) {
    const rowI = matrix[14 - i];
    if (rowI !== undefined) rowI[8] = FORMAT_BITS[i] ?? false;
  }

  for (let i = 0; i < 8; i++) {
    if (row8 !== undefined) row8[size - 1 - i] = FORMAT_BITS[i] ?? false;
  }
  for (let i = 8; i < 15; i++) {
    const rowEnd = matrix[size - 15 + i];
    if (rowEnd !== undefined) rowEnd[8] = FORMAT_BITS[i] ?? false;
  }

  return matrix.map((row) => row.map((cell) => cell === true));
}

export interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
  title?: string;
}

export function QrCode({
  value,
  size = 200,
  className,
  title = "Codice QR",
}: QrCodeProps): React.ReactElement {
  if (!value) {
    return <div style={{ width: size, height: size }} />;
  }

  let matrix: boolean[][] = [];
  try {
    matrix = createQrMatrix(value);
  } catch {
    return <div style={{ width: size, height: size }} />;
  }

  const moduleCount = matrix.length;
  const padding = 2; // Quiet zone
  const totalSize = moduleCount + padding * 2;

  let pathData = "";
  for (let r = 0; r < moduleCount; r++) {
    const row = matrix[r];
    if (row === undefined) continue;
    for (let c = 0; c < moduleCount; c++) {
      if (row[c]) {
        pathData += `M${c + padding},${r + padding}h1v1h-1z `;
      }
    }
  }

  return (
    <svg
      aria-label={title}
      className={className}
      height={size}
      role="img"
      style={{
        background: "#ffffff",
        borderRadius: "var(--radius-md, 8px)",
        display: "block",
        maxWidth: "100%",
        padding: "8px",
      }}
      viewBox={`0 0 ${totalSize} ${totalSize}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <rect fill="#ffffff" height={totalSize} width={totalSize} x={0} y={0} />
      <path d={pathData} fill="#000000" />
    </svg>
  );
}
