// Writes one leader row of the daily sheet on request, and keeps the finished sheet so the whole team sees it.
// AI providers are tried in this order: GitHub Models (secret GH_MODELS_TOKEN), Gemini (secret GEMINI_KEY), then Workers AI (binding AI).
// The shared copy of the sheet needs the optional KV binding named BRIEFS.
const GH = ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini', 'meta/Llama-3.3-70B-Instruct'];
const GEM = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const CF = ['@cf/google/gemma-4-26b-a4b-it', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/mistralai/mistral-small-3.1-24b-instruct'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const pick = x => !x ? '' : typeof x === 'string' ? x : Array.isArray(x) ? x.map(pick).join('') : pick(x.text || x.content || x.response || x.output_text);

async function viaGitHub(env, sys, text) {
  let last = '';
  for (const m of GH) {
    const r = await fetch('https://models.github.ai/inference/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.GH_MODELS_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m, messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], temperature: 0.2, max_tokens: 700 }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) throw new Error('rate limit reached');
    if (r.status === 401 || r.status === 403) throw new Error('token not allowed (it needs the Models read permission)');
    const o = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (r.ok && o) return { text: String(o), model: m.split('/').pop() };
    last = m + ': ' + ((j.error && (j.error.message || j.error.code)) || 'HTTP ' + r.status);
  }
  throw new Error(last);
}
async function viaGemini(env, sys, text) {
  let last = '';
  for (const m of GEM) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', { method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 800, responseMimeType: 'application/json' } }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) throw new Error('rate limit reached');
    const o = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.map(x => x.text || '').join('');
    if (r.ok && o) return { text: o, model: m };
    last = m + ': ' + ((j.error && j.error.message) || 'HTTP ' + r.status);
  }
  throw new Error(last);
}
async function viaCloudflare(env, sys, text) {
  let last = '';
  for (const m of CF) {
    try {
      const r = await env.AI.run(m, { messages: [{ role: 'system', content: sys + (/qwen/.test(m) ? ' /no_think' : '') }, { role: 'user', content: text }], max_tokens: 700, temperature: 0.2 });
      const o = pick(r.response || r.output_text || (r.choices && r.choices[0] && ((r.choices[0].message && r.choices[0].message.content) || r.choices[0].text)) || r.output).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!o) throw new Error('empty reply');
      return { text: o, model: m.split('/').pop() };
    } catch (e) { last = m.split('/').pop() + ': ' + (e.message || e); if (/4006|daily free allocation/i.test(last)) break; }
  }
  throw new Error(last);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'forbidden' }, 403);
  if (request.method === 'GET') {
    const d = url.searchParams.get('date') || '';
    if (!DAY.test(d)) return json({ error: 'bad date' }, 400);
    if (!env.BRIEFS) return json({ sheet: null });
    return json({ sheet: (await env.BRIEFS.get('sh:' + d, 'json')) || null });
  }
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  let b = {}; try { b = await request.json(); } catch {}
  if (b.action === 'save') {
    if (!env.BRIEFS) return json({ error: 'the shared store (KV binding BRIEFS) is not set up' }, 501);
    const s = JSON.stringify(b.sheet || {});
    if (!DAY.test(b.date || '') || !b.sheet || !Array.isArray(b.sheet.rows) || s.length > 400000) return json({ error: 'bad request' }, 400);
    await env.BRIEFS.put('sh:' + b.date, s, { expirationTtl: 21 * 86400 });
    return json({ ok: true });
  }
  const sys = String(b.sys || ''), text = String(b.text || '');
  if (!sys || !text || sys.length > 8000 || text.length > 9000) return json({ error: 'text missing or too long' }, 400);
  const chain = [];
  if (env.GH_MODELS_TOKEN) chain.push(['GitHub Models', viaGitHub]);
  if (env.GEMINI_KEY) chain.push(['Gemini', viaGemini]);
  if (env.AI) chain.push(['Cloudflare AI', viaCloudflare]);
  if (!chain.length) return json({ error: 'no AI provider is set up: add GH_MODELS_TOKEN or GEMINI_KEY under Settings, Variables and Secrets of the Pages project' }, 501);
  const errs = [];
  for (const [by, f] of chain) {
    try { const o = await f(env, sys, text); return json({ text: o.text, by, model: o.model }); }
    catch (e) { errs.push(by + ': ' + (e.message || e)); }
  }
  return json({ error: errs.join(' | ') }, 502);
}
