// documents.mjs — document upload storage and the ARAG processing pipeline.
//
// Upload: POST /documents {kind, fileName, contentType, contentBase64, dealId?, customerId?}
//   (JSON body ≤ 8 MB, i.e. a file of up to ~6 MB). The file is saved under
//   content/dms/uploads/ (DMS_UPLOAD_DIR overrides; <tmpdir>/harbourline-dms/uploads
//   when not writable) and a `documents` row is inserted with status "uploaded".
// Seeded documents resolve their file from row.filePath, then
//   content/dms/samples/manifest.json, then content/dms/samples/<fileName>.
// Process: upload to the KB as a file resource (slug dms-doc-<id>, label topic/document,
//   so it is searchable but never part of the manual/policy scopes), wait ≤ 30 s for
//   PROCESSED (else 202 + status "processing": call again), then extraction (ai.extract).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from '../env.mjs';
import * as db from './db.mjs';
import * as kb from './kb.mjs';
import * as arag from '../arag.mjs';
import { extract, DOC_KINDS } from './ai.mjs';

const SAMPLES = join(ROOT, 'content', 'dms', 'samples');
let UPLOADS = process.env.DMS_UPLOAD_DIR || join(ROOT, 'content', 'dms', 'uploads');
export const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain' };

function manifest() {
  try { const j = JSON.parse(readFileSync(join(SAMPLES, 'manifest.json'), 'utf8')); return Array.isArray(j) ? j : j.samples || j.documents || j.files || []; } catch { return []; }
}
/** Manifest samples with the seeded document each resolves to (if any). */
export function samples() {
  const docsWithFile = db.all('documents').map((d) => [d, fileFor(d)]).filter(([, p]) => p);
  return manifest().map((m) => {
    const file = basename(m.file || m.fileName || m.path || '');
    const doc = docsWithFile.find(([, p]) => basename(p) === file)?.[0];
    return { file, kind: m.kind || null, title: m.title || null, dealNo: m.dealNo || m.expected?.dealNo || null, documentId: doc?.id || null, expected: m.expected || null };
  }).filter((m) => m.file && existsSync(join(SAMPLES, m.file)));
}
/** Absolute path of a document's file, or null. */
export function fileFor(doc) {
  if (doc.filePath) { const p = doc.filePath.startsWith('/') ? doc.filePath : join(ROOT, doc.filePath); if (existsSync(p)) return p; }
  if (doc.samplePdf) { const p = join(ROOT, doc.samplePdf); if (existsSync(p)) return p; }
  if (doc.fileName) { const p = join(SAMPLES, basename(doc.fileName)); if (existsSync(p)) return p; }
  // Manifest match: explicit document id, then same kind + deal number, then (for seeded
  // sample documents) the n-th sample of that kind ↔ the n-th manifest entry of that kind.
  const man = manifest(); const fileOf = (m) => { const p = m && join(SAMPLES, basename(m.file || m.fileName || m.path || '')); return p && existsSync(p) ? p : null; };
  const byId = man.find((x) => (x.documentId || x.docId) === doc.id); if (fileOf(byId)) return fileOf(byId);
  const byDeal = doc.dealId && man.find((x) => x.kind === doc.kind && (x.dealNo || x.expected?.dealNo) === doc.dealId); if (fileOf(byDeal)) return fileOf(byDeal);
  if (doc.samplePdf || doc.expected) {
    const peers = db.all('documents').filter((d) => d.kind === doc.kind && (d.samplePdf || d.expected)).map((d) => d.id).sort();
    const i = peers.indexOf(doc.id); const same = man.filter((x) => x.kind === doc.kind);
    if (i >= 0 && fileOf(same[i])) return fileOf(same[i]);
  }
  return null;
}

/** Public shape: hides the storage path and the seed's ground truth (`expected`). */
export const pubDoc = (d) => { if (!d) return d; const { filePath, samplePdf, expected, ...pub } = d; return { ...pub, hasFile: Boolean(fileFor(d)) }; };

