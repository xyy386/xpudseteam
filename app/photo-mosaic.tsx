import type { CSSProperties } from "react";
import type { PhotoLayout } from "./content";
import { gridLayouts, mobileGridLayouts, layoutStyle, safeLayout } from "./photo-layout";
import { MarkdownInline, MarkdownText } from "./markdown";

type MosaicItem = { title: string; description: string; image: string; url?: string; layout?: PhotoLayout; layoutMobile?: PhotoLayout };

export function PhotoMosaic({ items, kind }: { items: MosaicItem[]; kind: "paper" | "gallery" }) {
  if (!items.length) return null;
  const defaults = gridLayouts(items.length);
  const mobileDefaults = mobileGridLayouts(items.length);
  return <div className={`photo-mosaic photo-mosaic--${kind}`} style={{ aspectRatio: items.length > 6 ? "3 / 2" : "16 / 9", "--photo-mobile-aspect": items.length > 6 ? "3 / 5" : "3 / 4" } as CSSProperties}>
    {items.map((item, index) => {
      const mobile = safeLayout(item.layoutMobile, mobileDefaults[index]);
      const style = { ...layoutStyle(safeLayout(item.layout, defaults[index])), "--photo-mobile-x": `${mobile.x}%`, "--photo-mobile-y": `${mobile.y}%`, "--photo-mobile-w": `${mobile.w}%`, "--photo-mobile-h": `${mobile.h}%` } as CSSProperties;
      return <article className="photo-mosaic-item" key={index} style={style}>
      <div className="photo-mosaic-image">{item.image && <img src={item.image} alt={item.title} loading="lazy" />}</div>
      <div className="photo-mosaic-caption"><small>{String(index + 1).padStart(2, "0")}</small><h3>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer"><MarkdownInline source={item.title} /> ↗</a> : <MarkdownInline source={item.title} />}</h3>{item.description && <MarkdownText source={item.description} />}</div>
    </article>;})}
  </div>;
}
