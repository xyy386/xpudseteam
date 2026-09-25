import { env } from "cloudflare:workers";
import { members, directions } from "./site-data";
import { archiveSections } from "./archive-data";
import { defaultAppearance, defaultMobileAppearance } from "./appearance-defaults";
import savedContent from "./saved-content.json";

export type PhotoLayout = { x: number; y: number; w: number; h: number };
export type GalleryItem = { label: string; image: string; caption: string; layout?: PhotoLayout; layoutMobile?: PhotoLayout };
export type NewsArticle = {
  id: string; title: string; date: string; summary: string; body: string; thumbnail: string;
  images: Array<{ image: string; caption: string }>; attachment: string; attachmentName: string; source: string; importWarnings: string[];
  status: "draft" | "published"; externalUrl: string;
};

export function isPublishedArticle(article: NewsArticle): boolean { return article.status !== "draft"; }
export type PaperItem = { title: string; description: string; image: string; url: string; layout?: PhotoLayout; layoutMobile?: PhotoLayout };
export type TopicItem = { title: string; detail: string; image: string };
export type SubsectionItem = { id: string; title: string; body: string; image: string; url: string; items: PaperItem[] };
export type DirectionItem = {
  slug: string; title: string; english: string; image: string; equation: string;
  summary: string; topics: TopicItem[]; papers: PaperItem[]; subsections: SubsectionItem[];
};
export type ArchiveItem = {
  slug: string; group: string; homeAnchor: string; title: string; english: string;
  description: string; summary: string; cover: string; gallery: GalleryItem[];
  columns: string[]; rows: string[][]; subsections: SubsectionItem[]; newsArticles: NewsArticle[];
};
export type CustomSection = {
  id: string; title: string; english: string; intro: string; body: string; image: string; items: PaperItem[]; subsections: SubsectionItem[];
};
export type Appearance = {
  bodyFont: "sans" | "serif" | "kai";
  headingFont: "sans" | "serif" | "kai";
  bodySize: number;
  lineHeight: number;
  heroTitleSize: number;
  sectionTitleSize: number;
  memberTextSize: number;
  directionTextSize: number;
  moduleTextSize: number;
  memberPhotoHeight: number;
  directionImageHeight: number;
  outcomeImageHeight: number;
  newsImageHeight: number;
  heroNewsImageHeight: number;
  detailImageHeight: number;
  topicImageHeight: number;
  paperImageHeight: number;
  galleryImageHeight: number;
  imageFit: "cover" | "contain";
};
export type SiteContent = {
  revision: string;
  syncBaseRevision?: string;
  siteName: string; institution: string; contact: string;
  contactDetails: { person: string; role: string; email: string; phone: string; address: string; extra: string };
  hero: { eyebrow: string; title: string; subtitle: string; detail: string; background: string; backgroundVisibility: number;
    featureLabel: string; featureTitle: string; featureText: string; featureImage: string; featureTargetSlug: string; featureArticleId: string; };
  sectionTitles: { team: string; research: string; outcomes: string; news: string; other: string; contact: string };
  sectionIntros: { team: string; research: string; outcomes: string; news: string; other: string; contact: string };
  pageText: {
    researchNote: string; focusTitle: string; focusIntro: string; papersTitle: string;
    papersIntro: string; relatedTitle: string; galleryTitle: string; galleryIntro: string;
    tableTitle: string; tableIntro: string; moreTitle: string;
  };
  backgrounds: { team: string; outcomes: string; news: string; other: string };
  backgroundVisibility: { team: number; outcomes: number; news: number; other: number };
  appearance: Appearance;
  appearanceMobile: Appearance;
  members: Array<{ name: string; role: string; focus: string; url: string; photo: string }>;
  directions: DirectionItem[];
  archives: ArchiveItem[];
  customSections: CustomSection[];
};

const cardSummaries: Record<string, string> = {
  publications: "",
  projects: "",
  awards: "",
  events: "",
  updates: "",
  more: "",
};

