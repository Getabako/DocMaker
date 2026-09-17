// 設定（~/DocMaker-data/config.json）。Node 標準のみ。
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_DATA_DIR = path.join(os.homedir(), 'DocMaker-data');
const CONFIG_PATH = path.join(DEFAULT_DATA_DIR, 'config.json');

const DEFAULTS = {
  dataDir: DEFAULT_DATA_DIR,
  chromePath: '',          // 空なら自動検出
  codexModel: '',          // 空なら codex の既定モデル（gpt-5.6-sol）
  organization: '',        // 差出人（会社名・屋号）の既定値
  contact: '',             // 連絡先の既定値
  theme: 'business',       // 企画書・一覧表の既定テーマ
};

function loadConfig() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {}; } catch {}
  const cfg = Object.assign({}, DEFAULTS, saved);
  cfg.dataDir = String(cfg.dataDir || DEFAULT_DATA_DIR).replace(/^~(?=$|\/)/, os.homedir());
  return cfg;
}

function saveConfig(patch) {
  const cur = loadConfig();
  const next = Object.assign({}, cur);
  for (const k of Object.keys(DEFAULTS)) {
    if (patch[k] !== undefined && patch[k] !== null) next[k] = String(patch[k]).trim();
  }
  if (!next.dataDir) next.dataDir = DEFAULT_DATA_DIR;
  next.dataDir = next.dataDir.replace(/^~(?=$|\/)/, os.homedir());
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { loadConfig, saveConfig, CONFIG_PATH, DEFAULTS };
