/*
 * The primary menu, in the live site's order (Task 27).
 *
 * Shared by the desktop nav in components/organisms/Header.tsx (a server component) and
 * the burger overlay in components/organisms/MobileNav.tsx (a client component) -- the
 * live site literally renders its menu twice for the same reason, once in
 * `.header-navbar__middle` and once inside `.header-navbar__burger`, hiding one
 * per breakpoint. Keeping the items here means the two copies cannot drift.
 */

export type NavChild = { label: string; href: string };
export type NavItem = { label: string; href: string; children?: NavChild[] };

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Properties", href: "/properties" },
  { label: "Concierge", href: "/concierge" },
  { label: "Travel assistant", href: "/assistant" },
  { label: "Journal", href: "/blog" },
  { label: "Contact Us", href: "/contact-us" },
  { label: "Account", href: "/account" },
];

/**
 * The menu with the Properties submenu filled in from the live categories.
 *
 * The two children used to be hardcoded here as Villas and Apartments. That
 * put a permanent link in the header and the burger to a category page that
 * is a 404 the moment its last property is deactivated -- which is exactly
 * what happens when a house is sold. The categories now come from the
 * database, already filtered to the non-empty ones, so the menu follows the
 * catalogue instead of describing the catalogue as it was in February.
 *
 * No categories at all means no submenu, not an empty dropdown.
 */
export function navItemsWithCategories(categories: Array<{ name: string; slug: string }>): NavItem[] {
  if (categories.length === 0) return NAV_ITEMS;
  return NAV_ITEMS.map((item) =>
    item.href === "/properties"
      ? {
          ...item,
          children: categories.map((category) => ({
            label: category.name,
            href: `/listing-category/${category.slug}`,
          })),
        }
      : item
  );
}

// The live "List a Property" button points at HivePress's /submit-listing flow,
// which this migration has no equivalent for, so it is aimed at the contact page
// (the same substitution app/page.tsx already makes for its own CTA). Declared
// here so the header's desktop copy stays in sync.
export const SUBMIT_LISTING_HREF = "/contact-us";

// The live breakpoint between the full nav and the burger menu:
// `@media only screen and (max-width: 74.99em)` in the RentalHive stylesheet,
// i.e. 1199.84px. Mirrored in the navigation's Tailwind variants; restated here for
// why MobileNav renders on every page even though it is invisible on desktop.
export const NAV_BURGER_MAX_WIDTH_PX = 1199.84;
