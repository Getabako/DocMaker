// 案件（プロジェクト）の保存。~/DocMaker-data/<id>/project.json + 生成物。
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KIND_LABELS = {
  proposal: '企画書・提案書',
  flyer: 'チラシ',
  slides: '説明資料（スライド）',
  sheet: '一覧表・シート',
};

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function slugify(s) {
  return String(s || '').trim().replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'doc';
}
function stamp(d) {
  d = d || new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

function projectDir(dataDir, id) {
  if (!id || /[\\/]/.test(id) || id.startsWith('.')) return null;
  const p = path.join(dataDir, id);
  return fs.existsSync(path.join(p, 'project.json')) ? p : null;
}

function createProject(dataDir, kind, brief) {
  const id = `${stamp()}_${slugify(brief.title || KIND_LABELS[kind] || kind)}`;
  const dir = path.join(dataDir, id);
  fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
  const project = {
    id, kind, kindLabel: KIND_LABELS[kind] || kind,
    title: String(brief.title || '').trim() || KIND_LABELS[kind],
    brief,
    status: 'queued', statusLabel: '待機中', error: '',
    content: null,
    outputs: {},
    history: [],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  writeJSON(path.join(dir, 'project.json'), project);
  return project;
}

function getProject(dataDir, id) {
  const dir = projectDir(dataDir, id);
  if (!dir) return null;
  const p = readJSON(path.join(dir, 'project.json'), null);
  if (p) p.dir = dir;
  return p;
}

function saveProject(dataDir, project) {
  const dir = path.join(dataDir, project.id);
  const copy = Object.assign({}, project);
  delete copy.dir;
  copy.updatedAt = Date.now();
  writeJSON(path.join(dir, 'project.json'), copy);
  project.updatedAt = copy.updatedAt;
  return project;
}

function listProjects(dataDir) {
  let names = [];
  try { names = fs.readdirSync(dataDir); } catch { return []; }
  const out = [];
  for (const n of names) {
    const p = readJSON(path.join(dataDir, n, 'project.json'), null);
    if (!p) continue;
    out.push({
      id: p.id, kind: p.kind, kindLabel: p.kindLabel, title: p.title, status: p.status, statusLabel: p.statusLabel,
      error: p.error, outputs: p.outputs || {}, createdAt: p.createdAt, updatedAt: p.updatedAt,
      to: (p.brief && p.brief.to) || '',
    });
  }
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out;
}

function deleteProject(dataDir, id) {
  const dir = projectDir(dataDir, id);
  if (!dir) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

module.exports = { KIND_LABELS, readJSON, writeJSON, createProject, getProject, saveProject, listProjects, deleteProject, projectDir, slugify };
