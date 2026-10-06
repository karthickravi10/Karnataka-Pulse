// Runs the same dashboard code inside a simulated browser, fetches all sources, writes site/news.json
import { JSDOM } from 'jsdom'; import fs from 'fs';
const js = fs.readFileSync('app.js', 'utf8').replace(/<\/script>/g, '<\\/script>');
const html = fs.readFileSync('index.html', 'utf8').replace('<script src="app.js"></script>', () => '<script>' + js + '</script>');
let state = []; try { state = JSON.parse(fs.readFileSync('state/news.json', 'utf8')).items || []; } catch {}
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true,
  beforeParse(w) { w.fetch = (u, o = {}) => fetch(u, { ...o, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'en-IN,en;q=0.9', ...(o.headers || {}) } }); w.AbortController = AbortController; w.__BUILD = 1; if (process.env.CF_AI_TOKEN) w.__CF = { a: process.env.CF_ACCOUNT, t: process.env.CF_AI_TOKEN }; w.__STATE = state; w.matchMedia = () => ({ matches: false }); } });
const t0 = Date.now();
while (!dom.window.__done && Date.now() - t0 < 20 * 60e3) await new Promise(r => setTimeout(r, 2000));
if (!dom.window.__done) console.log('Time limit reached, saving what was fetched');
const o = dom.window.__out(), now = Math.floor(Date.now() / 1000);
const items = o.items.filter(i => i.ts > now - 3 * 86400);
const out = JSON.stringify({ updated: now, items, log: o.log });
fs.mkdirSync('state', { recursive: true }); fs.mkdirSync('site', { recursive: true }); fs.copyFileSync('index.html', 'site/index.html'); fs.copyFileSync('app.js', 'site/app.js'); fs.writeFileSync('state/news.json', out); fs.writeFileSync('site/news.json', out);
console.log(items.length + ' stories saved'); console.log(JSON.stringify(o.log, null, 1)); process.exit(0);
