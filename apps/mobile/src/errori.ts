/**
 * Che cosa si legge quando qualcosa non riesce. Stessa regola del web:
 * l'istanza manda già una frase; la rete caduta no, e non si mostra
 * «Failed to fetch».
 */

export class ApiError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function spiega(causa: unknown, ripiego: string): string {
  if (causa instanceof ApiError) {
    return causa.message;
  }

  if (causa instanceof TypeError) {
    return "Non riesco a raggiungere l'istanza. Controlla il collegamento e riprova.";
  }

  return ripiego;
}

export function isSessioneMorta(causa: unknown): boolean {
  return causa instanceof ApiError && (causa.status === 401 || causa.code === "unauthorized");
}
