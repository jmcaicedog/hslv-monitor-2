"use client";

// Polyfill defensivo para entornos donde crypto.randomUUID no existe.
if (typeof globalThis !== "undefined") {
  const g = globalThis;

  const fallbackRandomUUID = () => {
    if (g.crypto && typeof g.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      g.crypto.getRandomValues(bytes);

      // RFC 4122 v4
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}${hex.slice(4, 6).join("")}-${hex
        .slice(6, 8)
        .join("")}-${hex.slice(8, 10).join("")}-${hex
        .slice(10, 12)
        .join("")}-${hex.slice(12, 16).join("")}`;
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  if (typeof g.crypto === "object" && g.crypto !== null) {
    if (typeof g.crypto.randomUUID !== "function") {
      Object.defineProperty(g.crypto, "randomUUID", {
        value: fallbackRandomUUID,
        configurable: true,
      });
    }
  } else {
    g.crypto = {
      randomUUID: fallbackRandomUUID,
      getRandomValues: undefined,
    };
  }
}
