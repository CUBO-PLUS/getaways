import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: { incomingRequests: false },
  images: {
    remotePatterns: [new URL("https://i.ytimg.com/vi/*/hqdefault.jpg")],
  },
  async headers() {
    const headers = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Pragma", value: "no-cache" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ];
    return ["/checkout", "/booking-confirmation", "/api/bookings", "/api/checkout/:path*", "/account/:path*", "/api/guest/:path*", "/admin/bookings/:path*", "/api/admin/bookings/:path*", "/admin/listings/:path*", "/api/admin/listings/:path*"].map((source) => ({ source, headers }));
  },
};

export default nextConfig;
