// Translates one Kannada/Hindi summary to English on request (used by the "Show English" buttons).
const MODELS = ['@cf/google/gemma-4-26b-a4b-it', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/mistralai/mistral-small-3.1-24b-instruct'];
const SYS = 'You translate Kannada or Hindi news text into clear, natural English. Keep names of people, parties (BJP, Congress, JD(S)), places and organisations in their usual English spelling. Output only the translation, with no notes and no added quotation marks.';
const pick = x => !x ? '' : typeof x === 'string' ? x : Array.isArray(x) ? x.map(pick).join('') : pick(x.text || x.content || x.response || x.output_text);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'forbidden' }, 403);
  let text = ''; try { text = String((await request.json()).text || '').trim(); } catch {}
  if (!text || text.length > 700) return json({ error: 'text missing or too long' }, 400);
  if (!env.AI) return json({ error: 'the Workers AI binding named AI is not set on this Pages project' }, 500);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const key = new Request(url.origin + '/__tr/' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''));
  try { const hit = await caches.default.match(key); if (hit) return json({ text: await hit.text() }); } catch {}
  let err = '';
  for (const m of MODELS) {
    try {
      const r = await env.AI.run(m, { messages: [{ role: 'system', content: SYS + (/qwen/.test(m) ? ' /no_think' : '') }, { role: 'user', content: text }], max_tokens: Math.max(300, Math.min(1200, text.length * 3)), temperature: 0 });
      const out = pick(r.response || r.output_text || (r.choices && r.choices[0] && ((r.choices[0].message && r.choices[0].message.content) || r.choices[0].text)) || r.output).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!out) throw new Error('empty reply');
      try { await caches.default.put(key, new Response(out, { headers: { 'cache-control': 'public, max-age=2592000' } })); } catch {}
      return json({ text: out });
    } catch (e) { err = m.split('/').pop() + ': ' + (e.message || e); }
  }
  return json({ error: err }, 502);
}
