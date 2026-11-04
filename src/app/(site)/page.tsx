import type { Metadata } from "next";
import HomeTemplate from "@/components/templates/HomeTemplate";
import { getHomeData } from "@/modules/site/server/home";
import { getMediaByIds } from "@/shared/media/server/media";
import { getPageBySlug, getSiteContent } from "@/modules/content/server/content";
import { slotMediaId } from "@/modules/content/site-content";
import { mediaPublicUrl } from "@/shared/media/media";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [page, content] = await Promise.all([getPageBySlug("home"), getSiteContent()]);
  const heroId = slotMediaId(content, "home.hero.image");
  const [heroMedia] = heroId != null ? await getMediaByIds([heroId]) : [];
  return {
    title:
      page?.seo_title ||
      "Vacation Rentals in El Zonte, Surf City | Getaways El Salvador",
    description:
      page?.seo_description ||
      "Book oceanfront apartments direct in El Zonte, on El Salvador's Surf City coast. No booking fees, local team on the beach.",
    alternates: { canonical: "/" },
    ...(heroMedia
      ? {
          openGraph: {
            images: [{ url: mediaPublicUrl(heroMedia.storage_path), alt: "The coast at El Zonte, La Libertad" }],
          },
        }
      : {}),
  };
}

export default async function HomePage() {
  return <HomeTemplate data={await getHomeData()} />;
}
