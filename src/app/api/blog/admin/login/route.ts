// The shared-password blog login is retired; use the panel login.
export function POST() { return new Response(null, { status: 410, headers: { "Cache-Control": "no-store" } }); }
