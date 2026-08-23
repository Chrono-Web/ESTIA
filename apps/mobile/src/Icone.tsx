import type { ReactElement } from "react";
import { StyleSheet, View } from "react-native";

export function IconaBacheca({
  colore,
  size = 24,
}: {
  colore: string;
  size?: number;
}): ReactElement {
  const blockSize = size * 0.38;
  const stroke = 1.8;
  const radius = 3;

  return (
    <View style={[styles.box, { height: size, width: size }]}>
      <View style={{ flexDirection: "row", gap: 3 }}>
        <View
          style={{
            borderColor: colore,
            borderRadius: radius,
            borderWidth: stroke,
            height: blockSize,
            width: blockSize,
          }}
        />
        <View
          style={{
            borderColor: colore,
            borderRadius: radius,
            borderWidth: stroke,
            height: blockSize,
            width: blockSize,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 3, marginTop: 3 }}>
        <View
          style={{
            borderColor: colore,
            borderRadius: radius,
            borderWidth: stroke,
            height: blockSize,
            width: blockSize,
          }}
        />
        <View
          style={{
            borderColor: colore,
            borderRadius: radius,
            borderWidth: stroke,
            height: blockSize,
            width: blockSize,
          }}
        />
      </View>
    </View>
  );
}

export function IconaMessaggi({
  colore,
  size = 24,
}: {
  colore: string;
  size?: number;
}): ReactElement {
  const stroke = 1.8;
  const bubbleWidth = size * 0.85;
  const bubbleHeight = size * 0.65;

  return (
    <View style={[styles.box, { height: size, width: size }]}>
      <View
        style={{
          borderColor: colore,
          borderRadius: size * 0.28,
          borderWidth: stroke,
          height: bubbleHeight,
          justifyContent: "center",
          position: "relative",
          width: bubbleWidth,
        }}
      >
        {/* Tail */}
        <View
          style={{
            backgroundColor: colore,
            borderBottomRightRadius: 2,
            bottom: -3,
            height: 4,
            left: 4,
            position: "absolute",
            transform: [{ rotate: "45deg" }],
            width: 4,
          }}
        />
        {/* 3 dots */}
        <View
          style={{
            flexDirection: "row",
            gap: 2.5,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colore,
              borderRadius: 999,
              height: 2.2,
              width: 2.2,
            }}
          />
          <View
            style={{
              backgroundColor: colore,
              borderRadius: 999,
              height: 2.2,
              width: 2.2,
            }}
          />
          <View
            style={{
              backgroundColor: colore,
              borderRadius: 999,
              height: 2.2,
              width: 2.2,
            }}
          />
        </View>
      </View>
    </View>
  );
}

export function IconaProfilo({
  colore,
  size = 24,
}: {
  colore: string;
  size?: number;
}): ReactElement {
  const stroke = 1.8;
  const headSize = size * 0.36;
  const shoulderWidth = size * 0.72;
  const shoulderHeight = size * 0.32;

  return (
    <View style={[styles.box, { height: size, width: size }]}>
      {/* Head */}
      <View
        style={{
          borderColor: colore,
          borderRadius: 999,
          borderWidth: stroke,
          height: headSize,
          width: headSize,
        }}
      />
      {/* Shoulders */}
      <View
        style={{
          borderBottomWidth: 0,
          borderColor: colore,
          borderTopLeftRadius: shoulderWidth / 2,
          borderTopRightRadius: shoulderWidth / 2,
          borderWidth: stroke,
          height: shoulderHeight,
          marginTop: 2,
          width: shoulderWidth,
        }}
      />
    </View>
  );
}

export function IconaCuore({
  colore,
  pieno = false,
  size = 20,
}: {
  colore: string;
  pieno?: boolean;
  size?: number;
}): ReactElement {
  const s = size * 0.44;
  const stroke = 1.6;

  return (
    <View
      style={[
        styles.box,
        {
          height: size,
          paddingTop: size * 0.1,
          width: size,
        },
      ]}
    >
      <View style={{ height: size * 0.75, position: "relative", width: size * 0.85 }}>
        {/* Left lobe */}
        <View
          style={{
            backgroundColor: pieno ? colore : "transparent",
            borderColor: colore,
            borderTopLeftRadius: s / 2,
            borderTopRightRadius: s / 2,
            borderWidth: pieno ? 0 : stroke,
            height: s * 1.5,
            left: 2,
            position: "absolute",
            top: 0,
            transform: [{ rotate: "-45deg" }],
            width: s,
          }}
        />
        {/* Right lobe */}
        <View
          style={{
            backgroundColor: pieno ? colore : "transparent",
            borderColor: colore,
            borderTopLeftRadius: s / 2,
            borderTopRightRadius: s / 2,
            borderWidth: pieno ? 0 : stroke,
            height: s * 1.5,
            position: "absolute",
            right: 2,
            top: 0,
            transform: [{ rotate: "45deg" }],
            width: s,
          }}
        />
      </View>
    </View>
  );
}

