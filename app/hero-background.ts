import type { CSSProperties } from "react";

export function heroBackgroundStyle(image: string, visibility: number): CSSProperties {
  const strength = Number.isFinite(visibility) ? Math.min(1, Math.max(0, visibility)) : 0.55;
  // Both columns contain reading text; retain a light wash even at full image strength.
  const readingOverlay = 1 - strength * 0.1;
  const imageOverlay = 1 - strength * 0.2;
  return {
    backgroundImage: image
      ? `linear-gradient(90deg,rgba(255,255,255,${readingOverlay}),rgba(255,255,255,${imageOverlay})),url('${image}')`
      : "none",
    backgroundColor: "#f5f6f8",
    backgroundSize: "cover",
  };
}