export function validateUpload(b) {
  if (!b || typeof b !== 'object') return { error: 'JSON body required' };
  if (!DOC_KINDS.includes(b.kind)) return { error: `kind must be one of ${DOC_KINDS.join(', ')}` };
  const fileName = basename(String(b.fileName || '')).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120);
  if (!fileName) return { error: 'fileName is required' };
  const ext = extname(fileName).toLowerCase();
  const contentType = b.contentType || TYPES[ext];
  if (!Object.values(TYPES).includes(contentType)) return { error: 'only PDF, PNG, JPEG or text files are accepted' };
  if (typeof b.contentBase64 !== 'string' || !b.contentBase64) return { error: 'contentBase64 is required' };
  const buf = Buffer.from(b.contentBase64.replace(/^data:[^,]*,/, ''), 'base64');
  if (!buf.length) return { error: 'contentBase64 is empty or invalid' };
  if (buf.length > MAX_BYTES) return { error: `file larger than ${MAX_BYTES / 1048576} MB`, status: 413 };
  if (contentType === 'application/pdf' && buf.subarray(0, 5).toString() !== '%PDF-') return { error: 'file is not a PDF' };
  if (b.dealId && !db.get('deals', b.dealId)) return { error: 'unknown dealId' };
  if (b.customerId && !db.get('customers', b.customerId)) return { error: 'unknown customerId' };
  return { value: { kind: b.kind, fileName, contentType, buf, dealId: b.dealId || null, customerId: b.customerId || db.get('deals', b.dealId)?.customerId || null } };
}

function save(id, name, buf) {
  const write = (dir) => { mkdirSync(dir, { recursive: true }); const p = join(dir, `${id}-${name}`); writeFileSync(p, buf); return p; };
  try { return write(UPLOADS); } catch (e) {
    if (!['EACCES', 'EROFS', 'EPERM'].includes(e.code)) throw e;
    UPLOADS = join(tmpdir(), 'harbourline-dms', 'uploads');
    console.warn(`[dms] uploads dir not writable; using ${UPLOADS} (ephemeral)`);
    return write(UPLOADS);
  }
}
export function create(v, user) {
  const id = db.nextId('documents', 'DOC', 4);
  const p = save(id, v.fileName, v.buf);
  return db.insert('documents', {
    id, kind: v.kind, dealId: v.dealId, customerId: v.customerId, fileName: v.fileName, contentType: v.contentType, bytes: v.buf.length,
    uploadedAt: new Date().toISOString(), uploadedBy: user?.id || null, status: 'uploaded', extracted: {}, aragResourceId: null,
    filePath: p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p,
  });
}

/**
 * Returns {status: 200|202|4xx|502|504, body}. Never an endless 202: a KB resource that is
 * still PENDING 90 s after upload is deleted, the document goes back to "uploaded" and the
 * call answers 504 {status:"timeout", retryAfterSeconds} — the next call re-uploads under a
 * fresh slug (dms-doc-<id>-<attempt>), so a wedged processing job is never polled forever.
 */
