import type { CSSProperties } from "react";
import type { Appearance } from "./content";

const fonts = {
  sans: '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",Arial,sans-serif',
  serif: '"Songti SC","Noto Serif CJK SC","SimSun",serif',
  kai: '"Kaiti SC","KaiTi",serif',
};

function range(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function appearanceStyle(value: Appearance, mobile: Appearance = value): CSSProperties {
  return {
    "--site-body-font": fonts[value.bodyFont] ?? fonts.sans,
    "--site-heading-font": fonts[value.headingFont] ?? fonts.serif,
    "--site-body-size": `${range(value.bodySize, 13, 22)}px`,
    "--site-line-height": String(range(value.lineHeight, 1.35, 2.2)),
    "--site-hero-title-size": `${range(value.heroTitleSize, 42, 88)}px`,
    "--site-section-title-size": `${range(value.sectionTitleSize, 26, 48)}px`,
    "--site-member-text-size": `${range(value.memberTextSize, 12, 21)}px`,
    "--site-direction-text-size": `${range(value.directionTextSize, 13, 22)}px`,
    "--site-module-text-size": `${range(value.moduleTextSize, 13, 22)}px`,
    "--site-member-photo-height": `${range(value.memberPhotoHeight, 160, 420)}px`,
    "--site-direction-image-height": `${range(value.directionImageHeight, 160, 420)}px`,
    "--site-outcome-image-height": `${range(value.outcomeImageHeight, 160, 420)}px`,
    "--site-news-image-height": `${range(value.newsImageHeight, 160, 420)}px`,
    "--site-hero-news-image-height": `${range(value.heroNewsImageHeight, 160, 420)}px`,
    "--site-detail-image-height": `${range(value.detailImageHeight, 200, 520)}px`,
    "--site-topic-image-height": `${range(value.topicImageHeight, 120, 360)}px`,
    "--site-paper-image-height": `${range(value.paperImageHeight, 150, 420)}px`,
    "--site-gallery-image-height": `${range(value.galleryImageHeight, 160, 420)}px`,
    "--site-image-fit": value.imageFit === "contain" ? "contain" : "cover",
    "--site-mobile-body-font": fonts[mobile.bodyFont] ?? fonts.sans,
    "--site-mobile-heading-font": fonts[mobile.headingFont] ?? fonts.serif,
    "--site-mobile-body-size": `${range(mobile.bodySize, 12, 20)}px`,
    "--site-mobile-line-height": String(range(mobile.lineHeight, 1.3, 2.1)),
    "--site-mobile-hero-title-size": `${range(mobile.heroTitleSize, 30, 60)}px`,
    "--site-mobile-section-title-size": `${range(mobile.sectionTitleSize, 22, 40)}px`,
    "--site-mobile-member-text-size": `${range(mobile.memberTextSize, 12, 20)}px`,
    "--site-mobile-direction-text-size": `${range(mobile.directionTextSize, 12, 20)}px`,
    "--site-mobile-module-text-size": `${range(mobile.moduleTextSize, 12, 20)}px`,
    "--site-mobile-member-photo-height": `${range(mobile.memberPhotoHeight, 180, 420)}px`,
    "--site-mobile-direction-image-height": `${range(mobile.directionImageHeight, 150, 360)}px`,
    "--site-mobile-outcome-image-height": `${range(mobile.outcomeImageHeight, 150, 360)}px`,
    "--site-mobile-news-image-height": `${range(mobile.newsImageHeight, 150, 360)}px`,
    "--site-mobile-hero-news-image-height": `${range(mobile.heroNewsImageHeight, 150, 360)}px`,
    "--site-mobile-detail-image-height": `${range(mobile.detailImageHeight, 180, 420)}px`,
    "--site-mobile-topic-image-height": `${range(mobile.topicImageHeight, 130, 320)}px`,
    "--site-mobile-paper-image-height": `${range(mobile.paperImageHeight, 150, 360)}px`,
    "--site-mobile-gallery-image-height": `${range(mobile.galleryImageHeight, 150, 360)}px`,
    "--site-mobile-image-fit": mobile.imageFit === "contain" ? "contain" : "cover",
  } as CSSProperties;
}
