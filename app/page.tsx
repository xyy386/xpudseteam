import { getSiteContent } from "./content";
import { appearanceStyle } from "./appearance";
import { HomepageContent } from "./home-content";
import { SiteFooter, SiteHeader } from "./site-shell";

export default async function Home() {
  const content = await getSiteContent();
  return <main id="top" className="site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} />
    <HomepageContent content={content} />
    <SiteFooter />
  </main>;
}
