// Logout must revoke the panel session, not merely clear the browser cookie.
export function POST() { return new Response(null, { status: 410, headers: { "Cache-Control": "no-store" } }); }
