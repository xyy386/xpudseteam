import type { Appearance } from "./content";

export const defaultAppearance: Appearance = {
  bodyFont: "sans", headingFont: "serif", bodySize: 15, lineHeight: 1.75,
  heroTitleSize: 64, sectionTitleSize: 34, memberTextSize: 14,
  directionTextSize: 15, moduleTextSize: 15,
  memberPhotoHeight: 225, directionImageHeight: 220,
  outcomeImageHeight: 205, newsImageHeight: 230,
  heroNewsImageHeight: 225, detailImageHeight: 360,
  topicImageHeight: 150, paperImageHeight: 225,
  galleryImageHeight: 240, imageFit: "cover",
};

export const defaultMobileAppearance: Appearance = {
  bodyFont: "sans", headingFont: "serif", bodySize: 14, lineHeight: 1.65,
  heroTitleSize: 44, sectionTitleSize: 28, memberTextSize: 14,
  directionTextSize: 14, moduleTextSize: 14,
  memberPhotoHeight: 280, directionImageHeight: 205,
  outcomeImageHeight: 195, newsImageHeight: 200,
  heroNewsImageHeight: 190, detailImageHeight: 245,
  topicImageHeight: 185, paperImageHeight: 205,
  galleryImageHeight: 215, imageFit: "cover",
};
