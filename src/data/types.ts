import type { PageRow } from "./types/content";
import type { CouponRow } from "./types/coupons";
import type { MediaRow } from "./types/media";

// Keep the public import path stable; definitions live with their domain.
export type * from "./types/common";
export type * from "./types/content";
export type * from "./types/coupons";
export type * from "./types/listings";
export type * from "./types/media";
export type * from "./types/taxonomies";

/** Row contracts for the remaining static JSON snapshots; not joined view models. */
export type DataTables = {
  pages: PageRow;
  media: MediaRow;
  coupons: CouponRow;
};
