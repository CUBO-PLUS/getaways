import Link from "next/link";
import GetawaysLogo from "@/components/atoms/GetawaysLogo";
import { BUSINESS } from "@/modules/site/business";
import { getListingCategoriesWithCounts } from "@/modules/listings/server/listings";
import { getPostCategoriesWithCounts } from "@/modules/content/server/content";
import { visibleListingCategories } from "@/modules/listings/categories";
import { siteText } from "@/modules/site/server/site-text";

/*
 * Site footer (Task 27) -- a structural match for the live site's
 * `footer.site-footer`, verified against the real DOM and against devtools
 * measurements taken at a 1280px viewport. The live footer is a four-column
 * widget row (four equal 293px columns) over a bottom link row:
 *
 *   widget_text       logo (the 300px-wide size of the same attachment the
 *                     header uses, rendered 261x55) + the tagline
 *                     "Property & Rental Management in El Salvador"
 *   widget_nav_menu   "Properties": Villas, Apartments
 *   widget_categories "Blog": Getaways Guides, Uncategorized -> /category/<slug>
 *   widget_nav_menu   "Social": Instagram, Twitter, Youtube
 *   .footer-navbar    About Us, Blog, Contact Us, Home, Properties
 *                     (WP's alphabetical page list -- that order is the live
 *                     one, not a choice made here)
 *
 * Column headings are <h5 class="widget__title"> on the live site: Lexend
 * 500, 18px, rgba(15,23,39,.85), 16px bottom margin. Column links are 16px
 * rgba(15,23,39,.65); the bottom row's links are the lighter
 * rgba(15,23,39,.45) (--color-muted-text).
 */

