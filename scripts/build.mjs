// Build public/index.html from the page source plus inlined data (catalogue + Domo stand-in),
// so the page also works on hosts without the API server (e.g. the claude.ai artifact).
// Usage: node scripts/build.mjs [path/to/configurator.html]
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = process.argv[2] || path.join(root, 'src', 'configurator.html');
const page = fs.readFileSync(src, 'utf8');
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const catalog = readJson(path.join(root, 'content', 'catalog.json'));
const domoDir = path.join(root, 'content', 'domo');
let stock = null;
if (fs.existsSync(domoDir)) {
  stock = {};
  for (const f of fs.readdirSync(domoDir).filter(f => f.endsWith('.json'))) stock[f.replace('.json', '')] = readJson(path.join(domoDir, f));
  if (!stock.stock_by_site) stock = null;
}
const data = { catalog, stock };
const inline = `<script>window.__DATA__=${JSON.stringify(data).replace(/<\//g, '<\\/')};</script>\n`;
const head = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>:root{color-scheme:light dark}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n`;
const body = page.replace(/^<header class="band">/m, '</head>\n<body>\n<header class="band">');
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'index.html'), head + body.replace('<script>\n(function(){', inline + '<script>\n(function(){') + '\n</body>\n</html>\n');
// artifact flavour: no doctype/head wrapper, data inlined
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), page.replace('<script>\n(function(){', inline + '<script>\n(function(){'));
console.log('built public/index.html and dist/artifact.html', catalog ? `(catalogue: ${catalog.models.length} models)` : '(no catalogue yet, page uses its fallback)', stock ? '(stock inlined)' : '(no stock files yet)');
