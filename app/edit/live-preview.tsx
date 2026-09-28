"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteContent } from "../content";
import { appearanceStyle } from "../appearance";
import { BrandLogos } from "../brand-logos";
import { SiteFooter } from "../site-shell";
import { MarkdownInline, MarkdownText } from "../markdown";
import { HomepageContent } from "../home-content";
import { ContactContent } from "../contact-content";
import { ArchiveOverview } from "../archive-overview";
import { ArchiveDetailContent } from "../archive-detail-content";
import { ResearchDetailContent } from "../research-detail-content";
import { NewsArticleContent, NewsListContent } from "../news-articles";
import { ResearchOverview, TeamContent } from "../people-overviews";
import { EducationContent, EducationDetail } from "../education-content";
import { PhotoMosaic } from "../photo-mosaic";
import { SubsectionCards } from "../subsections";
import "./academic-preview.css";

type View = "home" | "team" | "research" | "outcomes" | "news" | "other" | "contact";

const views: { key: View; label: string; editor: string; path: string }[] = [
  { key: "home", label: "首页", editor: "home", path: "/" },
  { key: "team", label: "团队成员", editor: "members", path: "/team" },
  { key: "research", label: "研究方向", editor: "directions", path: "/research" },
  { key: "outcomes", label: "研究成果", editor: "archives", path: "/outcomes" },
  { key: "news", label: "团队动态", editor: "archives", path: "/news" },
  { key: "other", label: "其他", editor: "archives", path: "/other" },
  { key: "contact", label: "联系我们", editor: "contact", path: "/contact" },
];