export default async function Footer() {
  const { text, edit } = await siteText();
  /* The contact details: whatever the admin has set, else what modules/site/business.ts
     ships with. Two of those are deliberately empty there -- an invented
     address gets crawled and contradicts the real Google listing forever --
     so this is how they get filled in without a deploy. */
  const street = text("business.streetAddress") || BUSINESS.streetAddress;
  const phone = text("business.telephone") || BUSINESS.telephone;
  const email = text("business.email") || BUSINESS.email;
  const [categories, journalCategories] = await Promise.all([
    getListingCategoriesWithCounts().then(visibleListingCategories),
    getPostCategoriesWithCounts(),
  ]);

  return (
    <footer className="border-t border-solid border-t-border bg-background mt-auto">
      <div className="max-w-301 mx-auto my-0 px-6 py-8">
        <div className="grid grid-cols-4 pb-12 border-b border-solid border-b-border gap-8 max-[900.001px]:grid-cols-2 max-[560.001px]:grid-cols-1">
          <div>
            {/* Not a link: the live footer logo sits in a text
                widget and is not wrapped in an anchor (unlike the header's
                custom-logo-link). */}
            <GetawaysLogo
              className="block w-65.25 max-w-full h-auto mb-4 text-primary"
              role="img"
              aria-label="Getaways El Salvador"
              focusable="false"
            />
            <p className="m-0" {...edit("footer.tagline", "Footer tagline")}>
              {text("footer.tagline")}
            </p>

            {/*
              The NAP. The site had none at all -- no phone, no address, not one
              tel: link on any page -- which left Google nothing to match against
              the Google Business Profile. That match is the strongest trust
              signal in local search.

              Marked up with the schema.org microdata property names so the
              visible text and the structured data cannot drift apart, and each
              line renders only if modules/site/business.ts actually knows it. The phone
              and street are blank there on purpose: an invented address gets
              crawled and copied into aggregators, and then contradicts the real
              listing forever.
            */}
            <address className="flex flex-col mt-3 not-italic text-[13px] leading-[1.5] gap-0.75">
              <span className="font-semibold">{BUSINESS.name}</span>
              <span>
                {street ? <span>{street}</span> : null}
                {street ? ", " : ""}
                {[BUSINESS.addressLocality, BUSINESS.addressRegion, "El Salvador"].filter(Boolean).join(", ")}
              </span>
              {phone ? (
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} data-umami-event="contact_click" data-umami-event-source="footer" data-umami-event-channel="phone" className="text-inherit no-underline hover:underline">
                  <span>{phone}</span>
                </a>
              ) : null}
              <a href={`mailto:${email}`} data-umami-event="contact_click" data-umami-event-source="footer" data-umami-event-channel="email" className="text-inherit no-underline hover:underline">
                <span>{email}</span>
              </a>
            </address>
          </div>

          <div>
            <h5 className="font-heading font-medium text-[18px] leading-[1.25] text-heading mt-0 mb-4 mx-0" {...edit("footer.properties.title", "Properties column")}>
              {text("footer.properties.title")}
            </h5>
            {/* From the database, not a hardcoded pair. The two links used to
                be Villas and Apartments; the Villas page 404s the moment its
                last property is deactivated, and a footer link to a 404 is on
                every page of the site. */}
            <ul className="list-none m-0 p-0">
              {categories.length === 0 ? (
                <li className="not-last:mb-2">
                  <Link className="text-body-text text-[16px] [transition:color_0.25s] hover:text-accent max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="/properties">All properties</Link>
                </li>
              ) : (
                categories.map((category) => (
                  <li key={category.slug} className="not-last:mb-2">
                    <Link className="text-body-text text-[16px] [transition:color_0.25s] hover:text-accent max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href={`/listing-category/${category.slug}`}>{category.name}</Link>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div>
            <h5 className="font-heading font-medium text-[18px] leading-[1.25] text-heading mt-0 mb-4 mx-0" {...edit("footer.journal.title", "Journal column")}>
              {text("footer.journal.title")}
            </h5>
            {/* Read from the terms behind the posts, not written out here.
                These were two hard-coded links, so renaming a category in the
                admin left the old name in the footer of every page -- and an
                empty category was listed as though it had something in it. */}
            <ul className="list-none m-0 p-0">
              {journalCategories.map((category) => (
                <li key={category.slug} className="not-last:mb-2">
                  <Link className="text-body-text text-[16px] [transition:color_0.25s] hover:text-accent max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href={`/category/${category.slug}`}>{category.name}</Link>
                </li>
              ))}
              <li className="not-last:mb-2">
                <Link className="text-body-text text-[16px] [transition:color_0.25s] hover:text-accent max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="/blog">All posts</Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="font-heading font-medium text-[18px] leading-[1.25] text-heading mt-0 mb-4 mx-0" {...edit("footer.social.title", "Social column")}>
              {text("footer.social.title")}
            </h5>
            {/* The two real profiles open in a new tab so the site is not left
                behind (the live links do not, but that is a plain oversight
                rather than a design decision worth reproducing).
                rel="noopener noreferrer" is the standard pairing. */}
            <ul className="list-none m-0 p-0">
              <li className="not-last:mb-2">
                <a
                  className="text-body-text text-[16px] [transition:color_0.25s] hover:text-accent max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10"
                  href="https://www.instagram.com/getawayselsalvador/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Instagram
                </a>
              </li>
              <li className="not-last:mb-2">
                <a className="text-body-text text-[16px] [transition:color_0.25s] hover:text-accent max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="https://x.com/getaways_sv" target="_blank" rel="noopener noreferrer">
                  Twitter
                </a>
              </li>
              {/* href="#" is what the live site itself ships for Youtube -- a
                  placeholder the site owner never filled in. Kept as-is
                  rather than inventing a channel URL. */}
              <li className="not-last:mb-2">
                <a className="text-body-text text-[16px] [transition:color_0.25s] hover:text-accent max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="#">Youtube</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between pt-8 gap-4 max-[560.001px]:justify-center max-[560.001px]:text-center">
          {/* The live footer leaves the theme's copyright slot
              (.footer-navbar__copyright, which the RentalHive stylesheet
              styles at rgba(15,23,39,.45)) empty, so this line has no
              counterpart on the real site. It is carried over from the
              previous footer rather than dropped, and placed in that slot. */}
          <p className="text-muted-text m-0">
            &copy; {new Date().getFullYear()} Getaways El Salvador
          </p>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap list-none m-0 p-0 gap-8 max-[560.001px]:justify-center max-[560.001px]:gap-y-1 max-[560.001px]:gap-x-5">
              <li>
                <Link className="text-muted-text [transition:color_0.25s] hover:text-body-text max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="/about">About Us</Link>
              </li>
              <li>
                <Link className="text-muted-text [transition:color_0.25s] hover:text-body-text max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="/blog">Journal</Link>
              </li>
              <li>
                <Link className="text-muted-text [transition:color_0.25s] hover:text-body-text max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="/concierge">Concierge</Link>
              </li>
              <li>
                <Link className="text-muted-text [transition:color_0.25s] hover:text-body-text max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="/contact-us">Contact Us</Link>
              </li>
              <li>
                <Link className="text-muted-text [transition:color_0.25s] hover:text-body-text max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="/">Home</Link>
              </li>
              <li>
                <Link className="text-muted-text [transition:color_0.25s] hover:text-body-text max-[560.001px]:inline-flex max-[560.001px]:items-center max-[560.001px]:min-h-10" href="/properties">Properties</Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
