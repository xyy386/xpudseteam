import { appearanceStyle } from "../appearance";
import { ContactContent } from "../contact-content";
import { getSiteContent } from "../content";
import { SiteFooter, SiteHeader } from "../site-shell";

export default async function ContactPage() {
  const content = await getSiteContent();
  return <main className="site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active="contact" />
    <ContactContent content={content} />
    <SiteFooter />
  </main>;
}
