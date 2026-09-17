#!/usr/bin/env node
/*
 * 資料メーカー（DocMaker） — ローカル起動サーバ / コマンドライン生成
 * 依存パッケージなし（Node標準のみ）。静的ファイルを配信し、空きポートで起動してブラウザを自動で開く。
 * 生成は codex CLI（サブスク）のみ。PDF 化は手元の Chrome（無ければ python3 + Pillow）。有料 API は使わない。
 * 案件データはすべて ~/DocMaker-data/ に保存（外部送信なし）。
 *
 *   node bin/cli.js                       … サーバー起動（UI モード）
 *   node bin/cli.js make <brief.json>     … 画面なしで 1 件生成して完了まで待つ（AI モード・自動化用）
 *   node bin/cli.js pdf <案件ID>          … その案件の PDF を作り直す
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const { resolveLicense, activateByEmail, FREE_CREDIT } = require('../lib/ashura/license.js');
const configMod = require('../lib/doc/config.js');
const store = require('../lib/doc/store.js');
const pipeline = require('../lib/doc/pipeline.js');
const render = require('../lib/doc/render.js');
const prompts = require('../lib/doc/prompts.js');

const ROOT = path.resolve(__dirname, '..');
const START_PORT = parseInt(process.env.PORT || '4591', 10);

// --- アシュラ会員ライセンス ---
let licensePromise = null;
function getLicense() {
  if (!licensePromise) {
    licensePromise = resolveLicense().then((l) => Object.assign(l, { freeCredit: FREE_CREDIT })).catch(() => ({ mode: 'free', message: 'ライセンス判定に失敗したためフリー版で動作します。', freeCredit: FREE_CREDIT }));
  }
  return licensePromise;
}

// --- 共通ヘルパ ---
function sendJSON(res, obj, status) {
  res.writeHead(status || 200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > (limit || 5e6)) req.destroy(); });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(body));
  });
}
function parseJSONSafe(s, fallback) { try { return JSON.parse(s || ''); } catch { return fallback; } }
function openPath(p) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  exec(`${opener} "${p}"`, () => {});
}

// --- API ---
async function handleActivate(req, res) {
  const body = await readBody(req, 1e5);
  const email = String((parseJSONSafe(body, {}) || {}).email || '');
  try {
    const r = await activateByEmail(email);
    if (r.activated) { licensePromise = null; await getLicense(); }
    sendJSON(res, { activated: r.activated, message: r.message });
  } catch {
    sendJSON(res, { activated: false, message: '認証処理に失敗しました。時間をおいて再度お試しください。' });
  }
}
function handleLicense(req, res) {
  getLicense().then((lic) => sendJSON(res, { mode: lic.mode, message: lic.message, freeCredit: FREE_CREDIT, memberOnly: [...pipeline.MEMBER_ONLY] }));
}
async function handleConfigGet(req, res) {
  const cfg = configMod.loadConfig();
  const env = await pipeline.environment(cfg);
  sendJSON(res, { config: cfg, env, configPath: configMod.CONFIG_PATH, platform: process.platform, themes: render.THEMES, flyerSizes: prompts.FLYER_SIZES, kinds: store.KIND_LABELS });
}
async function handleConfigPost(req, res) {
  const body = parseJSONSafe(await readBody(req, 1e5), {}) || {};
  const cfg = configMod.saveConfig(body);
  try { fs.mkdirSync(cfg.dataDir, { recursive: true }); } catch {}
  const env = await pipeline.environment(cfg);
  sendJSON(res, { ok: true, config: cfg, env });
}
async function handleCreate(req, res) {
  const cfg = configMod.loadConfig();
  const lic = await getLicense();
  const body = parseJSONSafe(await readBody(req, 2e6), {}) || {};
  const kind = String(body.kind || '');
  const brief = body.brief && typeof body.brief === 'object' ? body.brief : {};
  if (!String(brief.memo || '').trim() && !String(brief.purpose || '').trim()) return sendJSON(res, { error: '内容メモか目的を入れてください' }, 400);
  try {
    const { project, job } = pipeline.submit(cfg, lic, kind, brief);
    sendJSON(res, { ok: true, projectId: project.id, job });
  } catch (e) { sendJSON(res, { error: e.message }, 400); }
}
function handleProjects(req, res) {
  const cfg = configMod.loadConfig();
  sendJSON(res, { projects: store.listProjects(cfg.dataDir), dataDir: cfg.dataDir });
}
function loadProject(res, id) {
  const cfg = configMod.loadConfig();
  const p = store.getProject(cfg.dataDir, id);
  if (!p) { sendJSON(res, { error: 'not found' }, 404); return null; }
  return { cfg, p };
}
function handleProjectGet(req, res, id) {
  const r = loadProject(res, id); if (!r) return;
  sendJSON(res, r.p);
}
async function handleRevise(req, res, id) {
  const r = loadProject(res, id); if (!r) return;
  const lic = await getLicense();
  const body = parseJSONSafe(await readBody(req, 1e6), {}) || {};
  const instruction = String(body.instruction || '').trim();
  if (instruction.length < 2) return sendJSON(res, { error: '修正指示を入れてください' }, 400);
  if (!r.p.content) return sendJSON(res, { error: 'まだ中身が生成されていません' }, 400);
  try { sendJSON(res, { ok: true, job: pipeline.revise(r.cfg, lic, r.p, instruction) }); }
  catch (e) { sendJSON(res, { error: e.message }, 400); }
}
async function handleSlideRegen(req, res, id) {
  const r = loadProject(res, id); if (!r) return;
  const lic = await getLicense();
  const body = parseJSONSafe(await readBody(req, 1e6), {}) || {};
  try { sendJSON(res, { ok: true, job: pipeline.regenerateSlide(r.cfg, lic, r.p, parseInt(body.no, 10), String(body.instruction || '')) }); }
  catch (e) { sendJSON(res, { error: e.message }, 400); }
}
async function handleContentPut(req, res, id) {
  // 画面で直接編集した JSON を保存して描き直す（HTML 系のみ）
  const r = loadProject(res, id); if (!r) return;
  const body = parseJSONSafe(await readBody(req, 5e6), null);
  if (!body || typeof body.content !== 'object') return sendJSON(res, { error: 'JSON が不正です' }, 400);
  r.p.content = body.content;
  store.saveProject(r.cfg.dataDir, r.p);
  sendJSON(res, { ok: true, job: pipeline.rebuildPdf(r.cfg, r.p) });
}
function handlePdf(req, res, id) {
  const r = loadProject(res, id); if (!r) return;
  sendJSON(res, { ok: true, job: pipeline.pdfFromHtml(r.cfg, r.p) });
}
function handleOpen(req, res, id) {
  const cfg = configMod.loadConfig();
  const dir = id ? store.projectDir(cfg.dataDir, id) : cfg.dataDir;
  if (!dir) return sendJSON(res, { error: 'not found' }, 404);
  openPath(dir);
  sendJSON(res, { ok: true });
}
function handleDelete(req, res, id) {
  const cfg = configMod.loadConfig();
  sendJSON(res, { ok: store.deleteProject(cfg.dataDir, id) });
}
// 生成物の配信 /files/<id>/<相対パス>
function serveProjectFile(req, res, id, rel) {
  const cfg = configMod.loadConfig();
  const dir = store.projectDir(cfg.dataDir, id);
  if (!dir) { res.writeHead(404); return res.end('Not Found'); }
  const fp = path.normalize(path.join(dir, rel));
  if (!fp.startsWith(dir)) { res.writeHead(403); return res.end('Forbidden'); }
  serveFile(res, fp, { 'Cache-Control': 'no-store' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
function serveFile(res, filePath, extraHeaders) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not Found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream' }, extraHeaders || {}));
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  try {
    const url = (req.url || '/').split('?')[0];
    const m = req.method;
    const seg = url.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });

    if (seg[0] === 'api') {
      const a = seg[1];
      if (m === 'GET' && a === 'license') return handleLicense(req, res);
      if (m === 'POST' && a === 'activate') return handleActivate(req, res);
      if (m === 'GET' && a === 'config') return handleConfigGet(req, res);
      if (m === 'POST' && a === 'config') return handleConfigPost(req, res);
      if (m === 'POST' && a === 'create') return handleCreate(req, res);
      if (m === 'GET' && a === 'jobs') return sendJSON(res, { jobs: pipeline.listJobs() });
      if (a === 'projects') {
        if (m === 'GET' && !seg[2]) return handleProjects(req, res);
        if (m === 'GET' && seg[2] && !seg[3]) return handleProjectGet(req, res, seg[2]);
        if (m === 'POST' && seg[2] && seg[3] === 'revise') return handleRevise(req, res, seg[2]);
        if (m === 'POST' && seg[2] && seg[3] === 'slide') return handleSlideRegen(req, res, seg[2]);
        if (m === 'PUT' && seg[2] && seg[3] === 'content') return handleContentPut(req, res, seg[2]);
        if (m === 'POST' && seg[2] && seg[3] === 'pdf') return handlePdf(req, res, seg[2]);
        if (m === 'POST' && seg[2] && seg[3] === 'open') return handleOpen(req, res, seg[2]);
        if (m === 'DELETE' && seg[2]) return handleDelete(req, res, seg[2]);
      }
      if (m === 'POST' && a === 'open-data-dir') return handleOpen(req, res, '');
      return sendJSON(res, { error: 'not found' }, 404);
    }
    if (seg[0] === 'files' && seg[1]) return serveProjectFile(req, res, seg[1], seg.slice(2).join('/'));

    let urlPath = decodeURIComponent(url);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
    serveFile(res, filePath);
  } catch (e) {
    res.writeHead(500); res.end('Server Error');
  }
});

function listen(port, triesLeft) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && triesLeft > 0) listen(port + 1, triesLeft - 1);
    else { console.error('起動に失敗しました:', e.message); process.exit(1); }
  });
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  資料メーカー 〜企画書・チラシ・説明資料・一覧表を PDF まで〜');
    console.log('  ' + url);
    console.log('  データ保存先: ' + configMod.loadConfig().dataDir);
    console.log('  終了するには Ctrl+C を押してください。');
    console.log('');
    try { fs.mkdirSync(configMod.loadConfig().dataDir, { recursive: true }); } catch {}
    getLicense().catch(() => {});
    if (process.env.DOCMAKER_NO_OPEN) return;
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
    exec(`${opener} ${url}`, () => {});
  });
}

// --- コマンドライン: make / pdf ---
async function cliMake(briefPath) {
  const cfg = configMod.loadConfig();
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const spec = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
  const kind = spec.kind;
  const brief = spec.brief || spec;
  const lic = await getLicense();
  const { project, job } = pipeline.submit(cfg, lic, kind, brief);
  console.log(`[docmaker] ${project.kindLabel} を生成します: ${project.id}`);
  const timer = setInterval(() => { process.stdout.write(`\r[docmaker] ${job.stageLabel} ${job.progress}% ${job.detail ? '- ' + job.detail.slice(0, 60) : ''}   `); }, 2000);
  await pipeline.waitIdle();
  clearInterval(timer);
  console.log('');
  const p = store.getProject(cfg.dataDir, project.id);
  if (p.status !== 'done') { console.error('[docmaker] 失敗: ' + p.error); process.exit(1); }
  console.log('[docmaker] 完成: ' + p.dir);
  for (const [k, v] of Object.entries(p.outputs || {})) console.log(`  ${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
  process.exit(0);
}
async function cliPdf(id) {
  const cfg = configMod.loadConfig();
  const p = store.getProject(cfg.dataDir, id);
  if (!p) { console.error('案件が見つかりません: ' + id); process.exit(1); }
  const job = pipeline.rebuildPdf(cfg, p);
  await pipeline.waitIdle();
  if (job.error) { console.error('失敗: ' + job.error); process.exit(1); }
  console.log('PDF: ' + path.join(p.dir, store.getProject(cfg.dataDir, id).outputs.pdf));
  process.exit(0);
}

const [, , cmd, arg] = process.argv;
if (cmd === 'make' && arg) cliMake(arg).catch((e) => { console.error(e.message); process.exit(1); });
else if (cmd === 'pdf' && arg) cliPdf(arg).catch((e) => { console.error(e.message); process.exit(1); });
else listen(START_PORT, 20);