export function IconaInvia({ colore, size = 20 }: { colore: string; size?: number }): ReactElement {
  const stroke = 2;
  const stemHeight = size * 0.45;
  const headSize = size * 0.32;

  return (
    <View style={[styles.box, { height: size, width: size }]}>
      {/* Up arrow head */}
      <View
        style={{
          borderLeftWidth: stroke,
          borderTopWidth: stroke,
          borderColor: colore,
          height: headSize,
          marginBottom: -headSize * 0.4,
          transform: [{ rotate: "45deg" }],
          width: headSize,
        }}
      />
      {/* Arrow stem */}
      <View
        style={{
          backgroundColor: colore,
          borderRadius: stroke / 2,
          height: stemHeight,
          width: stroke,
        }}
      />
    </View>
  );
}

export function IconaFrecciaIndietro({
  colore,
  size = 20,
}: {
  colore: string;
  size?: number;
}): ReactElement {
  const chevronSize = size * 0.42;
  const stroke = 2.4;

  return (
    <View style={[styles.box, { height: size, width: size }]}>
      <View
        style={{
          borderBottomWidth: stroke,
          borderColor: colore,
          borderLeftWidth: stroke,
          borderRadius: 1,
          height: chevronSize,
          marginLeft: chevronSize * 0.3,
          transform: [{ rotate: "45deg" }],
          width: chevronSize,
        }}
      />
    </View>
  );
}

export function IconaLucchetto({
  colore,
  size = 16,
}: {
  colore: string;
  size?: number;
}): ReactElement {
  const stroke = 1.6;
  const shackleWidth = size * 0.46;
  const shackleHeight = size * 0.38;
  const bodyWidth = size * 0.68;
  const bodyHeight = size * 0.46;

  return (
    <View style={[styles.box, { height: size, width: size }]}>
      {/* Shackle */}
      <View
        style={{
          borderBottomWidth: 0,
          borderColor: colore,
          borderTopLeftRadius: shackleWidth / 2,
          borderTopRightRadius: shackleWidth / 2,
          borderWidth: stroke,
          height: shackleHeight,
          width: shackleWidth,
        }}
      />
      {/* Body */}
      <View
        style={{
          backgroundColor: colore,
          borderRadius: 2.5,
          height: bodyHeight,
          marginTop: -0.5,
          width: bodyWidth,
        }}
      />
    </View>
  );
}

export function IconaNuovo({ colore, size = 20 }: { colore: string; size?: number }): ReactElement {
  const stroke = 2;
  const length = size * 0.55;

  return (
    <View style={[styles.box, { height: size, width: size }]}>
      {/* Horizontal */}
      <View
        style={{
          backgroundColor: colore,
          borderRadius: stroke / 2,
          height: stroke,
          position: "absolute",
          width: length,
        }}
      />
      {/* Vertical */}
      <View
        style={{
          backgroundColor: colore,
          borderRadius: stroke / 2,
          height: length,
          position: "absolute",
          width: stroke,
        }}
      />
    </View>
  );
}

export function IconaCasa({ colore, size = 28 }: { colore: string; size?: number }): ReactElement {
  const stroke = 2;
  const w = size * 0.7;

  return (
    <View style={[styles.box, { height: size, width: size }]}>
      {/* Roof */}
      <View
        style={{
          borderColor: colore,
          borderLeftWidth: stroke,
          borderTopWidth: stroke,
          height: w * 0.55,
          transform: [{ rotate: "45deg" }],
          width: w * 0.55,
        }}
      />
      {/* Base */}
      <View
        style={{
          borderColor: colore,
          borderTopWidth: 0,
          borderWidth: stroke,
          height: w * 0.45,
          marginTop: -w * 0.15,
          width: w * 0.6,
        }}
      />
    </View>
  );
}

export function IconaMondo({ colore, size = 28 }: { colore: string; size?: number }): ReactElement {
  const stroke = 1.8;
  const d = size * 0.75;

  return (
    <View style={[styles.box, { height: size, width: size }]}>
      <View
        style={{
          alignItems: "center",
          borderColor: colore,
          borderRadius: 999,
          borderWidth: stroke,
          height: d,
          justifyContent: "center",
          width: d,
        }}
      >
        {/* Equator */}
        <View
          style={{
            backgroundColor: colore,
            height: stroke * 0.8,
            position: "absolute",
            width: "100%",
          }}
        />
        {/* Prime meridian oval */}
        <View
          style={{
            borderColor: colore,
            borderRadius: 999,
            borderWidth: stroke * 0.8,
            height: "100%",
            width: "50%",
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
});
