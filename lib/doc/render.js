// 企画書・一覧表の HTML / CSS / Markdown 描画（A4・日本語向けの大きめ文字・ゆったり行間）
'use strict';

const THEMES = {
  business: { name: 'ビジネス（紺×金）', primary: '#1e2b4d', accent: '#b8963e', paper: '#ffffff', ink: '#22232b', soft: '#eef1f7', line: '#d5d9e3' },
  kids:     { name: 'キッズ（オレンジ×空色）', primary: '#e8702a', accent: '#2f9fd6', paper: '#ffffff', ink: '#2b2a33', soft: '#fff3e8', line: '#f2d5c0' },
  fresh:    { name: 'フレッシュ（ティール）', primary: '#1c8c82', accent: '#f2b632', paper: '#ffffff', ink: '#1f2a2a', soft: '#e8f5f3', line: '#c9e2de' },
  warm:     { name: 'ウォーム（茶×朱）', primary: '#6b4a2b', accent: '#c94f3d', paper: '#fffdf8', ink: '#2e241c', soft: '#f6efe4', line: '#e3d6c3' },
  mono:     { name: 'モノトーン', primary: '#222222', accent: '#888888', paper: '#ffffff', ink: '#111111', soft: '#f2f2f2', line: '#d0d0d0' },
};

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
function arr(a) { return Array.isArray(a) ? a.filter((x) => x !== null && x !== undefined && String(x).trim() !== '') : []; }

function baseCss(theme, opts) {
  const t = THEMES[theme] || THEMES.business;
  const landscape = opts && opts.landscape;
  return `/* 資料メーカー 生成スタイル（テーマ: ${t.name}） */
:root {
  --primary: ${t.primary};
  --accent: ${t.accent};
  --paper: ${t.paper};
  --ink: ${t.ink};
  --soft: ${t.soft};
  --line: ${t.line};
}
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
html { font-size: 11.5pt; }
body {
  margin: 0; background: #e9e9e9; color: var(--ink);
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "BIZ UDPGothic", "Noto Sans JP", "Meiryo", sans-serif;
  line-height: 1.85; letter-spacing: 0.03em;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.sheet { background: var(--paper); max-width: ${landscape ? '297mm' : '210mm'}; margin: 0 auto; padding: 16mm 16mm 18mm; min-height: ${landscape ? '210mm' : '297mm'}; }
@media print { body { background: #fff; } .sheet { max-width: none; margin: 0; padding: 0; min-height: 0; } }
h1, h2, h3 { line-height: 1.45; letter-spacing: 0.06em; margin: 0; }
p { margin: 0 0 0.8em; }
ul { margin: 0.2em 0 0.9em; padding-left: 1.4em; }
li { margin: 0.25em 0; }
table { border-collapse: collapse; width: 100%; margin: 0.4em 0 1.1em; font-size: 0.95em; page-break-inside: auto; }
th, td { border: 1px solid var(--line); padding: 0.45em 0.7em; vertical-align: top; text-align: left; }
th { background: var(--primary); color: #fff; font-weight: 600; letter-spacing: 0.06em; }
tr { page-break-inside: avoid; }
tbody tr:nth-child(even) td { background: var(--soft); }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
th:first-child, td:first-child { min-width: 6.5em; }
.credit { margin-top: 2em; font-size: 0.8em; color: #888; text-align: right; }
`;
}

