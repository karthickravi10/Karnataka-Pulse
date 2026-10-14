// Writes the AI daily briefing or the detailed story report. The dashboard sends the stories as plain text.
const MODELS = ['@cf/google/gemma-4-26b-a4b-it', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/mistralai/mistral-small-3.1-24b-instruct'];
const COMMON = 'Some items are in Kannada or Hindi: read them directly and write in clear English. Use standard English spellings for people, parties (BJP, Congress, JD(S)), places and organisations. Use ONLY facts that appear in the items. Never invent names, numbers, quotes, causes or dates. If the items are thin or conflict, say so plainly. Write in a formal news-brief style: short factual sentences, claims attributed to the person who made them, no filler.';
const PROMPTS = {
  day: 'You are an analyst writing the daily Karnataka politics, law-and-order and governance report for a monitoring desk. The input is a numbered list of news items from Karnataka media, each with zone, topic, number of outlets and time. ' + COMMON + ' Write 450 to 650 words in markdown with exactly these sections: "## Summary" (3 or 4 sentences), "## Top developments" (5 to 8 bullets, one sentence each, mention how many outlets reported it when the count is above 1), "## By zone" (for every zone that has items, a bold zone name followed by one or two sentences; zones are Bengaluru, OMR (Old Mysuru Region), Central, Coastal, Kittur, Kalyana, Statewide), "## Things to watch" (3 to 5 bullets).',
  leader: 'You are an analyst tracking named Karnataka political leaders for a monitoring desk. The input is a numbered list of news items, each tagged with the leader(s), the kind of activity, zone, number of outlets and time. ' + COMMON + ' Write 400 to 600 words in markdown with exactly these sections: "## Summary" (3 to 4 sentences on what the leader(s) did and said in the period), "## Press meets and statements" (bullets: who said what, including replies to other leaders, with item numbers), "## Administration and politics" (bullets on official decisions, orders, party and election matters), "## Public appearances and meetings" (bullets), "## Social media" (bullets for items that quote posts on X, otherwise write: No posts quoted in the items), "## To watch out" (bullets on announced visits, events and plans, otherwise write: Nothing announced in the items). When several leaders are listed, group the bullets by leader name. Mention item numbers like [3] after claims.',
  story: 'You are a news editor writing a concise, factual news brief on ONE story, using the numbered reports from one or more outlets. ' + COMMON + ' Output format, exactly: the first line is "# " followed by a headline of 10 to 18 words in title case that states who did or said what (for example: Former Minister KN Rajanna Alleges Same Group Behind Sting Operations Against Siddaramaiah and Ramesh Jarkiholi). Then a numbered list of 3 to 5 points, each a short paragraph of 1 to 3 sentences in plain, formal news style (past tense, third person). Point 1 gives the main development; later points give further claims, allegations, background, reactions, demands or consequences in order of importance. Attribute every claim to the person or party who made it, with words such as "alleged", "claimed", "said", "urged", "stated". Use full names and designations exactly as in the reports (for example BJP MLA, former CM, Chief Minister) and never introduce people who are not named in the reports. Do not add headings, labels such as Who/What/Where/When, questions, opinions, predictions, or any sentence about the reports themselves, the outlets, or what the reports do not say. If several outlets report it, merge their facts into one account and name an outlet only where the accounts differ. Do not state any year, month or date unless it is written in the reports. Write 120 to 220 words in total.'
};
const pick = x => !x ? '' : typeof x === 'string' ? x : Array.isArray(x) ? x.map(pick).join('') : pick(x.text || x.content || x.response || x.output_text);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'forbidden' }, 403);
  let b = {}; try { b = await request.json(); } catch {}
  const kind = b.kind === 'story' ? 'story' : b.kind === 'leader' ? 'leader' : 'day', text = String(b.text || '').trim();
  if (!text || text.length > 12000) return json({ error: 'story text missing or too long' }, 400);
  if (!env.AI) return json({ error: 'the Workers AI binding named AI is not set on this Pages project' }, 500);
  const head = kind !== 'story' ? 'Period: ' + String(b.label || '').slice(0, 80) + '\nCoverage: ' + String(b.stats || '').slice(0, 80) + '\n\nNews items:\n' : 'Story: ' + String(b.label || '').slice(0, 200) + '\nToday: ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) + '\n\nReports:\n';
  // the first person to ask for a story brief writes it; everyone else gets the saved copy (needs the optional KV binding named BRIEFS)
  const ck = kind === 'story' && b.key && env.BRIEFS ? 'b:' + String(b.key).slice(0, 200) : '';
  if (ck) { try { const c = await env.BRIEFS.get(ck); if (c) return json({ text: c, model: 'saved copy', cached: true }); } catch {} }
  let err = '';
  for (const m of MODELS) {
    try {
      const r = await env.AI.run(m, { messages: [{ role: 'system', content: PROMPTS[kind] + (/qwen/.test(m) ? ' /no_think' : '') }, { role: 'user', content: head + text }], max_tokens: kind === 'story' ? 800 : 1800, temperature: 0.2 });
      const out = pick(r.response || r.output_text || (r.choices && r.choices[0] && ((r.choices[0].message && r.choices[0].message.content) || r.choices[0].text)) || r.output).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!out) throw new Error('empty reply');
      if (ck) { try { await env.BRIEFS.put(ck, out, { expirationTtl: 604800 }); } catch {} }
      return json({ text: out, model: m.split('/').pop() });
    } catch (e) {
      err = m.split('/').pop() + ': ' + (e.message || e);
      if (/4006|daily free allocation/i.test(err)) break;
    }
  }
  return json({ error: err }, 502);
}
