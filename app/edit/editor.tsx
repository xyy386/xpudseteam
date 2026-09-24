"use client";

import { useEffect, useRef, useState, useId } from "react";
import type { SiteContent, DirectionItem, ArchiveItem, CustomSection, SubsectionItem, Appearance, PhotoLayout } from "../content";
import { defaultAppearance, defaultMobileAppearance } from "../appearance-defaults";
import { MarkdownInline, MarkdownText } from "../markdown";
import { LivePreview } from "./live-preview";
import { PhotoComposer } from "./photo-composer";

type Path = Array<string | number>;

function Field({ label, value, onChange, long = false, inline = false }: { label: string; value: string; onChange: (value: string) => void; long?: boolean; inline?: boolean }) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  function insert(before: string, after = "", placeholder = "文字") {
    const element = input.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    onChange(`${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`);
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }
  if (!long) return <label className="editor-field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} />{/\$|\*|`|\[.+\]\(/.test(value) && <span className="editor-inline-preview"><small>格式预览</small><MarkdownInline source={value} /></span>}</label>;
  return <div className="editor-field editor-markdown-field"><label htmlFor={id}>{label}</label>
    <div className="editor-markdown-toolbar" aria-label={`${label} Markdown 工具`}>
      <button type="button" onClick={() => insert("**", "**")}>加粗</button>
      <button type="button" onClick={() => insert("*", "*")}>斜体</button>
      <button type="button" onClick={() => insert("$", "$", "x^2+y^2")}>行内公式</button>
      {inline ? <button type="button" onClick={() => insert("\n", "", "")}>换行</button> : <>
        <button type="button" onClick={() => insert("### ", "", "小标题")}>小标题</button>
        <button type="button" onClick={() => insert("- ", "", "列表项")}>列表</button>
        <button type="button" onClick={() => insert("[", "](#)", "链接文字")}>链接</button>
        <button type="button" onClick={() => insert("\n\n$$\n", "\n$$\n\n", "\\frac{du}{dt}=f(u)")}>独立公式</button>
      </>}
    </div>
    <div className="editor-markdown-layout"><textarea id={id} ref={input} value={value} onChange={(event) => onChange(event.target.value)} rows={6} spellCheck={false} /><div className="editor-markdown-preview"><small>即时预览</small>{inline ? <div className="markdown-content"><MarkdownInline source={value || "*在左侧输入 Markdown*"} /></div> : <MarkdownText source={value || "*在左侧输入 Markdown*"} />}</div></div>
  </div>;
}

function SizeControl({ label, value, min, max, step = 1, unit = "px", onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (value: number) => void;
}) {
  return <label className="editor-size-control"><span>{label}</span><div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => {
      const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
    }} />
    <small>{unit}</small>
  </div></label>;
}