function proposalCss(theme) {
  return baseCss(theme) + `
/* --- 企画書 --- */
.cover { border-top: 6px solid var(--primary); padding-top: 1.2em; margin-bottom: 2.2em; }
.cover .doctype { display: inline-block; background: var(--primary); color: #fff; font-size: 0.85em; letter-spacing: 0.2em; padding: 0.15em 0.9em; border-radius: 3px; margin-bottom: 1em; }
.cover h1 { font-size: 2.1em; color: var(--primary); }
.cover h1.long { font-size: 1.6em; }
.cover .subtitle { font-size: 1.15em; color: var(--accent); margin-top: 0.5em; font-weight: 600; letter-spacing: 0.08em; }
.cover .meta { margin-top: 1.6em; display: flex; justify-content: space-between; align-items: flex-end; gap: 2em; border-bottom: 1px solid var(--line); padding-bottom: 0.8em; }
.cover .to { font-size: 1.05em; font-weight: 600; }
.cover .from { text-align: right; font-size: 0.95em; color: #555; }
.lead { font-size: 1.02em; background: var(--soft); border-left: 5px solid var(--accent); padding: 0.9em 1.2em; margin-bottom: 1.8em; border-radius: 0 6px 6px 0; }
section { margin-bottom: 1.7em; }
section.long { page-break-inside: auto; }
h2 { font-size: 1.32em; color: var(--primary); border-bottom: 2px solid var(--primary); padding-bottom: 0.25em; margin-bottom: 0.7em; break-after: avoid; page-break-after: avoid; }
h2 + p { break-after: avoid; page-break-after: avoid; }
h2 .no { color: var(--accent); margin-right: 0.5em; font-variant-numeric: tabular-nums; }
h3 { font-size: 1.08em; color: var(--primary); margin: 0.9em 0 0.4em; padding-left: 0.6em; border-left: 4px solid var(--accent); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(30%, 1fr)); gap: 0.8em; margin: 0.4em 0 1em; }
.card { border: 1px solid var(--line); border-radius: 8px; padding: 0.8em 1em; background: #fff; page-break-inside: avoid; }
.card .ct { font-weight: 700; color: var(--primary); margin-bottom: 0.3em; letter-spacing: 0.05em; }
.card .cx { font-size: 0.93em; }
.steps { list-style: none; padding: 0; margin: 0.4em 0 1em; counter-reset: st; }
.steps li { display: flex; gap: 0.9em; align-items: flex-start; margin: 0.45em 0; page-break-inside: avoid; }
.steps li .n { counter-increment: st; flex: none; width: 2em; height: 2em; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.steps li .n::before { content: counter(st); }
.steps li .st { font-weight: 700; color: var(--primary); }
.callout { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 0.8em 1.1em; margin: 0.6em 0 1em; page-break-inside: avoid; }
.callout .ct { font-weight: 700; color: var(--accent); margin-bottom: 0.3em; }
.closing { margin-top: 2.2em; padding-top: 1em; border-top: 1px solid var(--line); }
.contact { margin-top: 1.2em; background: var(--soft); border-radius: 8px; padding: 0.9em 1.2em; font-size: 0.95em; page-break-inside: avoid; }
.contact .org { font-weight: 700; color: var(--primary); font-size: 1.05em; }
`;
}

