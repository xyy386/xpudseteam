"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { PhotoLayout } from "../content";
import { featureLayouts, gridLayouts, mobileGridLayouts, layoutStyle, movePhoto, resizePhoto, safeLayout, type ResizeHandle } from "../photo-layout";
import { MarkdownInline } from "../markdown";

type Item = { label: string; image: string; layout?: PhotoLayout };
type Drag = { index: number; mode: "move" | ResizeHandle; startX: number; startY: number; origin: PhotoLayout; latest: PhotoLayout };
const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function PhotoComposer({ title, items, mobile, onLayout, onPreset, onAdd, onUpload, onEdit, onReorder, onDelete }: {
  title: string;
  items: Item[];
  mobile: boolean;
  onLayout: (index: number, layout: PhotoLayout) => void;
  onPreset: (layouts: PhotoLayout[]) => void;
  onAdd: () => void;
  onUpload: (index: number, file: File) => void;
  onEdit: (index: number) => void;
  onReorder: (index: number, step: number) => void;
  onDelete: (index: number) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [moving, setMoving] = useState<{ index: number; layout: PhotoLayout } | null>(null);
  const [selected, setSelected] = useState<number | null>(items.length ? 0 : null);
  const defaults = mobile ? mobileGridLayouts(items.length) : gridLayouts(items.length);
  const selectedIndex = selected !== null && selected < items.length ? selected : null;
  const selectedLayout = selectedIndex === null ? null : moving?.index === selectedIndex ? moving.layout : safeLayout(items[selectedIndex].layout, defaults[selectedIndex]);

  function begin(event: PointerEvent<HTMLElement>, index: number, mode: Drag["mode"], origin: PhotoLayout) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, mode, startX: event.clientX, startY: event.clientY, origin, latest: origin };
    setSelected(index);
    setMoving({ index, layout: origin });
  }

  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    const bounds = canvas.current?.getBoundingClientRect();
    if (!current || !bounds) return;
    const dx = (event.clientX - current.startX) * 100 / bounds.width;
    const dy = (event.clientY - current.startY) * 100 / bounds.height;
    const next = current.mode === "move" ? movePhoto(current.origin, dx, dy) : resizePhoto(current.origin, current.mode, dx, dy);
    current.latest = next;
    setMoving({ index: current.index, layout: next });
  }

  function finish(event: PointerEvent<HTMLElement>, save: boolean) {
    const current = drag.current;
    if (!current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setMoving(null);
    if (save && JSON.stringify(current.latest) !== JSON.stringify(current.origin)) onLayout(current.index, current.latest);
  }

  function control(label: string, key: keyof PhotoLayout, max: number) {
    if (selectedIndex === null || !selectedLayout) return null;
    const min = key === "w" || key === "h" ? 14 : 0;
    const value = Math.round(selectedLayout[key] * 10) / 10;
    function change(next: number) {
      if (!Number.isFinite(next) || selectedIndex === null || !selectedLayout) return;
      onLayout(selectedIndex, safeLayout({ ...selectedLayout, [key]: Math.min(max, Math.max(min, next)) }, selectedLayout));
    }
    return <label className="photo-composer-value" key={key}><span>{label}</span><input type="range" min={min} max={max} step="0.5" value={value} onChange={(event) => change(Number(event.target.value))} /><input type="number" min={min} max={max} step="0.5" value={value} onChange={(event) => change(Number(event.target.value))} /><small>%</small></label>;
  }

  return <div className={`photo-composer${mobile ? " is-mobile" : ""}`}>
    <div className="photo-composer-head"><div><h4>{title} · {mobile ? "手机" : "电脑"}自由排版</h4><p>点选照片，拖动照片本身改变位置；拉动边角控制尺寸，也可在下方精确调整。</p></div><div>
      <button type="button" onClick={() => onPreset(mobile ? mobileGridLayouts(items.length) : gridLayouts(items.length))} disabled={!items.length}>整齐网格</button>
      <button type="button" onClick={() => onPreset(featureLayouts(items.length))} disabled={items.length < 2}>一大多小</button>
      <button type="button" onClick={() => { setSelected(items.length); onAdd(); }}>＋ 添加照片</button>
    </div></div>
    <div className="photo-composer-canvas" ref={canvas} style={{ aspectRatio: mobile ? items.length > 6 ? "3 / 5" : "3 / 4" : items.length > 6 ? "3 / 2" : "16 / 9" }}>
      {items.length ? items.map((item, index) => {
        const layout = moving?.index === index ? moving.layout : safeLayout(item.layout, defaults[index]);
        const isSelected = selectedIndex === index;
        return <div className={`photo-composer-tile${moving?.index === index ? " is-moving" : ""}${isSelected ? " is-selected" : ""}`} key={index} style={layoutStyle(layout)} onClick={() => setSelected(index)}>
          <div className="photo-composer-image" onPointerDown={(event) => begin(event, index, "move", layout)} onPointerMove={move} onPointerUp={(event) => finish(event, true)} onPointerCancel={(event) => finish(event, false)}>{item.image ? <img src={item.image} alt="" draggable={false} /> : <span>照片 {index + 1} 待上传</span>}</div>
          <button className="photo-composer-drag" type="button" aria-label={`拖动第 ${index + 1} 张照片`} onPointerDown={(event) => begin(event, index, "move", layout)} onPointerMove={move} onPointerUp={(event) => finish(event, true)} onPointerCancel={(event) => finish(event, false)}>⠿ <MarkdownInline source={item.label || `照片 ${index + 1}`} /></button>
          <div className="photo-composer-controls"><label>换图<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(index, file); event.target.value = ""; }} /></label><button type="button" onClick={() => onEdit(index)}>文字与图片</button></div>
          {isSelected && handles.map((handle) => <button className={`photo-composer-handle handle-${handle}`} key={handle} type="button" aria-label={`从${handle}方向调整第 ${index + 1} 张照片`} onPointerDown={(event) => begin(event, index, handle, layout)} onPointerMove={move} onPointerUp={(event) => finish(event, true)} onPointerCancel={(event) => finish(event, false)} />)}
        </div>;
      }) : <p className="photo-composer-empty">这里还没有照片。点击“添加照片”开始组合。</p>}
    </div>
    {selectedIndex !== null && selectedLayout && <div className="photo-composer-inspector"><div className="photo-composer-inspector-head"><strong>已选中：<MarkdownInline source={items[selectedIndex].label || `照片 ${selectedIndex + 1}`} /></strong><div><button type="button" onClick={() => { onReorder(selectedIndex, -1); setSelected(selectedIndex - 1); }} disabled={selectedIndex === 0}>下移一层</button><button type="button" onClick={() => { onReorder(selectedIndex, 1); setSelected(selectedIndex + 1); }} disabled={selectedIndex === items.length - 1}>上移一层</button><button type="button" onClick={() => onEdit(selectedIndex)}>编辑文字</button><button type="button" className="delete" onClick={() => { onDelete(selectedIndex); setSelected(null); }}>删除照片</button></div></div><div className="photo-composer-values">
      {control("横向位置", "x", 100 - selectedLayout.w)}
      {control("纵向位置", "y", 100 - selectedLayout.h)}
      {control("宽度", "w", 100 - selectedLayout.x)}
      {control("高度", "h", 100 - selectedLayout.y)}
    </div></div>}
  </div>;
}
