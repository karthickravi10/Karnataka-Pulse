// Shared store for the social media posts the team adds to the daily leader sheet (uses the same KV binding BRIEFS).
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const ID = /^(INC|NDA)\d{1,2}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
export async function onRequest({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'forbidden' }, 403);
  if (!env.BRIEFS) return json({ error: 'the shared store (KV binding BRIEFS) is not set up' }, 501);
  if (request.method === 'GET') {
    const d = url.searchParams.get('date') || '';
    if (!DAY.test(d)) return json({ error: 'bad date' }, 400);
    return json({ posts: (await env.BRIEFS.get('sm:' + d, 'json')) || {} });
  }
  if (request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch {}
    if (!DAY.test(b.date || '') || !b.posts || typeof b.posts !== 'object') return json({ error: 'bad request' }, 400);
    const cur = (await env.BRIEFS.get('sm:' + b.date, 'json')) || {};
    for (const [id, p] of Object.entries(b.posts)) {
      if (!ID.test(id) || !p) continue;
      const l = String(p.l || '').slice(0, 300), t = String(p.t || '').slice(0, 1500), act = String(p.a || '').slice(0, 1500), loc = String(p.c || '').slice(0, 120);
      if (!t && !l && !act && !loc) delete cur[id]; else cur[id] = { t, l: /^https?:\/\//.test(l) ? l : '', a: act, c: loc, ts: Date.now() };
    }
    await env.BRIEFS.put('sm:' + b.date, JSON.stringify(cur), { expirationTtl: 60 * 86400 });
    return json({ ok: true });
  }
  return json({ error: 'method not allowed' }, 405);
}