function renderTable(tb) {
  if (!tb || !Array.isArray(tb.columns) || !tb.columns.length) return '';
  const cols = tb.columns.map((c) => (typeof c === 'string' ? c : (c && (c.label || c.key)) || ''));
  const rows = Array.isArray(tb.rows) ? tb.rows : [];
  const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && /^[-+]?[\d,]+(\.\d+)?\s*(円|%|名|人|回|分|時間|件)?$/.test(v.trim()) && v.trim() !== '');
  return `${tb.caption ? `<h3>${esc(tb.caption)}</h3>` : ''}<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((_, i) => { const v = Array.isArray(r) ? r[i] : (r && r[cols[i]]); return `<td${isNum(v) ? ' class="num"' : ''}>${nl2br(v == null ? '' : v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderSectionBody(sec) {
  let h = '';
  if (sec.lead) h += `<p><strong>${nl2br(sec.lead)}</strong></p>`;
  for (const p of arr(sec.paragraphs)) h += `<p>${nl2br(p)}</p>`;
  const bullets = arr(sec.bullets);
  if (bullets.length) h += `<ul>${bullets.map((b) => `<li>${nl2br(b)}</li>`).join('')}</ul>`;
  const cards = Array.isArray(sec.cards) ? sec.cards.filter(Boolean) : [];
  if (cards.length) h += `<div class="cards">${cards.map((c) => `<div class="card"><div class="ct">${esc(c.title || '')}</div><div class="cx">${nl2br(c.text || '')}</div></div>`).join('')}</div>`;
  const steps = Array.isArray(sec.steps) ? sec.steps.filter(Boolean) : [];
  if (steps.length) h += `<ol class="steps">${steps.map((s) => `<li><span class="n"></span><div><div class="st">${esc(s.title || '')}</div><div>${nl2br(s.text || '')}</div></div></li>`).join('')}</ol>`;
  if (Array.isArray(sec.tables)) for (const tb of sec.tables) h += renderTable(tb);
  if (sec.table) h += renderTable(sec.table);
  if (sec.callout && (sec.callout.text || sec.callout.title)) h += `<div class="callout"><div class="ct">${esc(sec.callout.title || '')}</div><div>${nl2br(sec.callout.text || '')}</div></div>`;
  const subs = Array.isArray(sec.subsections) ? sec.subsections.filter(Boolean) : [];
  for (const s of subs) h += `<h3>${esc(s.heading || '')}</h3>` + renderSectionBody(s);
  return h;
}

/** 企画書 → { html, css, md } */
function renderProposal(doc, opts) {
  opts = opts || {};
  const theme = opts.theme || 'business';
  const css = proposalCss(theme);
  const sections = Array.isArray(doc.sections) ? doc.sections.filter(Boolean) : [];
  const c = doc.contact || {};
  const contactLines = [c.person, c.tel && `TEL: ${c.tel}`, c.email && `Mail: ${c.email}`, c.web && `Web: ${c.web}`, c.address].filter(Boolean);
  const body = `
<div class="sheet">
  <header class="cover">
    ${doc.docType ? `<div class="doctype">${esc(doc.docType)}</div>` : ''}
    <h1 class="${String(doc.title || '').length > 22 ? 'long' : ''}">${esc(doc.title || '')}</h1>
    ${doc.subtitle ? `<div class="subtitle">${esc(doc.subtitle)}</div>` : ''}
    <div class="meta">
      <div class="to">${nl2br(doc.to || '')}</div>
      <div class="from">${doc.date ? `${esc(doc.date)}<br>` : ''}${nl2br(doc.from || '')}</div>
    </div>
  </header>
  ${doc.lead ? `<div class="lead">${nl2br(doc.lead)}</div>` : ''}
  ${sections.map((s, i) => `<section class="${(s.paragraphs || []).length + (s.bullets || []).length > 8 ? 'long' : ''}"><h2><span class="no">${String(i + 1).padStart(2, '0')}</span>${esc(s.heading || '')}</h2>${renderSectionBody(s)}</section>`).join('\n')}
  ${doc.closing ? `<div class="closing"><p>${nl2br(doc.closing)}</p></div>` : ''}
  ${(c.org || contactLines.length) ? `<div class="contact"><div class="org">${esc(c.org || '')}</div>${contactLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : ''}
  ${opts.credit ? `<div class="credit">${esc(opts.credit)}</div>` : ''}
</div>`;
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(doc.title || '企画書')}</title>
<link rel="stylesheet" href="${opts.cssName || 'proposal.css'}">
</head>
<body>${body}
</body>
</html>
`;
  return { html, css, md: proposalMarkdown(doc) };
}

function proposalMarkdown(doc) {
  const L = [];
  L.push(`# ${doc.title || ''}`);
  if (doc.subtitle) L.push(`## ${doc.subtitle}`);
  L.push('');
  if (doc.to) L.push(`宛先: ${doc.to}`);
  if (doc.from) L.push(`差出: ${doc.from}`);
  if (doc.date) L.push(`日付: ${doc.date}`);
  L.push('');
  if (doc.lead) L.push(doc.lead, '');
  const sec = (s, level) => {
    L.push(`${'#'.repeat(level)} ${s.heading || ''}`, '');
    if (s.lead) L.push(`**${s.lead}**`, '');
    for (const p of arr(s.paragraphs)) L.push(p, '');
    for (const b of arr(s.bullets)) L.push(`- ${b}`);
    if (arr(s.bullets).length) L.push('');
    for (const c of (s.cards || [])) if (c) L.push(`- **${c.title || ''}**: ${c.text || ''}`);
    if ((s.cards || []).length) L.push('');
    (s.steps || []).forEach((st, i) => { if (st) L.push(`${i + 1}. **${st.title || ''}** ${st.text || ''}`); });
    if ((s.steps || []).length) L.push('');
    const tables = [...(s.tables || []), ...(s.table ? [s.table] : [])];
    for (const tb of tables) {
      if (!tb || !Array.isArray(tb.columns)) continue;
      const cols = tb.columns.map((c) => (typeof c === 'string' ? c : c.label || c.key || ''));
      if (tb.caption) L.push(`### ${tb.caption}`, '');
      L.push(`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`);
      for (const r of (tb.rows || [])) L.push(`| ${cols.map((_, i) => String((Array.isArray(r) ? r[i] : r[cols[i]]) ?? '').replace(/\n/g, ' ')).join(' | ')} |`);
      L.push('');
    }
    if (s.callout && (s.callout.text || s.callout.title)) L.push(`> **${s.callout.title || ''}** ${s.callout.text || ''}`, '');
    for (const sub of (s.subsections || [])) if (sub) sec(sub, level + 1);
  };
  (doc.sections || []).forEach((s) => { if (s) sec(s, 2); });
  if (doc.closing) L.push(doc.closing, '');
  const c = doc.contact || {};
  if (c.org || c.person) L.push('---', [c.org, c.person, c.tel, c.email, c.web].filter(Boolean).join(' / '));
  return L.join('\n') + '\n';
}

/** 一覧表 → { html, css } （A4 横） */
function renderSheet(doc, opts) {
  opts = opts || {};
  const theme = opts.theme || 'business';
  const css = baseCss(theme, { landscape: true }) + `
/* --- 一覧表 --- */
h1 { font-size: 1.6em; color: var(--primary); border-bottom: 3px solid var(--primary); padding-bottom: 0.2em; margin-bottom: 0.5em; }
.desc { color: #555; margin-bottom: 1em; }
.tbl { page-break-after: always; }
.tbl:last-of-type { page-break-after: auto; }
.tbl h2 { font-size: 1.25em; color: var(--primary); margin: 0.4em 0 0.4em; }
.tbl h2 .badge { display: inline-block; font-size: 0.7em; background: var(--accent); color: #fff; padding: 0 0.6em; border-radius: 3px; margin-right: 0.6em; vertical-align: middle; letter-spacing: 0.1em; }
.notes { font-size: 0.9em; color: #555; }
.notes li { margin: 0.15em 0; }
thead { display: table-header-group; }
`;
  const sheets = Array.isArray(doc.sheets) ? doc.sheets.filter((s) => s && Array.isArray(s.columns)) : [];
  const body = `
<div class="sheet">
  <h1>${esc(doc.title || '一覧表')}</h1>
  ${doc.description ? `<p class="desc">${nl2br(doc.description)}</p>` : ''}
  ${sheets.map((s, i) => `<div class="tbl"><h2><span class="badge">表 ${i + 1}</span>${esc(s.name || '')}</h2>${s.description ? `<p class="desc">${nl2br(s.description)}</p>` : ''}${renderTable({ columns: s.columns, rows: s.rows })}${arr(s.notes).length ? `<ul class="notes">${arr(s.notes).map((n) => `<li>${nl2br(n)}</li>`).join('')}</ul>` : ''}</div>`).join('\n')}
  ${opts.credit ? `<div class="credit">${esc(opts.credit)}</div>` : ''}
</div>`;
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${esc(doc.title || '一覧表')}</title>
<link rel="stylesheet" href="${opts.cssName || 'sheet.css'}">
</head>
<body>${body}
</body>
</html>
`;
  return { html, css };
}

module.exports = { THEMES, renderProposal, renderSheet, proposalMarkdown };