export function LivePreview({ content, view, activeItemIndex, focusPath, educationDetailId, educationActiveId, onOpenEducation, onBackEducation, onViewChange, onEdit, onEditSubsection, onAddCustomSection, mobile, onModeChange }: { content: SiteContent; view: string; activeItemIndex: number | null; focusPath: string; educationDetailId: string | null; educationActiveId: string | null; onOpenEducation: (id: string) => void; onBackEducation: () => void; onViewChange: (view: string) => void; onEdit: (section: string, index?: number, articleIndex?: number) => void; onEditSubsection: (id: string) => void; onAddCustomSection: () => string; mobile: boolean; onModeChange: (mobile: boolean) => void }) {
  const previewRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const customIndex = content.customSections.findIndex((section) => view === `custom-${section.id}`);
  const customSection = customIndex >= 0 ? content.customSections[customIndex] : null;
  const educationSection = content.customSections.find((section) => section.id === "education");
  const previewTabs = views.flatMap((item) => item.key === "contact" ? [] : item.key === "outcomes" && educationSection
    ? [item, { key: "custom-education", label: educationSection.title || "人才培养", editor: "custom", path: "/custom/education" }]
    : [item]);
  const currentView = customSection || views.some((item) => item.key === view) ? view : "other";
  const educationDetail = customSection?.id === "education" ? customSection.subsections.find((section) => section.id === educationDetailId) : undefined;
  const selectedOverview = customSection ? {
    label: educationDetail ? `${customSection.title} · ${educationDetail.title || "未命名分类"}` : customSection.title,
    editor: "custom",
    path: educationDetail ? `/custom/education/${encodeURIComponent(educationDetail.id)}` : `/custom/${customSection.id}`,
  } : views.find((item) => item.key === currentView)!;
  const archiveKind = currentView === "outcomes" || currentView === "news" || currentView === "other" ? currentView : null;
  const direction = currentView === "research" && activeItemIndex !== null ? content.directions[activeItemIndex] : null;
  const archive = archiveKind && activeItemIndex !== null && content.archives[activeItemIndex]?.homeAnchor === archiveKind ? content.archives[activeItemIndex] : null;
  const subsectionIndex = Number(focusPath.match(/(?:^|\.)subsections\.(\d+)(?:\.|$)/)?.[1] ?? -1);
  const articleIndex = Number(focusPath.match(/(?:^|\.)newsArticles\.(\d+)(?:\.|$)/)?.[1] ?? -1);
  const editingArticle = archive?.newsArticles[articleIndex];
  const selected = direction ? { ...selectedOverview, label: direction.title, path: `/research/${encodeURIComponent(direction.slug)}` }
    : archive ? { ...selectedOverview, label: editingArticle?.title || archive.title, path: `/archive/${encodeURIComponent(archive.slug)}${editingArticle ? `/${encodeURIComponent(editingArticle.id)}` : ""}` }
    : selectedOverview;
  const openArchive = (slug: string) => {
    const index = content.archives.findIndex((item) => item.slug === slug);
    if (index >= 0) onEdit("archives", index);
  };
  const openDirection = (slug: string) => {
    const index = content.directions.findIndex((item) => item.slug === slug);
    if (index >= 0) onEdit("directions", index);
  };
  const displayedEducationDetailId = educationDetail?.id;
  const displayedArchiveSlug = archive?.slug;
  const displayedDirectionSlug = direction?.slug;

  useEffect(() => {
    const pane = previewRef.current;
    if (!pane || pane.scrollHeight <= pane.clientHeight + 8) return;
    const isPhoto = /\.(papers|gallery|items)(\.|$)/.test(focusPath);
    const educationTarget = currentView === "custom-education"
      ? displayedEducationDetailId
        ? (isPhoto ? pane.querySelector<HTMLElement>(".education-gallery") : null) ?? pane.querySelector<HTMLElement>(".education-page")
        : educationActiveId ? pane.querySelector<HTMLElement>(`#subsection-${CSS.escape(educationActiveId)}`) : null
      : null;
    const detailTarget = displayedArchiveSlug || displayedDirectionSlug
      ? pane.querySelector<HTMLElement>(".editor-live-detail .detail-subsection.is-editing, .editor-live-news-row.is-editing") ?? (isPhoto ? pane.querySelector<HTMLElement>(".editor-live-detail .detail-gallery") : null) ?? pane.querySelector<HTMLElement>(".editor-live-detail")
      : null;
    const target = educationTarget ?? detailTarget ?? pane.querySelector<HTMLElement>(".subsection-card.is-editing, .education-section.is-editing, .editor-live-news-row.is-editing") ?? (isPhoto
      ? pane.querySelector<HTMLElement>(".editor-live-detail .detail-gallery, .editor-live-custom .photo-mosaic, .education-page .education-gallery")
      : pane.querySelector<HTMLElement>(".team-profile.is-editing, .research-card.is-editing, .editor-live-card.is-editing"));
    const top = target ? target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 125 : 0;
    pane.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [currentView, activeItemIndex, focusPath, displayedEducationDetailId, educationActiveId, displayedArchiveSlug, displayedDirectionSlug]);

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
      {previewTabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={currentView === item.key} className={currentView === item.key ? "active" : ""} onClick={() => onViewChange(item.key)}>{item.label}</button>)}
      <button type="button" className="editor-live-add-tab" onClick={() => onViewChange(`custom-${onAddCustomSection()}`)}>＋ 添加栏目</button>
      {content.customSections.filter((section) => section.id !== "education").map((section) => <button key={section.id} type="button" role="tab" aria-selected={currentView === `custom-${section.id}`} className={currentView === `custom-${section.id}` ? "active" : ""} onClick={() => onViewChange(`custom-${section.id}`)}>{section.title || "新栏目"}</button>)}
      <button type="button" role="tab" aria-selected={currentView === "contact"} className={currentView === "contact" ? "active" : ""} onClick={() => onViewChange("contact")}>联系我们</button>
    </div>
    <div className={`editor-live-stage${mobile ? " is-mobile" : ""}`}>
      <div className="editor-live-site" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
        <div className="editor-live-site-header"><BrandLogos /><span className="brand-copy"><strong><MarkdownInline source={content.siteName} /></strong>{content.institution.trim() && <small><MarkdownInline source={content.institution} /></small>}</span></div>
        {currentView === "home" && <HomepageContent content={content} contactId="preview-home-contact" onTeamClick={() => onViewChange("team")} onNewsClick={() => onViewChange("news")} onContactClick={() => onViewChange("contact")} onArticleClick={(archiveIndex, articleIndex) => onEdit("news-posts", archiveIndex, articleIndex)} />}
        {currentView === "contact" && <ContactContent content={content} id="preview-contact" />}
        {currentView === "team" && <TeamContent content={content} activeIndex={activeItemIndex} onEdit={(index) => onEdit("members", index)} />}
        {currentView === "research" && !direction && <ResearchOverview content={content} onOpen={(slug) => {
          const index = content.directions.findIndex((item) => item.slug === slug);
          if (index >= 0) onEdit("directions", index);
        }} />}
        {archiveKind && !archive && <ArchiveOverview content={content} kind={archiveKind} onOpen={(slug) => {
          const index = content.archives.findIndex((item) => item.slug === slug);
          if (index >= 0) onEdit("archives", index);
        }} />}
        {customSection?.id === "education" && (educationDetail
          ? <EducationDetail section={customSection} item={educationDetail} onBack={onBackEducation} onEdit={onEditSubsection} />
          : <EducationContent section={customSection} activeId={educationActiveId ?? undefined} onOpen={onOpenEducation} onEdit={onEditSubsection} />)}
        {customSection && customSection.id !== "education" && <div className="editor-live-section editor-live-custom">
          <div className="editor-live-section-head"><h2><MarkdownInline source={customSection.title} /></h2><MarkdownText source={customSection.intro} /></div>
          {(customSection.body || customSection.image) && <div className={`custom-section-feature${customSection.image ? " has-image" : ""}`}>
            {customSection.body && <MarkdownText source={customSection.body} className="custom-section-body" />}
            {customSection.image && <div className="custom-section-image"><img src={customSection.image} alt={customSection.title} /></div>}
          </div>}
          <PhotoMosaic kind="gallery" items={customSection.items} />
          <SubsectionCards sections={customSection.subsections} activeId={customSection.subsections[subsectionIndex]?.id} onEdit={onEditSubsection} />
          <button type="button" className="editor-live-direct-edit" onClick={() => onEdit("custom", customIndex)}>编辑此栏目 ↗</button>
        </div>}
        {direction && !customSection && <div className="editor-live-detail">
          <ResearchDetailContent content={content} direction={direction} onBack={() => onViewChange("research")} onOpen={openDirection} onPublications={() => openArchive("publications")} activeSubsectionId={direction.subsections[subsectionIndex]?.id} onEditSubsection={onEditSubsection} />
        </div>}
        {archive && !customSection && <div className="editor-live-detail">
          {(archive.slug === "events" || archive.slug === "updates")
            ? editingArticle
              ? <NewsArticleContent section={archive} article={editingArticle} onBack={() => onEdit("archives", activeItemIndex ?? undefined)} />
              : <NewsListContent content={content} section={archive} onBack={() => onViewChange(archive.homeAnchor)} includeDrafts onOpenArticle={(id) => {
                const index = archive.newsArticles.findIndex((article) => article.id === id);
                if (index >= 0) onEdit("news-posts", activeItemIndex ?? undefined, index);
              }} activeSubsectionId={archive.subsections[subsectionIndex]?.id} onEditSubsection={onEditSubsection} />
            : <ArchiveDetailContent content={content} section={archive} onBack={() => onViewChange(archive.homeAnchor)} onOpen={openArchive} activeSubsectionId={archive.subsections[subsectionIndex]?.id} onEditSubsection={onEditSubsection} />}
        </div>}
        <SiteFooter />
      </div>
    </div>
    <div className="editor-live-foot"><span>正在预览：{selected.label} · {selected.path}{activeItemIndex !== null && (currentView === "team" || currentView === "research" || currentView === "outcomes" || currentView === "news" || currentView === "other") ? ` · 第 ${activeItemIndex + 1} 项` : ""}</span><button type="button" onClick={() => educationDetail ? onEditSubsection(educationDetail.id) : editingArticle ? onEdit("news-posts", activeItemIndex ?? undefined, articleIndex) : onEdit(selected.editor, customSection ? customIndex : activeItemIndex ?? undefined)}>定位到编辑区 ↓</button></div>
  </section>;
}