export const defaultContent: SiteContent = {
  revision: "",
  siteName: "数据驱动的科学工程建模与计算团队",
  institution: "西安工程大学 · 科研团队",
  contact: "西安工程大学",
  contactDetails: { person: "", role: "", email: "", phone: "", address: "", extra: "" },
  hero: {
    eyebrow: "DATA · MATHEMATICS · COMPUTATION",
    title: "数据驱动的科学工程\n建模与计算",
    subtitle: "以数学与数据研究复杂系统",
    detail: "围绕微分方程、复杂系统、动力学与纺织材料计算，探索基础方法与工程问题之间的联系。",
    background: "/campus-hero-user.png",
    backgroundVisibility: 0.55,
    featureLabel: "",
    featureTitle: "团队成果与活动",
    featureText: "",
    featureImage: "",
    featureTargetSlug: "updates",
    featureArticleId: "",
  },
  sectionTitles: { team: "团队成员", research: "研究方向", outcomes: "研究成果", news: "团队动态", other: "其他", contact: "联系我们" },
  sectionIntros: {
    team: "",
    research: "",
    outcomes: "",
    news: "",
    other: "",
    contact: "",
  },
  pageText: {
    researchNote: "",
    focusTitle: "研究内容",
    focusIntro: "",
    papersTitle: "论文与研究图片",
    papersIntro: "",
    relatedTitle: "其他研究方向",
    galleryTitle: "图片资料",
    galleryIntro: "",
    tableTitle: "条目列表",
    tableIntro: "",
    moreTitle: "更多栏目",
  },
  backgrounds: { team: "/campus-arch.jpeg", outcomes: "/campus-sky.png", news: "", other: "" },
  backgroundVisibility: { team: 0.14, outcomes: 0.24, news: 0.18, other: 0.18 },
  appearance: defaultAppearance,
  appearanceMobile: defaultMobileAppearance,
  members: members.map((member) => ({ ...member })),
  directions: directions.map((direction) => ({
    ...direction,
    topics: direction.topics.map((topic) => ({ ...topic, image: direction.image })),
    papers: [
      { title: "代表论文", description: "", image: "", url: "" },
      { title: "关键方法图", description: "", image: "", url: "" },
      { title: "研究结果", description: "", image: "", url: "" },
    ],
    subsections: [],
  })),
  archives: archiveSections.map((section) => ({
    ...section,
    summary: cardSummaries[section.slug],
    cover: "",
    gallery: section.imageLabels.map((label) => ({ label, image: "", caption: "" })),
    rows: [],
    subsections: [],
    newsArticles: [],
  })),
  customSections: [],
};

function legacyNewsArticles(item: ArchiveItem): NewsArticle[] {
  if (Array.isArray(item.newsArticles)) return item.newsArticles.map((article) => ({
    ...article, date: article.date ?? "", summary: article.summary ?? "", body: article.body ?? "",
    thumbnail: article.thumbnail ?? "", images: Array.isArray(article.images) ? article.images : [],
    attachment: article.attachment ?? "", attachmentName: article.attachmentName ?? "", source: article.source ?? "",
    importWarnings: Array.isArray(article.importWarnings) ? article.importWarnings : [],
    status: article.status === "draft" ? "draft" : "published", externalUrl: article.externalUrl ?? "",
  }));
  if (item.slug !== "events" || !item.summary?.trim()) return [];
  return [{
    id: "original-events-material", title: "学术交流与团队活动（原有资料）", date: "",
    summary: item.summary, body: item.summary,
    thumbnail: item.cover || item.gallery?.find((image) => image.image)?.image || "",
    images: (item.gallery ?? []).filter((image) => image.image).map((image) => ({ image: image.image, caption: image.caption || image.label })),
    attachment: "", attachmentName: "", source: "", importWarnings: [], status: "published", externalUrl: "",
  }];
}

function mergeContent(base: SiteContent, saved: Partial<SiteContent>): SiteContent {
  return {
      ...base,
      ...saved,
      sectionTitles: { ...base.sectionTitles, ...saved.sectionTitles },
      sectionIntros: { ...base.sectionIntros, ...saved.sectionIntros },
      hero: { ...base.hero, ...saved.hero },
      contactDetails: { ...base.contactDetails, ...saved.contactDetails },
      pageText: { ...base.pageText, ...saved.pageText },
      backgrounds: { ...base.backgrounds, ...saved.backgrounds },
      backgroundVisibility: { ...base.backgroundVisibility, ...saved.backgroundVisibility },
      appearance: { ...base.appearance, ...saved.appearance },
      appearanceMobile: { ...base.appearanceMobile, ...saved.appearanceMobile },
      directions: (saved.directions ?? base.directions).map((item) => ({ ...item, subsections: Array.isArray(item.subsections) ? item.subsections : [] })),
      archives: (saved.archives ?? base.archives).map((item) => ({ ...item, subsections: Array.isArray(item.subsections) ? item.subsections : [], newsArticles: legacyNewsArticles(item) })),
      customSections: Array.isArray(saved.customSections) ? saved.customSections.map((item) => ({ ...item, subsections: Array.isArray(item.subsections) ? item.subsections : [] })) : base.customSections,
    };
}

const initialContent = mergeContent(defaultContent, savedContent as unknown as Partial<SiteContent>);

export async function getSiteContent(): Promise<SiteContent> {
  if (!env.DB) return initialContent;
  try {
    const row = await env.DB.prepare("SELECT data, updated_at FROM site_content WHERE id = 1").first<{ data: string; updated_at: string }>();
    if (!row) return initialContent;
    return { ...mergeContent(initialContent, JSON.parse(row.data) as Partial<SiteContent>), revision: row.updated_at };
  } catch (error) {
    console.error("Site content unavailable", error);
    return initialContent;
  }
}
