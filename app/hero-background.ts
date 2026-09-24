import type { CSSProperties } from "react";

export function heroBackgroundStyle(image: string, visibility: number): CSSProperties {
  const strength = Number.isFinite(visibility) ? Math.min(1, Math.max(0, visibility)) : 0.55;
  const overlay = Math.round((1 - strength) * 100) / 100;
  return {
    backgroundImage: image
      ? `linear-gradient(90deg,rgba(230,243,250,${overlay}),rgba(223,239,248,${overlay})),url('${image}')`
      : "linear-gradient(90deg,#e6f3fa,#dfeff8)",
    backgroundSize: "cover",
  };
}
