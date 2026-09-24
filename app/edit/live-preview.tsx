"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteContent } from "../content";
import { appearanceStyle } from "../appearance";
import { MarkdownInline, MarkdownText } from "../markdown";
import { heroBackgroundStyle } from "../hero-background";
import { PhotoMosaic } from "../photo-mosaic";
import { SubsectionCards } from "../subsections";

type View = "home" | "team" | "research" | "outcomes" | "news" | "other" | "contact";

const views: { key: View; label: string; editor: string; path: string }[] = [
  { key: "home", label: "首页", editor: "home", path: "/" },
  { key: "team", label: "团队成员", editor: "members", path: "/team" },
  { key: "research", label: "研究方向", editor: "directions", path: "/research" },
  { key: "outcomes", label: "研究成果", editor: "archives", path: "/outcomes" },
  { key: "news", label: "团队动态", editor: "archives", path: "/news" },
  { key: "other", label: "其他", editor: "archives", path: "/other" },
  { key: "contact", label: "联系我们", editor: "contact", path: "/#contact" },
];

export function LivePreview({ content, view, activeItemIndex, focusPath, onViewChange, onEdit, onEditSubsection, onAddCustomSection, mobile, onModeChange }: { content: SiteContent; view: string; activeItemIndex: number | null; focusPath: string; onViewChange: (view: string) => void; onEdit: (section: string, index?: number) => void; onEditSubsection: (id: string) => void; onAddCustomSection: () => string; mobile: boolean; onModeChange: (mobile: boolean) => void }) {
  const previewRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const customIndex = content.customSections.findIndex((section) => view === `custom-${section.id}`);
  const customSection = customIndex >= 0 ? content.customSections[customIndex] : null;
  const currentView = customSection || views.some((item) => item.key === view) ? view : "other";
  const selected = customSection ? { label: customSection.title, editor: "custom", path: `/custom/${customSection.id}` } : views.find((item) => item.key === currentView)!;
  const archiveItems = content.archives.map((item, index) => ({ item, index })).filter(({ item }) => item.homeAnchor === currentView);
  const featuredNewsIndex = content.archives.findIndex((item) => item.homeAnchor === "news" && item.slug === content.hero.featureTargetSlug);
  const featuredNews = featuredNewsIndex >= 0 ? content.archives[featuredNewsIndex] : null;
  const featuredArticle = featuredNews?.newsArticles.find((item) => item.id === content.hero.featureArticleId);
  const backgroundKey: keyof SiteContent["backgrounds"] | null = currentView === "team" || currentView === "outcomes" || currentView === "news" || currentView === "other" ? currentView : null;
  const background = backgroundKey && content.backgrounds[backgroundKey]
    ? { backgroundImage: `linear-gradient(rgba(225,238,247,${1 - content.backgroundVisibility[backgroundKey]}),rgba(225,238,247,${1 - content.backgroundVisibility[backgroundKey]})),url('${content.backgrounds[backgroundKey]}')` }
    : undefined;
  const direction = currentView === "research" && activeItemIndex !== null ? content.directions[activeItemIndex] : null;
  const archive = (currentView === "outcomes" || currentView === "news" || currentView === "other") && activeItemIndex !== null ? content.archives[activeItemIndex] : null;
  const subsectionIndex = Number(focusPath.match(/(?:^|\.)subsections\.(\d+)(?:\.|$)/)?.[1] ?? -1);
  const articleIndex = Number(focusPath.match(/(?:^|\.)newsArticles\.(\d+)(?:\.|$)/)?.[1] ?? -1);
  const editingArticle = archive?.newsArticles[articleIndex];

  useEffect(() => {
    const pane = previewRef.current;
    if (!pane || pane.scrollHeight <= pane.clientHeight + 8) return;
    const isPhoto = /\.(papers|gallery|items)(\.|$)/.test(focusPath);
    const target = pane.querySelector<HTMLElement>(".subsection-card.is-editing") ?? (isPhoto
      ? pane.querySelector<HTMLElement>(".editor-live-detail .photo-mosaic, .editor-live-custom .photo-mosaic")
      : pane.querySelector<HTMLElement>(".editor-live-card.is-editing"));
    const top = target ? target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 125 : 0;
    pane.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [currentView, activeItemIndex, focusPath]);

  useEffect(() => {
    if (!expanded) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [expanded]);

  return <section ref={previewRef} className={`editor-live${expanded ? " is-expanded" : ""}`} aria-label="未保存修改的实时预览">
    <div className="editor-live-head">
      <div><strong>实时预览 · {selected.label}</strong><p>页面 {selected.path} · 编辑内容时自动定位，预览会立即显示未保存的修改。</p></div>
      <div className="editor-live-actions"><button type="button" className={!mobile ? "active" : ""} onClick={() => onModeChange(false)} aria-pressed={!mobile}>电脑</button><button type="button" className={mobile ? "active" : ""} onClick={() => onModeChange(true)} aria-pressed={mobile}>手机</button><button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起预览" : "放大预览"}</button></div>
    </div>
    <div className="editor-live-tabs" role="tablist" aria-label="预览栏目">
      {views.filter((item) => item.key !== "contact").map((item) => <button key={item.key} type="button" role="tab" aria-selected={currentView === item.key} className={currentView === item.key ? "active" : ""} onClick={() => onViewChange(item.key)}>{item.label}</button>)}
      <button type="button" className="editor-live-add-tab" onClick={() => onViewChange(`custom-${onAddCustomSection()}`)}>＋ 添加栏目</button>
      {content.customSections.map((section) => <button key={section.id} type="button" role="tab" aria-selected={currentView === `custom-${section.id}`} className={currentView === `custom-${section.id}` ? "active" : ""} onClick={() => onViewChange(`custom-${section.id}`)}>{section.title || "新栏目"}</button>)}
      <button type="button" role="tab" aria-selected={currentView === "contact"} className={currentView === "contact" ? "active" : ""} onClick={() => onViewChange("contact")}>联系我们</button>
    </div>
    <div className={`editor-live-stage${mobile ? " is-mobile" : ""}`}>
      <div className="editor-live-site" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
        <div className="editor-live-site-header"><span className="editor-live-mark">数研</span><span><strong><MarkdownInline source={content.siteName} /></strong><small><MarkdownInline source={content.institution} /></small></span></div>
        {currentView === "home" && <div className="editor-live-hero" style={heroBackgroundStyle(content.hero.background, content.hero.backgroundVisibility)}>
          <div className="editor-live-hero-copy"><small><MarkdownInline source={content.hero.eyebrow} /></small><h2><MarkdownInline source={content.hero.title} /></h2><h3><MarkdownInline source={content.hero.subtitle} /></h3><MarkdownText source={content.hero.detail} /></div>
          <div className="editor-live-news"><span>最新动态 / LATEST NEWS</span><div className="editor-live-news-image">{content.hero.featureImage ? <img src={content.hero.featureImage} alt="最新动态图片" /> : "活动照片或论文封面待上传"}</div><small><MarkdownInline source={content.hero.featureLabel} /></small><h3><MarkdownInline source={content.hero.featureTitle} /></h3><MarkdownText source={content.hero.featureText} /><button type="button" className="editor-live-news-target" onClick={() => featuredNews ? onEdit(featuredArticle ? "news-posts" : "archives", featuredNewsIndex) : onViewChange("news")}>查看动态详情 ↗</button><small className="editor-live-news-destination">链接至：{featuredArticle ? `${featuredNews?.title} / ${featuredArticle.title || "未命名新闻稿"}` : featuredNews?.title ?? "团队动态栏目"}</small></div>
        </div>}
        {customSection && <div className="editor-live-section editor-live-custom">
          <div className="editor-live-section-head"><h2><MarkdownInline source={customSection.title} /></h2><MarkdownText source={customSection.intro} /></div>
          {(customSection.body || customSection.image) && <div className={`custom-section-feature${customSection.image ? " has-image" : ""}`}>
            {customSection.body && <MarkdownText source={customSection.body} className="custom-section-body" />}
            {customSection.image && <div className="custom-section-image"><img src={customSection.image} alt={customSection.title} /></div>}
          </div>}
          <PhotoMosaic kind="gallery" items={customSection.items} />
          <SubsectionCards sections={customSection.subsections} activeId={customSection.subsections[subsectionIndex]?.id} onEdit={onEditSubsection} />
          <button type="button" className="editor-live-direct-edit" onClick={() => onEdit("custom", customIndex)}>编辑此栏目 ↗</button>
        </div>}
        {currentView !== "home" && !customSection && <div className="editor-live-section" style={background}>
          <div className="editor-live-section-head"><h2><MarkdownInline source={content.sectionTitles[currentView as keyof SiteContent["sectionTitles"]]} /></h2><MarkdownText source={content.sectionIntros[currentView as keyof SiteContent["sectionIntros"]]} /></div>
          {currentView === "team" && <div className="editor-live-grid editor-live-members">{content.members.map((item, index) => <div className={`editor-live-card${activeItemIndex === index ? " is-editing" : ""}`} key={`${index}-${item.name}`}><div className="editor-live-card-image">{item.photo ? <img src={item.photo} alt="" /> : "成员照片"}</div><div><h3><MarkdownInline source={item.name} /></h3><small><MarkdownInline source={item.role} /></small><MarkdownText source={item.focus} /><button type="button" onClick={() => onEdit("members", index)}>编辑此成员 ↗</button></div></div>)}</div>}
          {currentView === "research" && <div className="editor-live-grid editor-live-directions">{content.directions.map((item, index) => <div className={`editor-live-card${activeItemIndex === index ? " is-editing" : ""}`} key={item.slug}><div className="editor-live-card-image">{item.image && <img src={item.image} alt="" />}</div><div><small>{String(index + 1).padStart(2, "0")}</small><h3><MarkdownInline source={item.title} /></h3><MarkdownText source={item.summary} /><button type="button" onClick={() => onEdit("directions", index)}>编辑此方向 ↗</button></div></div>)}</div>}
          {direction && <div className="editor-live-detail"><strong>当前编辑 · <MarkdownInline source={direction.title} /></strong><div className="editor-live-topics">{direction.topics.map((topic, index) => <div key={index}>{topic.image && <img src={topic.image} alt="" />}<h3><MarkdownInline source={topic.title} /></h3><MarkdownText source={topic.detail} /></div>)}</div><PhotoMosaic kind="paper" items={direction.papers} /><SubsectionCards sections={direction.subsections} activeId={direction.subsections[subsectionIndex]?.id} onEdit={onEditSubsection} /></div>}
          {(currentView === "outcomes" || currentView === "news" || currentView === "other") && <div className="editor-live-grid editor-live-archives">{archiveItems.map(({ item, index }) => <div className={`editor-live-card${activeItemIndex === index ? " is-editing" : ""}`} key={item.slug}><div className="editor-live-card-image">{item.cover ? <img src={item.cover} alt="" /> : "图片待上传"}</div><div><small>{item.english}</small><h3><MarkdownInline source={item.title} /></h3><MarkdownText source={item.summary} /><button type="button" onClick={() => onEdit("archives", index)}>编辑此栏目 ↗</button></div></div>)}</div>}
          {archive && archive.homeAnchor === currentView && <div className="editor-live-detail"><strong>当前编辑 · <MarkdownInline source={archive.title} /></strong><MarkdownText source={archive.description} />
            {(archive.slug === "events" || archive.slug === "updates") ? <div className="editor-live-news-list">
              {archive.newsArticles.length ? archive.newsArticles.map((article, index) => <div className={`editor-live-news-row${articleIndex === index ? " is-editing" : ""}`} key={article.id}><span><MarkdownInline source={article.title || "未命名新闻稿"} /></span>{article.date && <time dateTime={article.date}>{article.date}</time>}</div>) : <p>尚无新闻稿。</p>}
              {editingArticle && <article className="editor-live-news-article"><strong>{editingArticle.title || "未命名新闻稿"}</strong>{editingArticle.date && <time dateTime={editingArticle.date}>{editingArticle.date}</time>}<MarkdownText source={editingArticle.body || editingArticle.summary} />{editingArticle.images.filter((item) => item.image).map((item, index) => <figure key={index}><img src={item.image} alt={item.caption || "正文图片"} />{item.caption && <figcaption>{item.caption}</figcaption>}</figure>)}</article>}
              <button type="button" className="editor-live-direct-edit" onClick={() => onEdit("news-posts", activeItemIndex ?? undefined)}>编辑新闻稿 ↗</button>
            </div> : <><PhotoMosaic kind="gallery" items={archive.gallery.map((item) => ({ title: item.label, description: item.caption, image: item.image, layout: item.layout, layoutMobile: item.layoutMobile }))} /><SubsectionCards sections={archive.subsections} activeId={archive.subsections[subsectionIndex]?.id} onEdit={onEditSubsection} /></>}
          </div>}
          {currentView === "contact" && <div className="editor-live-contact">
            {content.contact && <MarkdownText source={content.contact} />}
            <dl>{([
              ["联系人", content.contactDetails.person], ["职务", content.contactDetails.role],
              ["电子邮箱", content.contactDetails.email], ["联系电话", content.contactDetails.phone],
              ["联系地址", content.contactDetails.address], ["其他信息", content.contactDetails.extra],
            ] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd><MarkdownText source={value} /></dd></div>)}</dl>
          </div>}
        </div>}
      </div>
    </div>
    <div className="editor-live-foot"><span>正在预览：{selected.label} · {selected.path}{activeItemIndex !== null && (currentView === "team" || currentView === "research" || currentView === "outcomes" || currentView === "news" || currentView === "other") ? ` · 第 ${activeItemIndex + 1} 项` : ""}</span><button type="button" onClick={() => onEdit(selected.editor, customSection ? customIndex : activeItemIndex ?? undefined)}>定位到编辑区 ↓</button></div>
  </section>;
}
