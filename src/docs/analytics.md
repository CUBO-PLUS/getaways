# Analytics

Umami loads only in the public site layout and only when the browser hostname is
exactly `getaways.mauriciodmo.com`. The script also uses Umami's exact-domain
allowlist. It records visits and explicitly opted-in CTA events only; Umami's
automatic SPA page tracking is used (no manual pageview calls).

The pre-send hook re-checks the live hostname and route on every send, so a
client navigation into a private route cancels queued tracking too. Query
strings and fragments are excluded, the sent URL is rebuilt from the live
query-free location, and referrers are omitted entirely. Admin, account/auth,
checkout, booking-confirmation, editor, verification, verify, `/__editor-check`,
and `/editor-verification-temporary` paths are excluded. There is no user
identification, form-value collection, session
replay, scroll/heatmap, or performance tracking.

## CTA events

The four fixed events (`booking_click`, `search_click`, `contact_click`, and
`concierge_click`) represent button clicks only—not conversions or confirmed
submissions. Their only permitted properties are static `source`, `channel`,
and `mode` values. Keep them free of user input, IDs, booking details, hrefs,
generated mailto values, and other personal data. Do not add global click
capture or hardcode a messaging channel.

## Manual verification

1. On `getaways.mauriciodmo.com`, confirm one Umami script loads and public
   client-side route changes produce visits.
2. Inspect requests: no query/hash in tracked URLs and no referrer is sent.
3. Navigate from a public page into account, checkout, or booking confirmation;
   confirm no event is sent while there, including during a quick transition.
4. On another hostname, confirm the Umami script and network requests never
   occur.
