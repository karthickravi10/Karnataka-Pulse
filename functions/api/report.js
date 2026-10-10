// Writes the AI daily briefing or the detailed story report. The dashboard sends the stories as plain text.
const MODELS = ['@cf/google/gemma-4-26b-a4b-it', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/mistralai/mistral-small-3.1-24b-instruct'];
const COMMON = 'Some items are in Kannada or Hindi: read them directly and write in clear English. Use standard English spellings for people, parties (BJP, Congress, JD(S)), places and organisations. Use ONLY facts that appear in the items. Never invent names, numbers, quotes, causes or dates. If the items are thin or conflict, say so plainly.';
const PROMPTS = {
  day: 'You are an analyst writing the daily Karnataka politics, law-and-order and governance report for a monitoring desk. The input is a numbered list of news items from Karnataka media, each with zone, topic, number of outlets and time. ' + COMMON + ' Write 450 to 650 words in markdown with exactly these sections: "## Summary" (3 or 4 sentences), "## Top developments" (5 to 8 bullets, one sentence each, mention how many outlets reported it when the count is above 1), "## By zone" (for every zone that has items, a bold zone name followed by one or two sentences; zones are Bengaluru, OMR (Old Mysuru Region), Central, Coastal, Kittur, Kalyana, Statewide), "## Things to watch" (3 to 5 bullets).',
  story: 'You are an analyst writing a detailed report on ONE news story, using the numbered reports from several outlets. ' + COMMON + ' Write 350 to 550 words in markdown with exactly these sections: "## What happened" (one clear paragraph), "## Key details" (bullets: who, what, where, when, figures, only when stated), "## Who said what" (bullets attributing statements to named people or parties exactly as reported; write "No direct statements reported." if none), "## How outlets covered it" (differences in emphasis or facts between named outlets; say if they agree), "## Open questions" (2 to 4 bullets).'
};
const pick = x => !x ? '' : typeof x === 'string' ? x : Array.isArray(x) ? x.map(pick).join('') : pick(x.text || x.content || x.response || x.output_text);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'forbidden' }, 403);
  let b = {}; try { b = await request.json(); } catch {}
  const kind = b.kind === 'story' ? 'story' : 'day', text = String(b.text || '').trim();
  if (!text || text.length > 12000) return json({ error: 'story text missing or too long' }, 400);
  if (!env.AI) return json({ error: 'the Workers AI binding named AI is not set on this Pages project' }, 500);
  const head = kind === 'day' ? 'Period: ' + String(b.label || '').slice(0, 80) + '\nCoverage: ' + String(b.stats || '').slice(0, 80) + '\n\nNews items:\n' : 'Story: ' + String(b.label || '').slice(0, 200) + '\n\nReports:\n';
  let err = '';
  for (const m of MODELS) {
    try {
      const r = await env.AI.run(m, { messages: [{ role: 'system', content: PROMPTS[kind] + (/qwen/.test(m) ? ' /no_think' : '') }, { role: 'user', content: head + text }], max_tokens: kind === 'day' ? 1800 : 1400, temperature: 0.2 });
      const out = pick(r.response || r.output_text || (r.choices && r.choices[0] && ((r.choices[0].message && r.choices[0].message.content) || r.choices[0].text)) || r.output).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!out) throw new Error('empty reply');
      return json({ text: out, model: m.split('/').pop() });
    } catch (e) {
      err = m.split('/').pop() + ': ' + (e.message || e);
      if (/4006|daily free allocation/i.test(err)) break;
    }
  }
  return json({ error: err }, 502);
}
