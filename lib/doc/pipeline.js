// 生成パイプライン: 依頼 → codex（JSON / image_gen） → 描画・書き出し → PDF
// 生成 AI は codex CLI（サブスク）のみ。有料 API は一切使わない。
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const store = require('./store.js');
const render = require('./render.js');
const xlsx = require('./xlsx.js');
const pdf = require('./pdf.js');
const prompts = require('./prompts.js');
const { which, runCodex, cleanCodexOutput, extractJSON } = require('./codex.js');

const SLIDE_BATCH = 8; // image_gen は 1 セッションで枚数が多いと崩れるので分割する

// --- ジョブ管理（メモリ内。画面は /api/jobs でポーリング） ---
const jobs = [];
let seq = 0;
const MAX_JOBS = 50;
function newJob(kind, label, projectId) {
  const j = { id: ++seq, kind, label, projectId, stage: 'queued', stageLabel: '待機中', progress: 0, detail: '', error: '', createdAt: Date.now(), updatedAt: Date.now() };
  jobs.unshift(j);
  while (jobs.length > MAX_JOBS) jobs.pop();
  return j;
}
function setStage(j, stage, label, progress, detail) {
  j.stage = stage; j.stageLabel = label;
  if (progress !== undefined && progress !== null) j.progress = progress;
  if (detail !== undefined) j.detail = detail;
  j.updatedAt = Date.now();
}
function listJobs() { return jobs; }