function Editor({ initial }: { initial: SiteContent }) {
  const [content, setContent] = useState<SiteContent>(initial);
  const contentRef = useRef(initial);
  const savedRef = useRef(JSON.stringify(initial));
  const undoRef = useRef<SiteContent[]>([]);
  const redoRef = useRef<SiteContent[]>([]);
  const lastEditRef = useRef({ key: "", at: 0 });
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggingImage, setDraggingImage] = useState("");
  const [mobileMode, setMobileMode] = useState(false);
  const [previewView, setPreviewView] = useState("home");
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [previewFocusPath, setPreviewFocusPath] = useState("");

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  function commit(change: (draft: SiteContent) => void, groupKey = "") {
    const previous = contentRef.current;
    const next = structuredClone(previous);
    change(next);
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    const now = Date.now();
    if (!groupKey || lastEditRef.current.key !== groupKey || now - lastEditRef.current.at > 800) {
      undoRef.current.push(previous);
      if (undoRef.current.length > 40) undoRef.current.shift();
    }
    lastEditRef.current = { key: groupKey, at: now };
    redoRef.current = [];
    contentRef.current = next;
    setContent(next);
    setHistory({ undo: undoRef.current.length > 0, redo: false });
    setDirty(JSON.stringify(next) !== savedRef.current);
    setStatus("有未保存的修改");
  }

  function selectPreview(path: Path, value?: unknown) {
    const [root, key, field] = path;
    if (root === "appearance" || root === "appearanceMobile" || root === "pageText") return;
    setPreviewFocusPath(path.join("."));
    if (root === "members") { setPreviewView("team"); setActiveItemIndex(typeof key === "number" ? key : null); return; }
    if (root === "directions") { setPreviewView("research"); setActiveItemIndex(typeof key === "number" ? key : null); return; }
    if (root === "archives") {
      const section = typeof key === "number" ? contentRef.current.archives[key] : null;
      const destination = field === "homeAnchor" && typeof value === "string" ? value : section?.homeAnchor ?? "other";
      setPreviewView(destination); setActiveItemIndex(typeof key === "number" ? key : null); return;
    }
    if (root === "customSections") {
      const section = typeof key === "number" ? contentRef.current.customSections[key] : null;
      if (section) setPreviewView(`custom-${section.id}`);
      setActiveItemIndex(null); return;
    }
    if (root === "contact" || root === "contactDetails") { setPreviewView("contact"); setActiveItemIndex(null); return; }
    if ((root === "sectionTitles" || root === "sectionIntros") && typeof key === "string") { setPreviewView(key); setActiveItemIndex(null); return; }
    if (root === "backgrounds" || root === "backgroundVisibility") { setPreviewView(String(key)); setActiveItemIndex(null); return; }
    setPreviewView("home"); setActiveItemIndex(null);
  }

  function write(path: Path, value: unknown) {
    selectPreview(path, value);
    commit((next) => {
      let target: Record<string | number, unknown> = next as unknown as Record<string | number, unknown>;
      for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, unknown>;
      target[path[path.length - 1]] = value;
    }, path.join("."));
  }

  function add(path: Path, item: unknown) {
    selectPreview(path);
    commit((next) => {
      let target: Record<string | number, unknown> = next as unknown as Record<string | number, unknown>;
      for (const key of path) target = target[key] as Record<string | number, unknown>;
      (target as unknown as unknown[]).push(item);
    });
  }

  function remove(path: Path, index: number) {
    selectPreview(path);
    commit((next) => {
      let target: Record<string | number, unknown> = next as unknown as Record<string | number, unknown>;
      for (const key of path) target = target[key] as Record<string | number, unknown>;
      (target as unknown as unknown[]).splice(index, 1);
    });
  }

  function move(path: Path, index: number, step: number) {
    selectPreview(path);
    commit((next) => {
      let target: Record<string | number, unknown> = next as unknown as Record<string | number, unknown>;
      for (const key of path) target = target[key] as Record<string | number, unknown>;
      const list = target as unknown as unknown[];
      const destination = index + step;
      if (destination < 0 || destination >= list.length) return;
      [list[index], list[destination]] = [list[destination], list[index]];
    });
  }

  function arrange(path: Path, layouts: PhotoLayout[], key: "layout" | "layoutMobile") {
    selectPreview(path);
    commit((next) => {
      let target: Record<string | number, unknown> = next as unknown as Record<string | number, unknown>;
      for (const key of path) target = target[key] as Record<string | number, unknown>;
      (target as unknown as Array<{ layout?: PhotoLayout; layoutMobile?: PhotoLayout }>).forEach((item, index) => { item[key] = layouts[index]; });
    });
  }

  function addCustomSection(scrollToEditor = false) {
    const id = crypto.randomUUID();
    const index = contentRef.current.customSections.length;
    add(["customSections"], { id, title: "新栏目", english: "NEW SECTION", intro: "", body: "", image: "", items: [], subsections: [] } satisfies CustomSection);
    setPreviewView(`custom-${id}`);
    setActiveItemIndex(null);
    setPreviewFocusPath("");
    if (scrollToEditor) requestAnimationFrame(() => jump("custom", index));
    return id;
  }

  function jumpToImage(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function jumpToSubsection(id: string) {
    const current = contentRef.current;
    const directionIndex = current.directions.findIndex((item) => item.subsections.some((child) => child.id === id));
    const archiveIndex = current.archives.findIndex((item) => item.subsections.some((child) => child.id === id));
    const customIndex = current.customSections.findIndex((item) => item.subsections.some((child) => child.id === id));
    if (directionIndex >= 0) { setPreviewView("research"); setActiveItemIndex(directionIndex); setPreviewFocusPath(`directions.${directionIndex}.subsections.${current.directions[directionIndex].subsections.findIndex((child) => child.id === id)}`); }
    else if (archiveIndex >= 0) { setPreviewView(current.archives[archiveIndex].homeAnchor); setActiveItemIndex(archiveIndex); setPreviewFocusPath(`archives.${archiveIndex}.subsections.${current.archives[archiveIndex].subsections.findIndex((child) => child.id === id)}`); }
    else if (customIndex >= 0) { setPreviewView(`custom-${current.customSections[customIndex].id}`); setActiveItemIndex(null); setPreviewFocusPath(`customSections.${customIndex}.subsections.${current.customSections[customIndex].subsections.findIndex((child) => child.id === id)}`); }
    const target = document.getElementById(`editor-subsection-${id}`);
    const parent = target?.closest("details");
    if (parent) parent.open = true;
    requestAnimationFrame(() => target?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function restore(which: "undo" | "redo") {
    const source = which === "undo" ? undoRef.current : redoRef.current;
    const target = which === "undo" ? redoRef.current : undoRef.current;
    const next = source.pop();
    if (!next) return;
    target.push(contentRef.current);
    contentRef.current = next;
    setContent(next);
    lastEditRef.current = { key: "", at: 0 };
    setHistory({ undo: undoRef.current.length > 0, redo: redoRef.current.length > 0 });
    const hasChanges = JSON.stringify(next) !== savedRef.current;
    setDirty(hasChanges);
    setStatus(hasChanges ? "有未保存的修改" : "已恢复到上次保存的内容");
  }

  function jump(section: string, index?: number) {
    setPreviewFocusPath("");
    if (section === "home") { setPreviewView("home"); setActiveItemIndex(null); }
    if (section === "members") { setPreviewView("team"); setActiveItemIndex(index ?? null); }
    if (section === "directions") { setPreviewView("research"); setActiveItemIndex(index ?? null); }
    if (section === "archives") { setPreviewView(index === undefined ? "outcomes" : contentRef.current.archives[index]?.homeAnchor ?? "outcomes"); setActiveItemIndex(index ?? null); }
    if (section === "custom" && index !== undefined) { setPreviewView(`custom-${contentRef.current.customSections[index]?.id}`); setActiveItemIndex(null); }
    if (section === "contact") { setPreviewView("contact"); setActiveItemIndex(null); }
    const element = document.getElementById(`editor-${section}`) as HTMLDetailsElement | null;
    if (!element) return;
    element.open = true;
    requestAnimationFrame(() => {
      const target = index === undefined ? element : document.getElementById(`editor-${section}-${index}`) ?? element;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function upload(file: File, path: Path) {
    setStatus(`正在上传 ${file.name}…`);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch("/api/media", { method: "POST", body: form });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "上传失败");
      write(path, result.url);
      setStatus("图片已上传，请点击“保存全部修改”使其显示在网站上");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "上传失败");
    }
  }

  async function save() {
    setBusy(true);
    setStatus("正在保存…");
    const snapshot = JSON.stringify(contentRef.current);
    try {
      const response = await fetch("/api/site-content", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: snapshot,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "保存失败");
      savedRef.current = snapshot;
      const hasChanges = JSON.stringify(contentRef.current) !== snapshot;
      setDirty(hasChanges);
      setStatus(hasChanges ? "已保存刚才的内容；还有新的修改待保存" : "已保存。网站预览刷新后即可查看最新内容。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  const editField = (label: string, path: Path, value: string, long = false, inline = false) =>
    <Field label={label} value={value} onChange={(next) => write(path, next)} long={long} inline={inline} />;
  const imageField = (label: string, path: Path, value: string) => {
    const key = path.join(".");
    return <div className={`editor-image-field${draggingImage === key ? " is-dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDraggingImage(key); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingImage(""); }}
      onDrop={(event) => { event.preventDefault(); setDraggingImage(""); const file = event.dataTransfer.files[0]; if (file) void upload(file, path); }}
      onPaste={(event) => { const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/")); if (file) { event.preventDefault(); void upload(file, path); } }}>
      <span>{label}</span><div className="editor-image-drop">{value ? <img src={value} alt="当前图片预览" /> : <span>把图片拖到这里，或粘贴截图</span>}</div>
      <input aria-label={`${label}图片地址`} value={value} onChange={(event) => write(path, event.target.value)} placeholder="图片地址，也可拖入或上传" />
      <div className="editor-image-actions"><label className="editor-upload">选择图片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => {
        const file = event.target.files?.[0]; if (file) void upload(file, path); event.target.value = "";
      }} /></label>{value && <button type="button" onClick={() => write(path, "")}>移除图片</button>}</div></div>;
  };
  const visibilityField = (label: string, key: keyof SiteContent["backgroundVisibility"]) =>
    <label className="editor-range"><span>{label}显示强度：{Math.round(content.backgroundVisibility[key] * 100)}%</span><input type="range" min="0.05" max="0.45" step="0.01" value={content.backgroundVisibility[key]} onChange={(event) => write(["backgroundVisibility", key], Number(event.target.value))} /></label>;
  const appearanceKey = mobileMode ? "appearanceMobile" : "appearance";
  const selectedAppearance = content[appearanceKey];
  const newsOptions = content.archives.filter((item) => item.homeAnchor === "news");
  const featuredNews = newsOptions.find((item) => item.slug === content.hero.featureTargetSlug);
  const sizeField = (label: string, key: keyof Appearance, min: number, max: number, step = 1, unit = "px") =>
    <SizeControl label={label} value={selectedAppearance[key] as number} min={min} max={max} step={step} unit={unit} onChange={(value) => write([appearanceKey, key], value)} />;
  const subsectionEditor = (path: Path, subsections: SubsectionItem[]) => <>
    {subsections.map((section, index) => <div className="editor-subsection" id={`editor-subsection-${section.id}`} key={section.id}>
      <div className="editor-item-head"><h4>{section.title || `子栏目 ${index + 1}`}</h4><div><button type="button" onClick={() => move(path, index, -1)}>上移</button><button type="button" onClick={() => move(path, index, 1)}>下移</button><button type="button" onClick={() => remove(path, index)}>删除</button></div></div>
      {editField("子栏目标题", [...path, index, "title"], section.title, true, true)}
      {editField("内容介绍", [...path, index, "body"], section.body, true)}
      {editField("详情链接", [...path, index, "url"], section.url)}
      {imageField("子栏目主图", [...path, index, "image"], section.image)}
      <PhotoComposer title="子栏目图片组合" mobile={mobileMode} items={section.items.map((item) => ({ label: item.title, image: item.image, layout: mobileMode ? item.layoutMobile : item.layout }))} onLayout={(itemIndex, layout) => write([...path, index, "items", itemIndex, mobileMode ? "layoutMobile" : "layout"], layout)} onPreset={(layouts) => arrange([...path, index, "items"], layouts, mobileMode ? "layoutMobile" : "layout")} onAdd={() => add([...path, index, "items"], { title: "新图片", description: "", image: "", url: "" })} onUpload={(itemIndex, file) => void upload(file, [...path, index, "items", itemIndex, "image"])} onEdit={(itemIndex) => jumpToImage(`editor-subsection-${section.id}-image-${itemIndex}`)} onReorder={(itemIndex, step) => move([...path, index, "items"], itemIndex, step)} onDelete={(itemIndex) => remove([...path, index, "items"], itemIndex)} />
      {section.items.map((item, itemIndex) => <div className="editor-subitem" id={`editor-subsection-${section.id}-image-${itemIndex}`} key={itemIndex}>{editField("图片标题", [...path, index, "items", itemIndex, "title"], item.title)}{editField("图片说明", [...path, index, "items", itemIndex, "description"], item.description, true)}{editField("图片链接", [...path, index, "items", itemIndex, "url"], item.url)}{imageField("照片", [...path, index, "items", itemIndex, "image"], item.image)}<button type="button" onClick={() => remove([...path, index, "items"], itemIndex)}>删除图片</button></div>)}
    </div>)}
    <button type="button" className="editor-add editor-add-subsection" onClick={() => {
      const id = crypto.randomUUID();
      add(path, { id, title: "新子栏目", body: "", image: "", url: "", items: [] } satisfies SubsectionItem);
      setPreviewFocusPath([...path, subsections.length].join("."));
      requestAnimationFrame(() => document.getElementById(`editor-subsection-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }}>＋ 添加子栏目</button>
  </>;

  return <main className="editor-page">
    <div className="editor-top"><div><p className="editor-eyebrow">SITE EDITOR / 本地预览</p><h1>编辑科研团队网站</h1><p>边改边看效果；确认后点击“保存全部修改”，网站页面刷新后就会更新。</p></div><a href="/" target="_blank" rel="noopener noreferrer">打开网站 ↗</a></div>
    <div className="editor-sticky"><span role="status" className={dirty ? "is-dirty" : ""}>{status || "修改将保存在本地站点资料库"}</span><div className="editor-sticky-actions"><button type="button" className="editor-history" onClick={() => restore("undo")} disabled={!history.undo} title="撤销上一步修改">撤销</button><button type="button" className="editor-history" onClick={() => restore("redo")} disabled={!history.redo} title="恢复已撤销的修改">重做</button><button type="button" onClick={() => void save()} disabled={busy || !dirty}>{busy ? "保存中…" : dirty ? "保存全部修改" : "已保存"}</button></div></div>
    <nav className="editor-jump" aria-label="快速定位编辑栏目">{[["home", "首页"], ["appearance", "字体与图片"], ["members", "团队成员"], ["directions", "研究方向"], ["archives", "成果、动态与其他"], ["custom", "自定义栏目"], ["contact", "联系我们"], ["sections", "栏目与底图"], ["pages", "详情页文字"]].map(([key, label]) => <button type="button" key={key} onClick={() => jump(key)}>{label}</button>)}</nav>
    <div className="editor-workspace">
    <LivePreview content={content} view={previewView} activeItemIndex={activeItemIndex} focusPath={previewFocusPath} onViewChange={(view) => { setPreviewView(view); setActiveItemIndex(null); setPreviewFocusPath(""); }} onEdit={jump} onEditSubsection={jumpToSubsection} onAddCustomSection={() => addCustomSection()} mobile={mobileMode} onModeChange={setMobileMode} />
    <div className="editor-panels">
      <details id="editor-appearance" open><summary>字体、排版与图片尺寸</summary><div className="editor-panel-body">
        <div className="editor-device-settings"><div><strong>正在调整：{mobileMode ? "手机端" : "电脑端"}</strong><span>两套尺寸分开保存，切换上方预览也会同步切换这里。</span></div><div><button type="button" className={!mobileMode ? "active" : ""} onClick={() => setMobileMode(false)}>电脑端</button><button type="button" className={mobileMode ? "active" : ""} onClick={() => setMobileMode(true)}>手机端</button><button type="button" className="editor-reset" onClick={() => write([appearanceKey], structuredClone(mobileMode ? defaultMobileAppearance : defaultAppearance))}>恢复默认</button></div></div>
        <label className="editor-field"><span>正文字体</span><select value={selectedAppearance.bodyFont} onChange={(event) => write([appearanceKey, "bodyFont"], event.target.value)}><option value="sans">现代黑体</option><option value="serif">宋体</option><option value="kai">楷体</option></select></label>
        <label className="editor-field"><span>标题字体</span><select value={selectedAppearance.headingFont} onChange={(event) => write([appearanceKey, "headingFont"], event.target.value)}><option value="serif">宋体</option><option value="sans">现代黑体</option><option value="kai">楷体</option></select></label>
        {sizeField("正文大小", "bodySize", 13, 22)}
        {sizeField("段落行距", "lineHeight", 1.35, 2.2, .05, "倍")}
        {sizeField("首页主标题大小", "heroTitleSize", mobileMode ? 30 : 42, mobileMode ? 60 : 88)}
        {sizeField("栏目标题大小", "sectionTitleSize", mobileMode ? 22 : 26, mobileMode ? 40 : 48)}
        {sizeField("成员介绍字号", "memberTextSize", 12, 21)}
        {sizeField("研究方向文字字号", "directionTextSize", 13, 22)}
        {sizeField("成果与动态文字字号", "moduleTextSize", 13, 22)}
        <h3>图片显示</h3>
        <label className="editor-field"><span>图片填充方式</span><select value={selectedAppearance.imageFit} onChange={(event) => write([appearanceKey, "imageFit"], event.target.value)}><option value="cover">铺满卡片（可能裁切）</option><option value="contain">完整显示（可能留白）</option></select></label>
        {sizeField("成员照片高度", "memberPhotoHeight", 160, 420)}
        {sizeField("研究方向封面高度", "directionImageHeight", 160, 420)}
        {sizeField("成果封面高度", "outcomeImageHeight", 160, 420)}
        {sizeField("动态封面高度", "newsImageHeight", 160, 420)}
        {sizeField("首页右侧新闻图片高度", "heroNewsImageHeight", 160, 420)}
        {sizeField("研究方向详情主图高度", "detailImageHeight", 200, 520)}
        {sizeField("研究主题图片高度", "topicImageHeight", 120, 360)}
        <p className="editor-help">论文和成果详情中的多张照片，请在各自的图片组合区拖动、缩放并分别调整电脑和手机排版。文字框支持 Markdown 与数学公式；行内公式写作 $x^2$，独立公式写作 $$…$$。</p>
      </div></details>
      <details id="editor-home" open><summary>站点名称与首页</summary><div className="editor-panel-body">
        {editField("团队名称", ["siteName"], content.siteName, true, true)}
        {editField("机构名称", ["institution"], content.institution)}
        {editField("首页英文短语", ["hero", "eyebrow"], content.hero.eyebrow)}
        {editField("首页主标题（换行会保留）", ["hero", "title"], content.hero.title, true, true)}
        {editField("首页副标题", ["hero", "subtitle"], content.hero.subtitle, true, true)}
        {editField("首页介绍", ["hero", "detail"], content.hero.detail, true)}
        {imageField("首页背景图", ["hero", "background"], content.hero.background)}
        <SizeControl label="首页背景图可见度" value={Math.round(content.hero.backgroundVisibility * 100)} min={0} max={100} unit="%" onChange={(value) => write(["hero", "backgroundVisibility"], value / 100)} />
        <p className="editor-help">0% 为纯浅蓝底色，100% 为原图；可在实时预览区查看调整效果。</p>
        <h3>首页右侧最新动态</h3>
        <label className="editor-field"><span>点击卡片后打开</span><select value={content.hero.featureTargetSlug} onChange={(event) => write(["hero", "featureTargetSlug"], event.target.value)}>
          <option value="">团队动态栏目</option>
          {newsOptions.map((item) => <option value={item.slug} key={item.slug}>{item.title}</option>)}
          {content.hero.featureTargetSlug && !featuredNews && <option value={content.hero.featureTargetSlug}>原链接已失效，请重新选择</option>}
        </select></label>
        <div className="editor-feature-source"><span>可单独修改下方文案和图片；选择链接后也可引用该子栏目的现有内容。</span><button type="button" disabled={!featuredNews} onClick={() => {
          if (!featuredNews) return;
          selectPreview(["hero", "featureTitle"]);
          commit((next) => {
            next.hero.featureLabel = featuredNews.english;
            next.hero.featureTitle = featuredNews.title;
            next.hero.featureText = featuredNews.summary || featuredNews.description;
            if (featuredNews.cover) next.hero.featureImage = featuredNews.cover;
          });
        }}>引用所选动态内容</button></div>
        {editField("栏目提示", ["hero", "featureLabel"], content.hero.featureLabel)}
        {editField("标题", ["hero", "featureTitle"], content.hero.featureTitle, true, true)}
        {editField("简介", ["hero", "featureText"], content.hero.featureText, true)}
        {imageField("新闻照片或论文封面", ["hero", "featureImage"], content.hero.featureImage)}
      </div></details>

      <details id="editor-sections"><summary>栏目说明与页面底图</summary><div className="editor-panel-body">
        {Object.entries(content.sectionTitles).filter(([key]) => key !== "contact").map(([key, value]) => <div key={`title-${key}`}>{editField(`${{ team: "团队成员", research: "研究方向", outcomes: "研究成果", news: "团队动态", other: "其他", contact: "联系我们" }[key as keyof SiteContent["sectionTitles"]]}栏目标题`, ["sectionTitles", key], value, true, true)}</div>)}
        {Object.entries(content.sectionIntros).filter(([key]) => key !== "contact").map(([key, value]) => <div key={`intro-${key}`}>{editField(`${{ team: "团队成员", research: "研究方向", outcomes: "研究成果", news: "团队动态", other: "其他", contact: "联系我们" }[key as keyof SiteContent["sectionIntros"]]}栏目说明`, ["sectionIntros", key], value, true)}</div>)}
        <p className="editor-help">底图会以较低透明度显示；留空则使用晴空蓝渐变背景。</p>
        <div className="editor-presets"><span>可直接选用 PPT 中的底图：</span><button onClick={() => write(["backgrounds", "team"], "/campus-arch.jpeg")}>校园晴空 · 成员</button><button onClick={() => write(["backgrounds", "outcomes"], "/campus-sky.png")}>校园夕照 · 成果</button><button onClick={() => write(["backgrounds", "news"], "/ppt-sky-panel.png")}>晴空蓝版式 · 动态</button></div>
        {imageField("团队成员区底图", ["backgrounds", "team"], content.backgrounds.team)}
        {visibilityField("团队成员区底图", "team")}
        {imageField("研究成果区底图", ["backgrounds", "outcomes"], content.backgrounds.outcomes)}
        {visibilityField("研究成果区底图", "outcomes")}
        {imageField("团队动态区底图", ["backgrounds", "news"], content.backgrounds.news)}
        {visibilityField("团队动态区底图", "news")}
        {imageField("其他区底图", ["backgrounds", "other"], content.backgrounds.other)}
        {visibilityField("其他区底图", "other")}
      </div></details>

      <details id="editor-contact"><summary>联系我们 · 联系人和联系方式</summary><div className="editor-panel-body">
        {editField("栏目标题", ["sectionTitles", "contact"], content.sectionTitles.contact, true, true)}
        {editField("栏目说明", ["sectionIntros", "contact"], content.sectionIntros.contact, true)}
        {editField("联系信息介绍", ["contact"], content.contact, true)}
        {editField("联系人", ["contactDetails", "person"], content.contactDetails.person)}
        {editField("职务", ["contactDetails", "role"], content.contactDetails.role)}
        {editField("电子邮箱", ["contactDetails", "email"], content.contactDetails.email)}
        {editField("联系电话", ["contactDetails", "phone"], content.contactDetails.phone)}
        {editField("联系地址", ["contactDetails", "address"], content.contactDetails.address, true)}
        {editField("其他信息", ["contactDetails", "extra"], content.contactDetails.extra, true)}
      </div></details>

      <details id="editor-pages"><summary>详情页文字</summary><div className="editor-panel-body">
        {Object.entries(content.pageText).map(([key, value]) => <div key={`page-${key}`}>{editField(`${{
          researchNote: "研究方向提示", focusTitle: "研究内容标题", focusIntro: "研究内容说明",
          papersTitle: "论文展示标题", papersIntro: "论文展示说明", relatedTitle: "其他研究方向标题",
          galleryTitle: "图片资料标题", galleryIntro: "图片资料说明", tableTitle: "条目列表标题",
          tableIntro: "条目列表说明", moreTitle: "更多栏目标题",
        }[key as keyof SiteContent["pageText"]]}`, ["pageText", key], value, true, key.endsWith("Title"))}</div>)}
      </div></details>

      <details id="editor-members"><summary>团队成员 · {content.members.length} 位</summary><div className="editor-panel-body">
        {content.members.map((member, index) => <div className="editor-item" id={`editor-members-${index}`} key={index}><div className="editor-item-head"><h3>{member.name || `成员 ${index + 1}`}</h3><div><button onClick={() => move(["members"], index, -1)}>上移</button><button onClick={() => move(["members"], index, 1)}>下移</button><button onClick={() => remove(["members"], index)}>删除</button></div></div>
          {editField("姓名", ["members", index, "name"], member.name)}{editField("职称与身份", ["members", index, "role"], member.role)}{editField("研究领域", ["members", index, "focus"], member.focus, true)}{editField("学院简介链接", ["members", index, "url"], member.url)}{imageField("成员照片", ["members", index, "photo"], member.photo)}
        </div>)}
        <button className="editor-add" onClick={() => add(["members"], { name: "", role: "", focus: "", url: "", photo: "" })}>＋ 添加团队成员</button>
      </div></details>

      <details id="editor-directions"><summary>研究方向 · {content.directions.length} 项</summary><div className="editor-panel-body">
        {content.directions.map((direction, index) => <div className="editor-item" id={`editor-directions-${index}`} key={direction.slug}><div className="editor-item-head"><h3>{direction.title || `方向 ${index + 1}`}</h3><div><button onClick={() => move(["directions"], index, -1)}>上移</button><button onClick={() => move(["directions"], index, 1)}>下移</button><button onClick={() => remove(["directions"], index)}>删除</button></div></div>
          {editField("方向名称", ["directions", index, "title"], direction.title, true, true)}{editField("英文短标题", ["directions", index, "english"], direction.english)}{editField("方向介绍", ["directions", index, "summary"], direction.summary, true)}{editField("融入图片的数学公式", ["directions", index, "equation"], direction.equation, true)}{imageField("方向主图", ["directions", index, "image"], direction.image)}
          <h4>研究内容</h4>{direction.topics.map((topic, topicIndex) => <div className="editor-subitem" key={topicIndex}>{editField("小主题标题", ["directions", index, "topics", topicIndex, "title"], topic.title)}{editField("具体内容", ["directions", index, "topics", topicIndex, "detail"], topic.detail, true)}{imageField("主题示意图", ["directions", index, "topics", topicIndex, "image"], topic.image)}<button onClick={() => remove(["directions", index, "topics"], topicIndex)}>删除小主题</button></div>)}
          <button className="editor-add" onClick={() => add(["directions", index, "topics"], { title: "", detail: "", image: "" })}>＋ 添加小主题</button>
          <PhotoComposer title="论文与研究图片" mobile={mobileMode} items={direction.papers.map((paper) => ({ label: paper.title, image: paper.image, layout: mobileMode ? paper.layoutMobile : paper.layout }))} onLayout={(paperIndex, layout) => write(["directions", index, "papers", paperIndex, mobileMode ? "layoutMobile" : "layout"], layout)} onPreset={(layouts) => arrange(["directions", index, "papers"], layouts, mobileMode ? "layoutMobile" : "layout")} onAdd={() => add(["directions", index, "papers"], { title: "新图片", description: "", image: "", url: "" })} onUpload={(paperIndex, file) => void upload(file, ["directions", index, "papers", paperIndex, "image"])} onEdit={(paperIndex) => jumpToImage(`editor-direction-${index}-paper-${paperIndex}`)} onReorder={(paperIndex, step) => move(["directions", index, "papers"], paperIndex, step)} onDelete={(paperIndex) => remove(["directions", index, "papers"], paperIndex)} />
          <h4>论文与研究图片</h4>{direction.papers.map((paper, paperIndex) => <div className="editor-subitem" id={`editor-direction-${index}-paper-${paperIndex}`} key={paperIndex}>{editField("标题", ["directions", index, "papers", paperIndex, "title"], paper.title)}{editField("说明", ["directions", index, "papers", paperIndex, "description"], paper.description, true)}{editField("论文或详情链接", ["directions", index, "papers", paperIndex, "url"], paper.url)}{imageField("论文封面或结果图", ["directions", index, "papers", paperIndex, "image"], paper.image)}<button onClick={() => remove(["directions", index, "papers"], paperIndex)}>删除展示项</button></div>)}
          <button className="editor-add" onClick={() => add(["directions", index, "papers"], { title: "", description: "", image: "", url: "" })}>＋ 添加论文或图片</button>
          {subsectionEditor(["directions", index, "subsections"], direction.subsections)}
        </div>)}
        <button className="editor-add" onClick={() => add(["directions"], { slug: `direction-${Date.now()}`, title: "新研究方向", english: "RESEARCH", summary: "", image: "", equation: "", topics: [], papers: [], subsections: [] } satisfies DirectionItem)}>＋ 添加研究方向</button>
      </div></details>

      <details id="editor-archives"><summary>研究成果、团队动态与其他 · {content.archives.length} 个栏目</summary><div className="editor-panel-body">
        {content.archives.map((archive, index) => <div className="editor-item" id={`editor-archives-${index}`} key={archive.slug}><div className="editor-item-head"><h3>{archive.title}</h3><div><button onClick={() => move(["archives"], index, -1)}>上移</button><button onClick={() => move(["archives"], index, 1)}>下移</button><button onClick={() => remove(["archives"], index)}>删除</button></div></div>
          <label className="editor-field"><span>所属栏目</span><select value={archive.homeAnchor} onChange={(event) => { write(["archives", index, "homeAnchor"], event.target.value); write(["archives", index, "group"], event.target.value === "news" ? "团队动态" : event.target.value === "other" ? "其他" : "研究成果"); }}><option value="outcomes">研究成果</option><option value="news">团队动态</option><option value="other">其他</option></select></label>
          {editField("栏目标题", ["archives", index, "title"], archive.title, true, true)}{editField("英文短标题", ["archives", index, "english"], archive.english)}{editField("首页简述", ["archives", index, "summary"], archive.summary, true)}{editField("详情页介绍", ["archives", index, "description"], archive.description, true)}{imageField("首页栏目封面", ["archives", index, "cover"], archive.cover)}
          <PhotoComposer title="图片资料" mobile={mobileMode} items={archive.gallery.map((item) => ({ label: item.label, image: item.image, layout: mobileMode ? item.layoutMobile : item.layout }))} onLayout={(galleryIndex, layout) => write(["archives", index, "gallery", galleryIndex, mobileMode ? "layoutMobile" : "layout"], layout)} onPreset={(layouts) => arrange(["archives", index, "gallery"], layouts, mobileMode ? "layoutMobile" : "layout")} onAdd={() => add(["archives", index, "gallery"], { label: "新图片", image: "", caption: "" })} onUpload={(galleryIndex, file) => void upload(file, ["archives", index, "gallery", galleryIndex, "image"])} onEdit={(galleryIndex) => jumpToImage(`editor-archive-${index}-gallery-${galleryIndex}`)} onReorder={(galleryIndex, step) => move(["archives", index, "gallery"], galleryIndex, step)} onDelete={(galleryIndex) => remove(["archives", index, "gallery"], galleryIndex)} />
          <h4>图片资料</h4>{archive.gallery.map((item, galleryIndex) => <div className="editor-subitem" id={`editor-archive-${index}-gallery-${galleryIndex}`} key={galleryIndex}>{editField("图片标题", ["archives", index, "gallery", galleryIndex, "label"], item.label)}{editField("图片说明", ["archives", index, "gallery", galleryIndex, "caption"], item.caption, true)}{imageField("资料图片", ["archives", index, "gallery", galleryIndex, "image"], item.image)}<button onClick={() => remove(["archives", index, "gallery"], galleryIndex)}>删除图片位</button></div>)}
          <button className="editor-add" onClick={() => add(["archives", index, "gallery"], { label: "新图片", image: "", caption: "" })}>＋ 添加图片</button>
          <h4>条目表格</h4><div className="editor-columns">{archive.columns.map((column, columnIndex) => <Field key={columnIndex} label={`第 ${columnIndex + 1} 列`} value={column} onChange={(value) => write(["archives", index, "columns", columnIndex], value)} />)}</div>
          {archive.rows.map((row, rowIndex) => <div className="editor-subitem" key={rowIndex}><strong>第 {rowIndex + 1} 条</strong><div className="editor-columns">{archive.columns.map((column, columnIndex) => <Field key={columnIndex} label={column} value={row[columnIndex] ?? ""} onChange={(value) => write(["archives", index, "rows", rowIndex, columnIndex], value)} />)}</div><button onClick={() => remove(["archives", index, "rows"], rowIndex)}>删除条目</button></div>)}
          <button className="editor-add" onClick={() => add(["archives", index, "rows"], archive.columns.map(() => ""))}>＋ 添加表格条目</button>
          {subsectionEditor(["archives", index, "subsections"], archive.subsections)}
        </div>)}
        <button className="editor-add" onClick={() => add(["archives"], { slug: `archive-${Date.now()}`, group: "其他", homeAnchor: "other", title: "新栏目", english: "MORE", description: "", summary: "", cover: "", gallery: [], columns: ["标题", "内容", "链接"], rows: [], subsections: [] } satisfies ArchiveItem)}>＋ 添加成果 / 动态模块</button>
      </div></details>
      <button type="button" className="editor-add editor-add-section" onClick={() => addCustomSection(true)}>＋ 添加栏目</button>
      <details id="editor-custom" open><summary>自定义栏目 · {content.customSections.length} 个</summary><div className="editor-panel-body">
        {content.customSections.map((section, index) => <div className="editor-item" id={`editor-custom-${index}`} key={section.id}>
          <div className="editor-item-head"><h3>{section.title || `栏目 ${index + 1}`}</h3><div><button type="button" onClick={() => move(["customSections"], index, -1)}>上移</button><button type="button" onClick={() => move(["customSections"], index, 1)}>下移</button><button type="button" onClick={() => remove(["customSections"], index)}>删除栏目</button></div></div>
          {editField("栏目标题", ["customSections", index, "title"], section.title, true, true)}
          {editField("英文短标题", ["customSections", index, "english"], section.english)}
          {editField("栏目说明", ["customSections", index, "intro"], section.intro, true)}
          {editField("主要内容", ["customSections", index, "body"], section.body, true)}
          {imageField("栏目主图", ["customSections", index, "image"], section.image)}
          <PhotoComposer title="栏目图片组合" mobile={mobileMode} items={section.items.map((item) => ({ label: item.title, image: item.image, layout: mobileMode ? item.layoutMobile : item.layout }))} onLayout={(itemIndex, layout) => write(["customSections", index, "items", itemIndex, mobileMode ? "layoutMobile" : "layout"], layout)} onPreset={(layouts) => arrange(["customSections", index, "items"], layouts, mobileMode ? "layoutMobile" : "layout")} onAdd={() => add(["customSections", index, "items"], { title: "新图片", description: "", image: "", url: "" })} onUpload={(itemIndex, file) => void upload(file, ["customSections", index, "items", itemIndex, "image"])} onEdit={(itemIndex) => jumpToImage(`editor-custom-${index}-image-${itemIndex}`)} onReorder={(itemIndex, step) => move(["customSections", index, "items"], itemIndex, step)} onDelete={(itemIndex) => remove(["customSections", index, "items"], itemIndex)} />
          <h4>栏目图片与链接</h4>
          {section.items.map((item, itemIndex) => <div className="editor-subitem" id={`editor-custom-${index}-image-${itemIndex}`} key={itemIndex}>{editField("图片标题", ["customSections", index, "items", itemIndex, "title"], item.title)}{editField("图片说明", ["customSections", index, "items", itemIndex, "description"], item.description, true)}{editField("详情链接", ["customSections", index, "items", itemIndex, "url"], item.url)}{imageField("照片", ["customSections", index, "items", itemIndex, "image"], item.image)}<button type="button" onClick={() => remove(["customSections", index, "items"], itemIndex)}>删除图片</button></div>)}
          {subsectionEditor(["customSections", index, "subsections"], section.subsections)}
        </div>)}
      </div></details>
    </div>
    </div>
  </main>;
}

export default Editor;
