// PDF 化。手元の Chrome / Chromium / Edge をヘッドレスで使う（無料・追加導入なし）。
// 画像（チラシ・スライド）は用紙サイズを合わせた HTML に包んでから印刷する。
// Chrome が無いときは python3 + Pillow（画像のみ）にフォールバック。
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge'],
};

function findChrome(override) {
  if (override && fs.existsSync(override)) return override;
  for (const c of CANDIDATES[process.platform] || CANDIDATES.linux) {
    if (c && fs.existsSync(c)) return c;
  }
  return '';
}

function fileUrl(p) {
  const abs = path.resolve(p).replace(/\\/g, '/');
  return 'file://' + (abs.startsWith('/') ? '' : '/') + encodeURI(abs).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

// Chrome 本体と補助プロセスをまとめて止める（親だけ殺すとヘルパーが残る）
function killTree(child) {
  try {
    if (process.platform === 'win32') execFile('taskkill', ['/T', '/F', '/PID', String(child.pid)], () => {});
    else process.kill(-child.pid, 'SIGKILL');
  } catch {}
  try { child.kill('SIGKILL'); } catch {}
}

function chromePrint(chrome, htmlPath, outPdf) {
  // Chrome は --print-to-pdf 後に終了しないことがある（headless=new）。出力ファイルの完成を検知したら自分で止める。
  return new Promise((resolve, reject) => {
    const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'docmaker-chrome-'));
    const args = [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--hide-scrollbars', '--run-all-compositor-stages-before-draw',
      '--disable-crash-reporter', '--disable-breakpad', '--noerrdialogs',
      '--virtual-time-budget=8000', '--no-pdf-header-footer',
      `--user-data-dir=${tmpProfile}`,
      `--print-to-pdf=${outPdf}`,
      fileUrl(htmlPath),
    ];
    let child;
    try { child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' }); }
    catch (e) { return reject(e); }
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c.toString(); if (stderr.length > 4000) stderr = stderr.slice(-4000); });
    let finished = false;
    let lastSize = -1, stableTicks = 0;
    const cleanup = () => { try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch {} };
    const finish = (err) => {
      if (finished) return; finished = true;
      clearInterval(poll); clearTimeout(hard);
      killTree(child);
      setTimeout(cleanup, 800);
      if (!err && fs.existsSync(outPdf) && fs.statSync(outPdf).size > 500) return resolve(outPdf);
      reject(err || new Error('Chrome の PDF 出力に失敗しました: ' + stderr.slice(-300)));
    };
    const poll = setInterval(() => {
      let size = -1;
      try { size = fs.statSync(outPdf).size; } catch {}
      if (size > 500 && size === lastSize) { if (++stableTicks >= 3) finish(null); }
      else stableTicks = 0;
      lastSize = size;
    }, 400);
    const hard = setTimeout(() => finish(new Error('Chrome の PDF 出力がタイムアウトしました')), 120000);
    child.on('error', (e) => finish(e));
    child.on('exit', () => setTimeout(() => finish(null), 200));
  });
}

/** HTML ファイル → PDF（HTML 側の @page で用紙を決める） */
async function htmlToPdf(htmlPath, outPdf, chromeOverride) {
  const chrome = findChrome(chromeOverride);
  if (!chrome) throw new Error('Chrome / Edge / Chromium が見つかりません。Google Chrome を入れるか、設定でブラウザのパスを指定してください。');
  fs.mkdirSync(path.dirname(outPdf), { recursive: true });
  try { fs.rmSync(outPdf, { force: true }); } catch {}
  return chromePrint(chrome, htmlPath, outPdf);
}

function pngSize(p) {
  try {
    const b = fs.readFileSync(p);
    if (b.length > 24 && b.toString('ascii', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch {}
  return null;
}

/**
 * 画像列 → 1 枚 1 ページの PDF。
 * page: 'a4' | 'a4-landscape' | 'fit'（画像比率のまま。幅 338.67mm 基準）
 */
async function imagesToPdf(images, outPdf, opts) {
  opts = opts || {};
  const list = images.filter((p) => fs.existsSync(p));
  if (!list.length) throw new Error('PDF にする画像がありません');
  const chrome = findChrome(opts.chromePath);
  const dir = path.dirname(outPdf);
  fs.mkdirSync(dir, { recursive: true });
  if (!chrome) return imagesToPdfPillow(list, outPdf);

  let size = 'A4 portrait';
  if (opts.page === 'a4-landscape') size = 'A4 landscape';
  else if (opts.page === 'fit') {
    const s = pngSize(list[0]) || { w: 16, h: 9 };
    const wmm = 338.67, hmm = Math.round((wmm * s.h / s.w) * 100) / 100;
    size = `${wmm}mm ${hmm}mm`;
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page { size: ${size}; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .pg { page-break-after: always; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; }
  .pg:last-child { page-break-after: auto; }
  .pg img { width: 100%; height: 100%; object-fit: contain; display: block; }
  </style></head><body>${list.map((p) => `<div class="pg"><img src="${fileUrl(p)}"></div>`).join('')}</body></html>`;
  const tmpHtml = path.join(dir, `.pdf-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html);
  try {
    try { fs.rmSync(outPdf, { force: true }); } catch {}
    return await chromePrint(chrome, tmpHtml, outPdf);
  } finally {
    try { fs.rmSync(tmpHtml, { force: true }); } catch {}
  }
}

function imagesToPdfPillow(list, outPdf) {
  return new Promise((resolve, reject) => {
    const py = [
      'import sys',
      'from PIL import Image',
      'paths = sys.argv[2:]',
      'imgs = [Image.open(p).convert("RGB") for p in paths]',
      'imgs[0].save(sys.argv[1], save_all=True, append_images=imgs[1:], resolution=150.0)',
    ].join('\n');
    execFile(process.platform === 'win32' ? 'python' : 'python3', ['-c', py, outPdf, ...list], { timeout: 120000 }, (err) => {
      if (!err && fs.existsSync(outPdf)) return resolve(outPdf);
      reject(new Error('PDF 化に失敗しました。Google Chrome を入れると PDF 化できます（または python3 + Pillow）。'));
    });
  });
}

module.exports = { findChrome, htmlToPdf, imagesToPdf, fileUrl };
