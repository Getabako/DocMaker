/* 資料メーカー — UI（依存なし） */
(function () {
  'use strict';
  var ASHURA_URL = 'https://service.if-juku.net/Ashura';
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function api(url, opts) { return fetch(url, opts).then(function (r) { return r.json(); }); }
  function postJSON(url, body, method) {
    return api(url, { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var z = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '/' + z(d.getMonth() + 1) + '/' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  // ---------- ライセンス ----------
  var license = { mode: 'free', message: 'ライセンス確認中……', freeCredit: '', memberOnly: ['flyer', 'slides'] };
  function isFree() { return license.mode !== 'full'; }
  function renderLicense() {
    var b = $('license-banner');
    b.textContent = license.message;
    b.className = 'license-banner ' + (isFree() ? 'lic-free' : 'lic-full');
    $('activate-panel').classList.toggle('hidden', !isFree());
    var credit = $('free-credit');
    credit.classList.toggle('hidden', !isFree());
    credit.textContent = license.freeCredit || ('アシュラ 資料メーカー フリー版 - ' + ASHURA_URL);
    document.querySelectorAll('.member-tag').forEach(function (t) { t.classList.toggle('hidden', !isFree()); });
  }
  api('/api/license').then(function (j) {
    license = { mode: j.mode || 'free', message: j.message || '', freeCredit: j.freeCredit || '', memberOnly: j.memberOnly || license.memberOnly };
  }).catch(function () {
    license.message = 'ライセンス判定に接続できないため、フリー版（企画書と一覧表）で動作します。';
  }).then(renderLicense);

  (function setupActivate() {
    var btn = $('activate-btn');
    function showMsg(text, ok) { var m = $('activate-msg'); m.textContent = text; m.className = 'activate-msg ' + (ok ? 'ok' : 'ng'); }
    function activate() {
      var email = ($('activate-email').value || '').trim();
      if (!email) { showMsg('メールアドレスを入力してください。', false); return; }
      btn.disabled = true;
      postJSON('/api/activate', { email: email }).then(function (d) {
        if (d && d.activated) {
          showMsg(d.message, true);
          return api('/api/license').then(function (j) { license = { mode: j.mode, message: j.message, freeCredit: j.freeCredit || '', memberOnly: j.memberOnly || [] }; renderLicense(); });
        }
        showMsg((d && d.message) || '認証に失敗しました。', false);
      }).catch(function () { showMsg('認証サーバに接続できませんでした。', false); })
        .then(function () { btn.disabled = false; });
    }
    btn.addEventListener('click', activate);
    $('activate-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') activate(); });
  })();

  // ---------- タブ ----------
  var views = ['make', 'list', 'detail', 'settings'];
  function showView(name) {
    views.forEach(function (v) { $('view-' + v).classList.toggle('hidden', v !== name); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.view === name || (name === 'detail' && t.dataset.view === 'list')); });
    if (name === 'list') loadProjects();
    if (name === 'settings') loadConfig();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { showView(t.dataset.view); }); });
  $('btn-back').addEventListener('click', function () { showView('list'); });

  // ---------- 設定・環境 ----------
  var meta = { themes: {}, flyerSizes: {}, kinds: {} };
  var config = {};
  function fillSelect(sel, obj, labelKey, current) {
    sel.innerHTML = Object.keys(obj).map(function (k) { return '<option value="' + esc(k) + '">' + esc(labelKey ? obj[k][labelKey] : obj[k]) + '</option>'; }).join('');
    if (current && obj[current]) sel.value = current;
  }
  function loadConfig() {
    return api('/api/config').then(function (d) {
      config = d.config || {};
      meta = { themes: d.themes || {}, flyerSizes: d.flyerSizes || {}, kinds: d.kinds || {} };
      fillSelect($('f-theme'), meta.themes, 'name', config.theme);
      fillSelect($('s-theme'), meta.themes, 'name', config.theme);
      fillSelect($('f-size'), meta.flyerSizes, 'label', 'a4');
      $('s-datadir').value = config.dataDir || '';
      $('s-chrome').value = config.chromePath || '';
      $('s-org').value = config.organization || '';
      $('s-contact').value = config.contact || '';
      $('s-model').value = config.codexModel || '';
      $('config-path').textContent = d.configPath || '';
      if (!$('f-from').value && config.organization) $('f-from').value = config.organization;
      renderEnv(d.env || {});
    });
  }
  function renderEnv(env) {
    var rows = [
      ['codex CLI（生成に必須）', env.codex, 'brew install codex のあと codex login してください（Windows: npm i -g @openai/codex）'],
      ['PDF 化のブラウザ（Chrome / Edge）', env.chrome, 'Google Chrome を入れるか、設定でブラウザのパスを指定してください。無い場合は PDF 以外の成果物だけ作られます'],
    ];
    $('env-check').innerHTML = rows.map(function (r) {
      return '<div class="env-row"><span class="' + (r[1] ? 'ok' : 'ng') + '">' + (r[1] ? '○' : '×') + '</span><span>' + esc(r[0]) + (r[1] && r[0].indexOf('PDF') === 0 ? ' <code>' + esc(env.chromePath || '') + '</code>' : '') + (r[1] ? '' : '<br><span class="note">' + esc(r[2]) + '</span>') + '</span></div>';
    }).join('');
    var warn = $('env-warning');
    if (!env.codex) { warn.textContent = 'codex CLI が見つかりません。生成には codex（ChatGPT サブスク）が必要です。設定タブの環境チェックを確認してください。'; warn.classList.remove('hidden'); }
    else if (!env.chrome) { warn.textContent = 'PDF 化に使うブラウザ（Chrome / Edge）が見つかりません。HTML・画像・Excel は作られますが、PDF は作られません。'; warn.classList.remove('hidden'); }
    else warn.classList.add('hidden');
  }
  $('btn-save-settings').addEventListener('click', function () {
    postJSON('/api/config', {
      dataDir: $('s-datadir').value, chromePath: $('s-chrome').value, organization: $('s-org').value,
      contact: $('s-contact').value, theme: $('s-theme').value, codexModel: $('s-model').value,
    }).then(function (d) { $('settings-msg').textContent = d.ok ? '保存しました。' : (d.error || '保存に失敗しました'); if (d.ok) { config = d.config; renderEnv(d.env || {}); } });
  });
  $('btn-open-data').addEventListener('click', function () { postJSON('/api/open-data-dir'); });
  loadConfig();

  // ---------- 作る ----------
  var kind = 'proposal';
  function applyKind() {
    document.querySelectorAll('.kind').forEach(function (b) { b.classList.toggle('active', b.dataset.kind === kind); });
    document.querySelectorAll('[data-for]').forEach(function (el) {
      el.classList.toggle('hidden', el.dataset.for.split(' ').indexOf(kind) < 0);
    });
    var labels = { proposal: '内容メモ', flyer: '内容メモ（イベントの魅力・伝えたいこと）', slides: '内容メモ（説明したいこと）', sheet: '内容メモ（表にしたいデータ・項目）' };
    $('f-memo').previousElementSibling && ($('f-memo').previousElementSibling.firstChild.textContent = labels[kind] + ' ');
    $('btn-submit').textContent = (meta.kinds[kind] || '') + 'を作成する';
  }
  document.querySelectorAll('.kind').forEach(function (b) { b.addEventListener('click', function () { kind = b.dataset.kind; applyKind(); }); });
  setTimeout(applyKind, 300);

  function collectBrief() {
    var v = function (id) { return ($(id).value || '').trim(); };
    var brief = {
      title: v('f-title'), to: v('f-to'), from: v('f-from'), audience: v('f-audience'), purpose: v('f-purpose'),
      avoid: v('f-avoid'), tone: v('f-tone'), mustInclude: v('f-must'), extra: v('f-extra'), memo: v('f-memo'),
    };
    if (kind === 'proposal') { brief.docType = v('f-doctype'); brief.length = v('f-length'); brief.theme = v('f-theme'); }
    if (kind === 'sheet') { brief.theme = v('f-theme'); }
    if (kind === 'flyer' || kind === 'slides') { brief.style = v('f-style'); brief.colors = v('f-colors'); brief.refImages = v('f-refs').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
    if (kind === 'flyer') {
      brief.size = v('f-size');
      brief.eventDate = v('f-edate'); brief.eventPlace = v('f-eplace'); brief.eventTarget = v('f-etarget'); brief.eventCapacity = v('f-ecap');
      brief.eventFee = v('f-efee'); brief.eventApply = v('f-eapply'); brief.eventHost = v('f-ehost'); brief.eventNote = v('f-enote');
    }
    if (kind === 'slides') { brief.count = parseInt(v('f-count'), 10) || 8; brief.durationMin = parseInt(v('f-duration'), 10) || 10; }
    return brief;
  }
  $('btn-submit').addEventListener('click', function () {
    var brief = collectBrief();
    if (!brief.memo && !brief.purpose) { alert('内容メモを入れてください。'); return; }
    if (isFree() && license.memberOnly.indexOf(kind) >= 0) { alert((meta.kinds[kind] || 'この種類') + 'はアシュラ会員限定です。画面上部のメール認証欄で認証してください。'); return; }
    var btn = $('btn-submit');
    btn.disabled = true;
    postJSON('/api/create', { kind: kind, brief: brief }).then(function (d) {
      if (d.error) { alert(d.error); return; }
      $('submit-note').textContent = '受け付けました。下の「処理状況」で進み具合が見えます。完成したら「作った資料」タブに並びます。';
      pollJobs();
      $('jobs-card').scrollIntoView({ behavior: 'smooth' });
    }).catch(function () { alert('送信に失敗しました'); }).then(function () { btn.disabled = false; });
  });

  // ---------- 処理状況 ----------
  var jobTimer = null;
  var lastJobs = [];
  function renderJobs(jobs) {
    var box = $('jobs');
    if (!jobs.length) { box.innerHTML = '<p class="note">まだ処理はありません。</p>'; return; }
    box.innerHTML = jobs.slice(0, 12).map(function (j) {
      return '<div class="job ' + esc(j.stage) + '" data-pid="' + esc(j.projectId) + '">' +
        '<div class="jl"><span class="jt">' + esc(j.label) + '</span><span class="js">' + esc(j.stageLabel) + ' ' + (j.progress || 0) + '%</span></div>' +
        '<div class="bar"><i style="width:' + (j.progress || 0) + '%"></i></div>' +
        (j.detail ? '<div class="jd">' + esc(j.detail) + '</div>' : '') +
        (j.error ? '<div class="je">' + esc(j.error) + '</div>' : '') +
        (j.stage === 'done' ? '<button type="button" class="secondary small" data-open="' + esc(j.projectId) + '">開く</button>' : '') +
        '</div>';
    }).join('');
    box.querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { openDetail(b.dataset.open); }); });
  }
  function pollJobs() {
    api('/api/jobs').then(function (d) {
      var jobs = d.jobs || [];
      renderJobs(jobs);
      var active = jobs.some(function (j) { return j.stage !== 'done' && j.stage !== 'error'; });
      // 完了した案件を詳細表示中なら更新
      jobs.forEach(function (j) {
        var prev = lastJobs.find(function (p) { return p.id === j.id; });
        if (prev && prev.stage !== j.stage && (j.stage === 'done' || j.stage === 'error') && currentDetailId === j.projectId) openDetail(j.projectId);
      });
      lastJobs = jobs;
      clearTimeout(jobTimer);
      jobTimer = setTimeout(pollJobs, active ? 2500 : 8000);
    }).catch(function () { jobTimer = setTimeout(pollJobs, 8000); });
  }
  pollJobs();

  // ---------- 一覧 ----------
  var projects = [];
  function loadProjects() {
    return api('/api/projects').then(function (d) { projects = d.projects || []; renderProjects(); });
  }
  function thumbOf(p) {
    var png = p.outputs && p.outputs.png;
    if (png && png.length) return '/files/' + encodeURIComponent(p.id) + '/' + png[0];
    return '';
  }
  function renderProjects() {
    var q = ($('list-search').value || '').trim();
    var k = $('list-kind').value;
    var list = projects.filter(function (p) {
      if (k && p.kind !== k) return false;
      if (q && (p.title + ' ' + (p.to || '')).indexOf(q) < 0) return false;
      return true;
    });
    var box = $('project-list');
    if (!list.length) { box.innerHTML = '<p class="note">まだ資料がありません。「作る」タブから作成してください。</p>'; return; }
    box.innerHTML = list.map(function (p) {
      var th = thumbOf(p);
      return '<div class="pcard" data-id="' + esc(p.id) + '">' + (th ? '<img class="thumb" src="' + esc(th) + '" alt="">' : '') +
        '<div class="pk">' + esc(p.kindLabel) + ' <span class="status ' + esc(p.status) + '">' + esc(p.statusLabel) + '</span></div>' +
        '<div class="pt">' + esc(p.title) + '</div>' +
        '<div class="pm">' + esc(p.to || '') + (p.to ? ' / ' : '') + fmtDate(p.createdAt) + '</div></div>';
    }).join('');
    box.querySelectorAll('.pcard').forEach(function (c) { c.addEventListener('click', function () { openDetail(c.dataset.id); }); });
  }
  $('list-search').addEventListener('input', renderProjects);
  $('list-kind').addEventListener('change', renderProjects);

  // ---------- 詳細 ----------
  var currentDetailId = null;
  function fileUrl(p, rel) { return '/files/' + encodeURIComponent(p.id) + '/' + rel.split('/').map(encodeURIComponent).join('/') + '?t=' + Date.now(); }
  function openDetail(id) {
    currentDetailId = id;
    api('/api/projects/' + encodeURIComponent(id)).then(function (p) {
      if (p.error) { alert('見つかりませんでした'); return; }
      renderDetail(p);
      showView('detail');
    });
  }
  function outputsHtml(p) {
    var o = p.outputs || {};
    var items = [];
    if (o.pdf) items.push(['PDF', o.pdf]);
    if (o.html) items.push(['HTML', o.html]);
    if (o.css) items.push(['CSS', o.css]);
    if (o.md) items.push(['Markdown', o.md]);
    if (o.xlsx) items.push(['Excel', o.xlsx]);
    (o.csv || []).forEach(function (c, i) { items.push(['CSV' + (o.csv.length > 1 ? ' ' + (i + 1) : ''), c]); });
    if (p.kind === 'flyer') (o.png || []).forEach(function (c) { items.push(['PNG', c]); });
    return '<div class="outputs">' + items.map(function (it) { return '<a href="' + esc(fileUrl(p, it[1])) + '" target="_blank">' + esc(it[0]) + '</a>'; }).join('') + '</div>';
  }
  function renderDetail(p) {
    var o = p.outputs || {};
    var h = '<section class="card"><div class="detail-head"><div><div class="pk">' + esc(p.kindLabel) + ' <span class="status ' + esc(p.status) + '">' + esc(p.statusLabel) + '</span></div><h2>' + esc(p.title) + '</h2>' +
      '<div class="note">' + esc(p.brief && p.brief.to ? '宛先: ' + p.brief.to + ' / ' : '') + fmtDate(p.createdAt) + '</div></div></div>';
    if (p.error) h += '<div class="warning-box">' + esc(p.error) + '</div>';
    h += '<h3>成果物</h3>' + outputsHtml(p);
    h += '<div class="actions">' +
      '<button type="button" class="secondary" id="d-open"><svg class="ic"><use href="#i-folder"/></svg>フォルダを開く</button>' +
      '<button type="button" class="secondary" id="d-pdf"><svg class="ic"><use href="#i-pdf"/></svg>' + (p.kind === 'proposal' || p.kind === 'sheet' ? 'HTML から PDF を作り直す' : 'PDF を作り直す') + '</button>' +
      '<button type="button" class="secondary danger" id="d-delete"><svg class="ic"><use href="#i-trash"/></svg>削除</button></div>';

    // プレビュー
    if (p.kind === 'proposal' || p.kind === 'sheet') {
      if (o.html) h += '<div class="preview"><iframe src="' + esc(fileUrl(p, o.html)) + '"></iframe></div>';
    } else if (p.kind === 'flyer') {
      if (o.png && o.png.length) h += '<div class="preview"><img src="' + esc(fileUrl(p, o.png[0])) + '" alt="チラシ"></div>';
      if (p.content) {
        var c = p.content;
        h += '<h3>文言</h3><dl class="copy-box"><dt>キャッチ</dt><dd>' + esc(c.headline) + '</dd><dt>サブ</dt><dd>' + esc(c.subhead) + '</dd>' +
          '<dt>魅力</dt><dd>' + esc((c.bullets || []).join('\n')) + '</dd><dt>開催情報</dt><dd>' + esc((c.info || []).map(function (i) { return i.label + ': ' + i.value; }).join('\n')) + '</dd>' +
          '<dt>行動喚起</dt><dd>' + esc(c.cta) + '</dd><dt>下部</dt><dd>' + esc(c.footer) + '</dd></dl>';
      }
    } else if (p.kind === 'slides' && p.content) {
      var pngs = o.png || [];
      h += '<div class="slide-grid">' + (p.content.slides || []).map(function (s) {
        var rel = 'slides/slide_' + String(s.no).padStart(2, '0') + '.png';
        var has = pngs.indexOf(rel) >= 0;
        return '<div class="slide">' + (has ? '<a href="' + esc(fileUrl(p, rel)) + '" target="_blank"><img src="' + esc(fileUrl(p, rel)) + '" alt=""></a>' : '<div class="missing">未生成</div>') +
          '<div class="sb"><span class="st">' + s.no + '. ' + esc(s.title) + '</span><button type="button" class="secondary small" data-regen="' + s.no + '">作り直す</button></div></div>';
      }).join('') + '</div>';
    }

    // 修正指示
    h += '<div class="revise"><h3>修正指示（一言で作り直し）</h3><textarea id="d-instruction" placeholder="例）費用の表を削って「別途お見積り」の一文に / もっと柔らかい言い方に / 3 枚目をグラフ中心に"></textarea>' +
      '<div class="actions"><button type="button" class="secondary" id="d-revise"><svg class="ic"><use href="#i-refresh"/></svg>この指示で作り直す</button></div>' +
      (p.kind === 'slides' ? '<p class="note">全体を作り直すと全スライドを再生成します（時間がかかります）。1 枚だけならその枚の「作り直す」を使ってください。</p>' : '') + '</div>';
    if (p.history && p.history.length) h += '<p class="history">修正履歴: ' + p.history.filter(function (x) { return x.instruction; }).map(function (x) { return fmtDate(x.at) + ' ' + x.instruction; }).map(esc).join(' / ') + '</p>';
    h += '</section>';
    $('detail').innerHTML = h;

    $('d-open').addEventListener('click', function () { postJSON('/api/projects/' + encodeURIComponent(p.id) + '/open'); });
    $('d-pdf').addEventListener('click', function () { postJSON('/api/projects/' + encodeURIComponent(p.id) + '/pdf').then(function (d) { if (d.error) alert(d.error); else { alert('PDF を作り直しています。数十秒で更新されます。'); pollJobs(); } }); });
    $('d-delete').addEventListener('click', function () {
      if (!confirm('この資料をフォルダごと削除します。よろしいですか？')) return;
      api('/api/projects/' + encodeURIComponent(p.id), { method: 'DELETE' }).then(function () { showView('list'); });
    });
    $('d-revise').addEventListener('click', function () {
      var ins = ($('d-instruction').value || '').trim();
      if (!ins) { alert('修正指示を入れてください'); return; }
      postJSON('/api/projects/' + encodeURIComponent(p.id) + '/revise', { instruction: ins }).then(function (d) {
        if (d.error) { alert(d.error); return; }
        alert('作り直しを開始しました。「作る」タブの処理状況で進み具合が見えます。');
        pollJobs();
      });
    });
    document.querySelectorAll('[data-regen]').forEach(function (b) {
      b.addEventListener('click', function () {
        var ins = prompt('この枚への修正指示（空でもOK）', '');
        if (ins === null) return;
        postJSON('/api/projects/' + encodeURIComponent(p.id) + '/slide', { no: parseInt(b.dataset.regen, 10), instruction: ins }).then(function (d) {
          if (d.error) { alert(d.error); return; }
          alert('作り直しを開始しました。'); pollJobs();
        });
      });
    });
  }
})();