// 直列実行（codex を同時に走らせない）
let chain = Promise.resolve();
function enqueue(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function setProjectStatus(cfg, project, status, label, error) {
  project.status = status; project.statusLabel = label; project.error = error || '';
  store.saveProject(cfg.dataDir, project);
}

function stripCodexNoise(cx) { return cleanCodexOutput(cx.err).slice(-400) || cleanCodexOutput(cx.out).slice(-400); }

async function ensureCodex() {
  if (!(await which('codex'))) throw new Error('codex CLI が見つかりません。brew install codex（または npm i -g @openai/codex）のあと codex login してください。');
}

/** codex に JSON を書かせて読み戻す */
async function codexJSON(cfg, prompt, outPath, cwd, job, label) {
  await ensureCodex();
  try { fs.rmSync(outPath, { force: true }); } catch {}
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const cx = await runCodex(prompt, { cwd, model: cfg.codexModel || undefined, onLine: (l) => { if (job && l.trim()) job.detail = l.trim().slice(0, 120); } });
  let gen = store.readJSON(outPath, null);
  if (!gen) gen = extractJSON(cleanCodexOutput(cx.out)) || extractJSON(cleanCodexOutput(cx.err));
  if (!gen || typeof gen !== 'object') {
    throw new Error(`codex から${label}の JSON を取得できませんでした（codex login の状態を確認してください）。code=${cx.code} ${stripCodexNoise(cx)}`);
  }
  return gen;
}

function refImagesOf(brief) {
  return (Array.isArray(brief.refImages) ? brief.refImages : String(brief.refImages || '').split('\n'))
    .map((p) => String(p).trim()).filter((p) => p && fs.existsSync(p));
}

// ------------------------------------------------------------------ 各種別の生成
async function buildProposal(cfg, lic, project, job) {
  const dir = project.dir;
  setStage(job, 'generate', '企画書の中身を作成中（codex）', 20, '');
  const outPath = path.join(dir, 'work', 'proposal.json');
  const doc = await codexJSON(cfg, prompts.proposalPrompt(project.brief, outPath, today()), outPath, dir, job, '企画書');
  project.content = doc;
  writeProposalFiles(cfg, lic, project);
  await makePdf(cfg, project, job);
}

function writeProposalFiles(cfg, lic, project) {
  const dir = project.dir;
  const theme = project.brief.theme || cfg.theme || 'business';
  const r = render.renderProposal(project.content, { theme, credit: lic.mode === 'free' ? lic.freeCredit : '' });
  fs.writeFileSync(path.join(dir, 'proposal.html'), r.html);
  fs.writeFileSync(path.join(dir, 'proposal.css'), r.css);
  fs.writeFileSync(path.join(dir, 'proposal.md'), r.md);
  project.title = project.content.title || project.title;
  project.outputs = Object.assign({}, project.outputs, { html: 'proposal.html', css: 'proposal.css', md: 'proposal.md' });
  store.saveProject(cfg.dataDir, project);
}

async function buildSheet(cfg, lic, project, job) {
  const dir = project.dir;
  setStage(job, 'generate', '一覧表の中身を作成中（codex）', 20, '');
  const outPath = path.join(dir, 'work', 'sheet.json');
  const doc = await codexJSON(cfg, prompts.sheetPrompt(project.brief, outPath, today()), outPath, dir, job, '一覧表');
  project.content = doc;
  writeSheetFiles(cfg, lic, project);
  await makePdf(cfg, project, job);
}

function writeSheetFiles(cfg, lic, project) {
  const dir = project.dir;
  const doc = project.content;
  const theme = project.brief.theme || cfg.theme || 'business';
  const sheets = Array.isArray(doc.sheets) ? doc.sheets : [];
  xlsx.writeXlsx(path.join(dir, 'sheet.xlsx'), sheets);
  const csvs = [];
  sheets.forEach((sh, i) => { const n = `sheet${i + 1}_${store.slugify(sh.name || i + 1)}.csv`; xlsx.writeCsv(path.join(dir, n), sh); csvs.push(n); });
  const r = render.renderSheet(doc, { theme, credit: lic.mode === 'free' ? lic.freeCredit : '' });
  fs.writeFileSync(path.join(dir, 'sheet.html'), r.html);
  fs.writeFileSync(path.join(dir, 'sheet.css'), r.css);
  project.title = doc.title || project.title;
  project.outputs = Object.assign({}, project.outputs, { html: 'sheet.html', css: 'sheet.css', xlsx: 'sheet.xlsx', csv: csvs });
  store.saveProject(cfg.dataDir, project);
}

async function buildFlyer(cfg, lic, project, job) {
  const dir = project.dir;
  const brief = project.brief;
  if (!project.content) {
    setStage(job, 'copy', 'チラシの文言とビジュアル設計を作成中（codex）', 15, '');
    const outPath = path.join(dir, 'work', 'flyer.json');
    project.content = await codexJSON(cfg, prompts.flyerCopyPrompt(brief, outPath, today()), outPath, dir, job, 'チラシ文言');
    store.saveProject(cfg.dataDir, project);
  }
  await renderFlyerImage(cfg, project, job);
  await makePdf(cfg, project, job);
}

async function renderFlyerImage(cfg, project, job) {
  const dir = project.dir;
  const brief = project.brief;
  await ensureCodex();
  setStage(job, 'image', 'チラシ画像を生成中（codex image_gen）。2〜5 分かかります', 45, '');
  const fileName = 'flyer.png';
  const out = path.join(dir, fileName);
  if (fs.existsSync(out)) { // 履歴として残す
    const hist = `flyer_${Date.now()}.png`;
    try { fs.renameSync(out, path.join(dir, 'work', hist)); project.history.push({ at: Date.now(), file: `work/${hist}` }); } catch {}
  }
  const refs = refImagesOf(brief);
  const cx = await runCodex(prompts.flyerImagePrompt(project.content, brief, fileName, brief.size || 'a4', refs), {
    cwd: dir, model: cfg.codexModel || undefined, images: refs, onLine: (l) => { if (l.trim()) job.detail = l.trim().slice(0, 120); },
  });
  if (!fs.existsSync(out)) throw new Error('チラシ画像が生成されませんでした。' + stripCodexNoise(cx));
  project.title = project.content.headline || project.title;
  project.outputs = Object.assign({}, project.outputs, { png: [fileName] });
  store.saveProject(cfg.dataDir, project);
}

async function buildSlides(cfg, lic, project, job) {
  const dir = project.dir;
  const brief = project.brief;
  if (!project.content) {
    setStage(job, 'outline', 'スライド構成を作成中（codex）', 10, '');
    const outPath = path.join(dir, 'work', 'outline.json');
    project.content = await codexJSON(cfg, prompts.slidesOutlinePrompt(brief, outPath, today()), outPath, dir, job, 'スライド構成');
    (project.content.slides || []).forEach((x, i) => { x.no = i + 1; });
    project.title = project.content.title || project.title;
    store.saveProject(cfg.dataDir, project);
  }
  const slides = project.content.slides || [];
  if (!slides.length) throw new Error('スライド構成が空でした');
  fs.mkdirSync(path.join(dir, 'slides'), { recursive: true });
  const refs = refImagesOf(brief);
  const nos = slides.map((x) => x.no);
  const missing = () => nos.filter((n) => !fs.existsSync(path.join(dir, 'slides', `slide_${String(n).padStart(2, '0')}.png`)));
  for (let attempt = 0; attempt < 2 && missing().length; attempt++) {
    const todo = missing();
    for (let i = 0; i < todo.length; i += SLIDE_BATCH) {
      const batch = todo.slice(i, i + SLIDE_BATCH);
      const done = nos.length - missing().length;
      setStage(job, 'image', `スライド画像を生成中（${done}/${nos.length} 枚完了・codex image_gen）`, 15 + Math.round(70 * done / nos.length), `今回: ${batch.join(', ')} 番`);
      await ensureCodex();
      await runCodex(prompts.slidesBatchPrompt(project.content, brief, batch, refs), {
        cwd: dir, model: cfg.codexModel || undefined, images: refs, timeout: 40 * 60 * 1000,
        onLine: (l) => { if (l.trim()) job.detail = l.trim().slice(0, 120); },
      });
      project.outputs = Object.assign({}, project.outputs, { png: slidePngs(dir, nos) });
      store.saveProject(cfg.dataDir, project);
    }
  }
  const miss = missing();
  project.outputs = Object.assign({}, project.outputs, { png: slidePngs(dir, nos) });
  writeSpeakerNotes(project);
  store.saveProject(cfg.dataDir, project);
  if (miss.length) throw new Error(`スライド ${miss.join(', ')} 番が生成できませんでした。詳細画面の「この枚を作り直す」で再生成できます。`);
  await makePdf(cfg, project, job);
}

function slidePngs(dir, nos) {
  return nos.map((n) => `slides/slide_${String(n).padStart(2, '0')}.png`).filter((p) => fs.existsSync(path.join(dir, p)));
}
function writeSpeakerNotes(project) {
  const L = [`# ${project.content.title || ''} — スピーカーノート`, ''];
  for (const x of project.content.slides || []) {
    L.push(`## ${x.no}. ${x.title || ''}`, '');
    if (x.keyMessage) L.push(`**${x.keyMessage}**`, '');
    if (x.body) L.push(...String(x.body).split('\n').filter(Boolean).map((l) => `- ${l}`), '');
    if (x.notes) L.push(String(x.notes), '');
  }
  fs.writeFileSync(path.join(project.dir, 'speaker_notes.md'), L.join('\n'));
  project.outputs = Object.assign({}, project.outputs, { md: 'speaker_notes.md' });
}

// ------------------------------------------------------------------ PDF
async function makePdf(cfg, project, job) {
  const dir = project.dir;
  if (job) setStage(job, 'pdf', 'PDF を作成中', 90, '');
  const out = path.join(dir, `${store.slugify(project.title) || project.kind}.pdf`);
  // 古い PDF（名前が変わった場合）を消す
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.pdf') && path.join(dir, f) !== out) { try { fs.rmSync(path.join(dir, f)); } catch {} }
  if (project.kind === 'proposal' || project.kind === 'sheet') {
    const html = path.join(dir, project.kind === 'proposal' ? 'proposal.html' : 'sheet.html');
    if (!fs.existsSync(html)) throw new Error('HTML がまだありません');
    await pdf.htmlToPdf(html, out, cfg.chromePath);
  } else if (project.kind === 'flyer') {
    const pngs = (project.outputs.png || []).map((p) => path.join(dir, p));
    const sz = prompts.FLYER_SIZES[project.brief.size || 'a4'] || prompts.FLYER_SIZES.a4;
    await pdf.imagesToPdf(pngs, out, { page: sz.page, chromePath: cfg.chromePath });
  } else if (project.kind === 'slides') {
    const pngs = (project.outputs.png || []).map((p) => path.join(dir, p));
    await pdf.imagesToPdf(pngs, out, { page: 'fit', chromePath: cfg.chromePath });
  }
  project.outputs = Object.assign({}, project.outputs, { pdf: path.basename(out) });
  store.saveProject(cfg.dataDir, project);
  return out;
}

// ------------------------------------------------------------------ 入口
const BUILDERS = { proposal: buildProposal, sheet: buildSheet, flyer: buildFlyer, slides: buildSlides };
const MEMBER_ONLY = new Set(['flyer', 'slides']);

function checkLicense(lic, kind) {
  if (lic.mode !== 'full' && MEMBER_ONLY.has(kind)) {
    throw new Error(`${store.KIND_LABELS[kind]} の画像生成はアシュラ会員限定です。画面のメール認証欄に会員のメールアドレスを入れるとフル版になります。`);
  }
}

/** 新規作成をキューに入れる（即 project を返す） */
function submit(cfg, lic, kind, brief) {
  checkLicense(lic, kind);
  if (!BUILDERS[kind]) throw new Error('不明な種別: ' + kind);
  const project = store.createProject(cfg.dataDir, kind, brief);
  project.dir = path.join(cfg.dataDir, project.id);
  const job = newJob(kind, `${project.kindLabel}: ${project.title}`, project.id);
  enqueue(() => runBuild(cfg, lic, project, job));
  return { project, job };
}

async function runBuild(cfg, lic, project, job) {
  try {
    setProjectStatus(cfg, project, 'running', '生成中');
    setStage(job, 'start', '開始', 5, '');
    await BUILDERS[project.kind](cfg, lic, project, job);
    setProjectStatus(cfg, project, 'done', '完成');
    setStage(job, 'done', '完成', 100, '');
  } catch (e) {
    setProjectStatus(cfg, project, 'error', '失敗', e.message);
    setStage(job, 'error', '失敗', job.progress, '');
    job.error = e.message;
  }
}

/** 修正指示で作り直す */
function revise(cfg, lic, project, instruction) {
  checkLicense(lic, project.kind);
  const job = newJob(project.kind, `修正: ${project.title}`, project.id);
  enqueue(async () => {
    try {
      setProjectStatus(cfg, project, 'running', '修正中');
      const dir = project.dir;
      const kindLabel = project.kindLabel;
      const cur = JSON.stringify(project.content || {}, null, 1);
      if (project.kind === 'proposal' || project.kind === 'sheet' || project.kind === 'flyer' || project.kind === 'slides') {
        setStage(job, 'generate', '修正内容を反映中（codex）', 20, '');
        const outPath = path.join(dir, 'work', `revise_${Date.now()}.json`);
        const extra = project.kind === 'flyer' ? '\n- チラシ用: headline / subhead / bullets / info / cta / footer / visual の構造を保つ。' : project.kind === 'slides' ? '\n- スライド用: slides 配列の各要素の no は 1 から連番に振り直す。枚数を増減してよい。' : '';
        const next = await codexJSON(cfg, prompts.revisePrompt(kindLabel, cur, instruction, outPath, extra), outPath, dir, job, '修正版');
        project.history.push({ at: Date.now(), instruction, before: `work/${path.basename(outPath)}` });
        project.content = next;
        if (project.kind === 'proposal') { writeProposalFiles(cfg, lic, project); await makePdf(cfg, project, job); }
        else if (project.kind === 'sheet') { writeSheetFiles(cfg, lic, project); await makePdf(cfg, project, job); }
        else if (project.kind === 'flyer') { await renderFlyerImage(cfg, project, job); await makePdf(cfg, project, job); }
        else if (project.kind === 'slides') {
          (project.content.slides || []).forEach((x, i) => { x.no = i + 1; });
          // 構成が変わったので全部作り直す
          try { fs.rmSync(path.join(dir, 'slides'), { recursive: true, force: true }); } catch {}
          project.outputs.png = [];
          store.saveProject(cfg.dataDir, project);
          await buildSlides(cfg, lic, project, job);
        }
      }
      setProjectStatus(cfg, project, 'done', '完成');
      setStage(job, 'done', '完成', 100, '');
    } catch (e) {
      setProjectStatus(cfg, project, 'error', '失敗', e.message);
      setStage(job, 'error', '失敗', job.progress, ''); job.error = e.message;
    }
  });
  return job;
}

/** スライド 1 枚だけ作り直す */
function regenerateSlide(cfg, lic, project, no, instruction) {
  checkLicense(lic, project.kind);
  const slide = (project.content.slides || []).find((x) => x.no === no);
  if (!slide) throw new Error('そのスライド番号はありません');
  const job = newJob('slides', `スライド ${no} 番を作り直し: ${project.title}`, project.id);
  enqueue(async () => {
    try {
      setProjectStatus(cfg, project, 'running', `スライド ${no} 番を作り直し中`);
      setStage(job, 'image', `スライド ${no} 番を生成中（codex image_gen）`, 30, '');
      await ensureCodex();
      const dir = project.dir;
      const file = path.join(dir, 'slides', `slide_${String(no).padStart(2, '0')}.png`);
      if (fs.existsSync(file)) { try { fs.renameSync(file, path.join(dir, 'work', `slide_${String(no).padStart(2, '0')}_${Date.now()}.png`)); } catch {} }
      const refs = refImagesOf(project.brief);
      const cx = await runCodex(prompts.slideRegeneratePrompt(project.content, project.brief, slide, instruction, refs), { cwd: dir, model: cfg.codexModel || undefined, images: refs, onLine: (l) => { if (l.trim()) job.detail = l.trim().slice(0, 120); } });
      if (!fs.existsSync(file)) throw new Error('画像が生成されませんでした。' + stripCodexNoise(cx));
      const nos = (project.content.slides || []).map((x) => x.no);
      project.outputs.png = slidePngs(dir, nos);
      store.saveProject(cfg.dataDir, project);
      if (project.outputs.png.length === nos.length) await makePdf(cfg, project, job);
      setProjectStatus(cfg, project, 'done', '完成');
      setStage(job, 'done', '完成', 100, '');
    } catch (e) {
      setProjectStatus(cfg, project, 'error', '失敗', e.message);
      setStage(job, 'error', '失敗', job.progress, ''); job.error = e.message;
    }
  });
  return job;
}

/** PDF だけ作り直す */
function rebuildPdf(cfg, project) {
  const job = newJob(project.kind, `PDF 化: ${project.title}`, project.id);
  enqueue(async () => {
    try {
      // HTML 系は最新の content で描き直してから
      const lic = { mode: 'full' };
      if (project.kind === 'proposal' && project.content) writeProposalFiles(cfg, lic, project);
      if (project.kind === 'sheet' && project.content) writeSheetFiles(cfg, lic, project);
      await makePdf(cfg, project, job);
      setStage(job, 'done', '完成', 100, '');
    } catch (e) { setStage(job, 'error', '失敗', job.progress, ''); job.error = e.message; }
  });
  return job;
}

/** 手直しした HTML から PDF を作り直す（HTML を直接編集した人向け） */
function pdfFromHtml(cfg, project) {
  const job = newJob(project.kind, `PDF 化（HTML から）: ${project.title}`, project.id);
  enqueue(async () => {
    try { await makePdf(cfg, project, job); setStage(job, 'done', '完成', 100, ''); }
    catch (e) { setStage(job, 'error', '失敗', job.progress, ''); job.error = e.message; }
  });
  return job;
}

async function environment(cfg) {
  const codex = await which('codex');
  const chrome = pdf.findChrome(cfg.chromePath);
  return { codex, chrome: !!chrome, chromePath: chrome };
}

/** 直列キューが空になるまで待つ（CLI の make 用） */
function waitIdle() { return chain; }

module.exports = { submit, revise, regenerateSlide, rebuildPdf, pdfFromHtml, listJobs, environment, waitIdle, MEMBER_ONLY };