const HARD_MS = 90000;
export async function processDoc(doc) {
  const t0 = Date.now(); const ms = {};
  if (!DOC_KINDS.includes(doc.kind)) return { status: 400, body: { error: `cannot process kind ${doc.kind}` } };
  if (!arag.configured()) return { status: 503, body: { error: 'knowledge box not configured' } };
  let rid = doc.aragResourceId; let started = doc.processingStartedAt ? Date.parse(doc.processingStartedAt) : null;
  if (rid && doc.status === 'processing' && !started) started = t0; // seeded "processing" rows
  if (rid && ['extracted', 'verified'].includes(doc.status)) started = started || t0;
  if (rid) { const info = await kb.resourceInfo(rid).catch(() => undefined); if (info === null) rid = null; else if (info?.created && !doc.processingStartedAt) started = Date.parse(info.created); }  // seeded ids are synthetic
  if (!rid) {
    const path = fileFor(doc);
    if (!path) return { status: 409, body: { error: 'this document has no file to process (seeded metadata only); upload one with POST /documents' } };
    const ext = extname(path).toLowerCase();
    const attempt = Number(doc.processingAttempts) || 0;
    const slug = `dms-doc-${String(doc.id).toLowerCase()}${attempt ? `-${attempt + 1}` : ''}`;
    try {
      const up = await kb.uploadFile({
        slug, title: `${doc.kind.replace(/_/g, ' ')} · ${doc.fileName || doc.id}`, fileName: basename(path),
        contentType: doc.contentType || TYPES[ext] || 'application/pdf', base64: readFileSync(path).toString('base64'),
        labels: [['topic', 'document']], metadata: { dmsDocumentId: doc.id, kind: doc.kind, dealId: doc.dealId || '' },
      });
      rid = up.id;
      // An existing resource under this slug: reuse it if processed, else move to a fresh slug.
      if (!up.created) {
        const info = await kb.resourceInfo(rid).catch(() => null);
        started = info?.created ? Date.parse(info.created) : t0;
        if (!info || (info.status === 'PENDING' && t0 - started > HARD_MS)) { if (info) await kb.deleteResource(rid).catch(() => {}); db.patch('documents', doc.id, { processingAttempts: attempt + 1 }); return processDoc(db.get('documents', doc.id)); }
      } else started = t0;
    } catch (e) { console.warn(`[dms doc] upload: ${e.message}`); return { status: 502, body: { error: 'upload to the knowledge box failed' } }; }
    db.patch('documents', doc.id, { aragResourceId: rid, status: 'processing', processingStartedAt: new Date(started).toISOString() });
  }
  ms.upload = Date.now() - t0;
  const remaining = HARD_MS - (Date.now() - started);
  const budget = Math.max(1000, remaining <= 50000 ? remaining : 40000); // ≤ 50 s per call (request timeout 58 s)
  const st = await kb.waitProcessed(rid, budget);
  ms.processing = Date.now() - t0 - ms.upload;
  if (st === 'PENDING') {
    if (Date.now() - started >= HARD_MS - 3000) {
      await kb.deleteResource(rid).catch(() => {});
      db.patch('documents', doc.id, { status: 'uploaded', aragResourceId: null, processingStartedAt: null, processingAttempts: (Number(doc.processingAttempts) || 0) + 1 });
      return { status: 504, body: { id: doc.id, status: 'timeout', error: 'knowledge box processing did not finish within 90 s', retryAfterSeconds: 60, hint: 'The ARAG processing queue is busy. POST /process again later: the file is re-uploaded as a fresh resource.', ms } };
    }
    return { status: 202, body: { id: doc.id, status: 'processing', aragResourceId: rid, retryAfterSeconds: 10, waitedSeconds: Math.round((Date.now() - started) / 1000), hardTimeoutSeconds: HARD_MS / 1000, ms } };
  }
  if (st === 'ERROR') { db.patch('documents', doc.id, { status: 'uploaded', aragResourceId: null, processingStartedAt: null }); return { status: 502, body: { error: 'the knowledge box could not process this file', aragResourceId: rid } }; }
  const t1 = Date.now();
  let ex;
  try { ex = await extract(doc, rid); } catch (e) { console.warn(`[dms doc] extract: ${e.message}`); return { status: 502, body: { error: 'extraction failed', aragResourceId: rid } }; }
  ms.extraction = Date.now() - t1; ms.total = Date.now() - t0;
  const row = db.patch('documents', doc.id, { status: 'extracted', extracted: ex.extracted, confidence: ex.confidence, verifyFields: ex.verifyFields, processedAt: new Date().toISOString(), processingStartedAt: null });
  return { status: 200, body: { id: doc.id, kind: doc.kind, status: row.status, aragResourceId: rid, extracted: ex.extracted, confidence: ex.confidence, verifyFields: ex.verifyFields, extractionStatus: ex.status, document: pubDoc(row), ms } };
}
