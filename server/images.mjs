// images.mjs — model photos from content/images (mounted at /api/images).
//
//   GET /api/images/credits                     credits.json (source, author, licence per image)
//   GET /api/images/index                       index.json   { model: { hero, thumb, colours: {} } }
//   GET /api/images/:model.jpg                  1600 px hero
//   GET /api/images/:model/thumb.jpg            640 px hero thumbnail
//   GET /api/images/:model/:colour.jpg          1600 px per-colour image (when index.json lists one)
//   GET /api/images/:model/thumb/:colour.jpg    640 px per-colour thumbnail
//
// Only ids present in index.json are served (anything else is a JSON 404), so request
// paths never reach the filesystem unvalidated. Images are immutable-cached; the JSON is
// revalidated on every load because it changes when the image set is refreshed.
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';

const DIR = join(ROOT, 'content', 'images');
const IMMUTABLE = 'public, max-age=31536000, immutable';

let cache = { at: 0, index: {} };
function index() {
  // Re-read at most every 60 s so a refreshed image set is picked up without a restart.
  if (Date.now() - cache.at > 60000) {
    try { cache = { at: Date.now(), index: JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) }; }
    catch { cache = { at: Date.now(), index: {} }; }
  }
  return cache.index;
}
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);

function sendImage(res, rel) {
  const file = join(DIR, rel);
  if (!existsSync(file)) return notFound(res);
  res.sendFile(file, { headers: { 'Cache-Control': IMMUTABLE }, dotfiles: 'deny' });
}
function sendJson(res, name) {
  const file = join(DIR, name);
  if (!existsSync(file)) return notFound(res);
  res.sendFile(file, { headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json; charset=utf-8' } });
}
const notFound = (res) => res.status(404).json({ error: 'image not found' });

const router = express.Router();

router.get('/credits', (req, res) => sendJson(res, 'credits.json'));
router.get('/index', (req, res) => sendJson(res, 'index.json'));

router.get('/:model.jpg', (req, res) => {
  const m = index()[req.params.model];
  if (!own(index(), req.params.model) || !m.hero) return notFound(res);
  sendImage(res, m.hero);
});

router.get('/:model/thumb.jpg', (req, res) => {
  const m = index()[req.params.model];
  if (!own(index(), req.params.model) || !m.thumb) return notFound(res);
  sendImage(res, m.thumb);
});

router.get('/:model/thumb/:colour.jpg', (req, res) => {
  const { model, colour } = req.params;
  const m = index()[model];
  if (!own(index(), model) || !own(m.colours, colour)) return notFound(res);
  sendImage(res, join(model, 'thumb', `${colour}.jpg`));
});

router.get('/:model/:colour.jpg', (req, res) => {
  const { model, colour } = req.params;
  const m = index()[model];
  if (!own(index(), model) || !own(m.colours, colour)) return notFound(res);
  sendImage(res, m.colours[colour]);
});

router.use((req, res) => notFound(res));

export default router;
