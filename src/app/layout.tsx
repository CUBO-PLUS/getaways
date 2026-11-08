import type { Metadata } from "next";
import { Inter, Lexend, Montserrat } from "next/font/google";
import "./globals.css";
import { mediaPublicUrl } from "@/shared/media/media";
import { Suspense } from "react";
import AssistantLink from "@/components/organisms/AssistantLink";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  display: "swap",
});

// /about only, matching the "Getaways About Page Redesign" it was pulled
// from exactly -- Montserrat 300/800, not the rest of the site's Inter/Lexend.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

/*
 * metadataBase is what makes every relative canonical and og:image below
 * resolve to an absolute URL. Without it Next emits neither, which is what was
 * happening: no canonical and no Open Graph on any page of the site.
 *
 * The canonical matters because this deployment answers on several hostnames
 * (the project alias and a fresh URL per deploy), and without one they are all
 * indexable copies of the same pages competing with each other.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://getawayselsalvador.com";

/** The homepage hero (media wp_id 447), used as the fallback share card. */
const DEFAULT_SHARE_IMAGE = "2026/01/cropped-DJI_0151.jpg";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Vacation Rentals in El Zonte, Surf City | Getaways El Salvador",
    // Pages set a bare title and get the brand appended, so no page has to
    // remember to do it and none of them can disagree about the format.
    template: "%s | Getaways El Salvador",
  },
  description:
    "Book oceanfront apartments direct in El Zonte, on El Salvador's Surf City coast. No booking fees, local team on the beach.",
  // No canonical here on purpose. A canonical set on the layout is INHERITED
  // by every page that does not set its own, so /about and /contact-us both
  // declared themselves to be the homepage -- worse than having none at all.
  // Each page sets its own.
  openGraph: {
    type: "website",
    siteName: "Getaways El Salvador",
    locale: "en_US",
    url: SITE_URL,
    // The homepage hero, as the default share card for every page that does
    // not set its own. A property page overrides it with its own photograph.
    images: [
      {
        url: mediaPublicUrl(DEFAULT_SHARE_IMAGE),
        alt: "The coast at El Zonte, La Libertad",
      },
    ],
  },
  // Properties are shared by link far more than they are found by search here
  // -- a WhatsApp message with no preview card is a listing nobody opens.
  twitter: { card: "summary_large_image", site: "@getaways_sv" },
  /*
   * max-image-preview:large is the switch for Google Discover and for the
   * large image in a result. Without it Google shows a thumbnail at best, and
   * Discover -- which is a photograph with a headline on it -- skips the page
   * entirely. For a coastline business that is the surface most worth having.
   */
  robots: {
    index: true,
    follow: true,
    // Set on the general directive as well as the googleBot one: Next emits
    // those as two separate meta tags, and only the second was carrying the
    // image directive, so any crawler reading the general one saw nothing.
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
};

/*
 * Root layout: fonts and document shell only. The public site's Header/Footer
 * live in app/(site)/layout.tsx.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={` ${inter.variable} ${lexend.variable} ${montserrat.variable} h-full max-w-screen overflow-x-hidden has-[[data-blog-editor]]:overflow-x-clip`}>
      <body className="flex min-h-full max-w-screen flex-col overflow-x-hidden bg-background font-body text-[16px] leading-[30px] text-body-text antialiased has-[[data-blog-editor]]:overflow-x-clip">
        {children}
        <Suspense fallback={null}><AssistantLink /></Suspense>
      </body>
    </html>
  );
}
