// codex に渡すプロンプト（企画書 / チラシ / 説明資料 / 一覧表）。生成 AI は codex CLI のみ。
'use strict';

function s(v) { return String(v == null ? '' : v).trim(); }
function line(label, v) { v = s(v); return v ? `- ${label}: ${v}\n` : ''; }

/** 全種別共通の「依頼内容」ブロック */
function briefBlock(brief) {
  let b = '';
  b += line('タイトル（仮）', brief.title);
  b += line('宛先・提出先', brief.to);
  b += line('差出人（自分・自社）', brief.from);
  b += line('対象読者・ターゲット', brief.audience);
  b += line('目的・ゴール', brief.purpose);
  b += line('トーン・雰囲気', brief.tone);
  b += line('必ず入れたいこと', brief.mustInclude);
  if (s(brief.avoid)) b += `- 🚨 避けたい・ぼかしたい表現（厳守）: ${s(brief.avoid)}\n  → 上記に当たる語や説明は直接書かず、同じ内容が伝わる別の言い回しに置き換える。\n`;
  b += line('その他の指示', brief.extra);
  if (s(brief.memo)) b += `\n【内容メモ（本人の言葉・箇条書き・メール等の素材。これを元に組み立てる）】\n${s(brief.memo)}\n`;
  return b;
}

const JSON_RULES = (outPath) => `
# 出力
- 上記の内容を持つ JSON オブジェクトを **1 つだけ** 作り、次のパスに UTF-8 で書き出す（JSON のみ。コードフェンスや前置き不要）: ${outPath}
- 書き出したら最後に「DONE」とだけ出力する。
- 日本語で書く。絵文字は使わない。事実が分からない箇所（金額・日付・人数など）は勝手に断定せず「要相談」「調整中」「別途お見積り」のように書くか、依頼内容にある値をそのまま使う。
- 半角英数字と全角文字の間には半角スペースを入れない（通常の日本語文書の書き方）。`;

// ------------------------------------------------------------------ 企画書
const PAGES_HINT = { short: '1〜2 ページ（要点のみ・セクション 4〜5 個）', standard: '3〜4 ページ（セクション 6〜8 個）', long: '5〜8 ページ（セクション 9〜12 個・詳細な表を含む）' };

function proposalPrompt(brief, outPath, today) {
  const docType = s(brief.docType) || '企画書';
  return `あなたは地方の中小事業者・自治体・金融機関向けに、通る${docType}を数多く書いてきた企画書のプロです。
以下の依頼内容から、そのまま提出できる ${docType} の中身を JSON で作成してください。

# 依頼内容
- 文書の種類: ${docType}
- 分量: ${PAGES_HINT[brief.length] || PAGES_HINT.standard}
- 本日の日付: ${today}
${briefBlock(brief)}
# 書き方
- 相手（宛先）が「これなら任せられる」と思える具体性: 背景→目的→内容（何をどう行うか）→対象・規模→スケジュール→体制→費用の考え方→期待効果→リスクと配慮→次のステップ、の流れを基本に、文書の種類と分量に合わせて取捨選択する。
- 各セクションは短い段落 1〜3 個と、必要に応じて箇条書き・表・ステップ・カード（3 つの特長など）・囲み（注記）を使い分ける。読み手が流し読みできるように、段落文だけの長いセクションは作らない。
- 表が向く情報（スケジュール・当日の流れ・費用項目・役割分担・比較）は必ず table にする。
- 固有名詞・数字は依頼内容にあるものだけを使う。無いものは「要相談」等にする。
- 敬体（です・ます）。宛先が組織なら「御中」、個人なら「様」。

# JSON の形（キーは全てこの通り。使わないキーは省略可）
{
  "docType": "${docType}",
  "title": "文書タイトル（20 字前後・内容が一目で分かる）",
  "subtitle": "副題（任意・20〜35 字）",
  "date": "${today}",
  "to": "宛先（改行可）",
  "from": "差出人（会社名・氏名。改行可）",
  "lead": "冒頭のリード文（2〜4 文。誰に何を提案するのか、一言でいうと何か）",
  "sections": [
    {
      "heading": "セクション見出し（番号は付けない）",
      "lead": "そのセクションの結論 1 文（任意）",
      "paragraphs": ["段落 1", "段落 2"],
      "bullets": ["箇条書き"],
      "cards": [{ "title": "特長名", "text": "説明 1〜2 文" }],
      "steps": [{ "title": "ステップ名", "text": "説明" }],
      "tables": [{ "caption": "表のタイトル（任意）", "columns": ["列 1", "列 2"], "rows": [["値", "値"]] }],
      "callout": { "title": "注記の見出し", "text": "注記本文" },
      "subsections": [{ "heading": "小見出し", "paragraphs": [], "bullets": [] }]
    }
  ],
  "closing": "結びの文（1〜3 文）",
  "contact": { "org": "組織名", "person": "担当者", "tel": "", "email": "", "web": "", "address": "" }
}
${JSON_RULES(outPath)}`;
}

function revisePrompt(kindLabel, currentJson, instruction, outPath, extraRules) {
  return `あなたは${kindLabel}の編集者です。現在の JSON（下記）に、修正指示を反映した新しい JSON を作ってください。
指示に無い部分は原則そのまま残す（勝手に削らない・言い換えない）。構造（キー名）は変えない。

# 修正指示
${s(instruction)}
${extraRules || ''}
# 現在の JSON
${currentJson}
${JSON_RULES(outPath)}`;
}

// ------------------------------------------------------------------ 一覧表
function sheetPrompt(brief, outPath, today) {
  return `あなたはデータ整理と資料作成のプロです。以下の依頼内容から、一覧表（シート）の中身を JSON で作成してください。
Excel / Google スプレッドシートに書き出し、A4 横の PDF にもなります。

# 依頼内容
- 本日の日付: ${today}
${briefBlock(brief)}
# 書き方
- 内容メモにある数字・項目はもれなく表に入れる。メモに無い値は勝手に作らず、空欄または「要確認」にする。
- 1 つの表は 4〜8 列程度に収める（横に長すぎる表は 2 つに分ける）。行数は必要なだけ。
- 集計（合計・小計）が意味を持つ表は最終行に合計行を入れる。金額は数字だけ（円や , は付けない）、単位は列名に書く（例: 「金額（円）」）。
- 表ごとに、読み手が誤解しない補足（前提・出典・注意）を notes に 0〜3 行。
- 複数の観点（例: 予算 / スケジュール / 役割分担）があるなら別々のシートにする。

# JSON の形
{
  "title": "資料タイトル",
  "description": "この一覧表が何をまとめたものか（1〜2 文）",
  "sheets": [
    {
      "name": "シート名（15 字以内）",
      "description": "この表の説明（任意）",
      "columns": ["列名 1", "列名 2"],
      "rows": [["値", "値"], ["値", "値"]],
      "notes": ["補足"]
    }
  ]
}
${JSON_RULES(outPath)}`;
}

// ------------------------------------------------------------------ 画像生成の共通ルール（SlideMaker の品質ルールを要約）
function imageGenRules(sizeLabel) {
  return `# 🚨 ツール使用ルール（絶対）
- 画像生成は **あなた（Codex）に内蔵された image_gen ツール（ChatGPT サブスク内蔵）を直接呼ぶ**。API キー・OpenAI SDK・curl・python 経由は禁止。
- 画像サイズは **必ず ${sizeLabel}**、不透明 PNG。image_gen の size 引数にこの値をそのまま渡す。
- **文字・枠・帯も含めて完成品を image_gen が 1 回の生成で丸ごと描く。** 背景だけ生成して PIL / Pillow / ImageMagick / draw.text で文字をあと載せするのは禁止（枠と文字が浮く典型的失敗）。
- 同じ見出し・同じ文言を 1 枚の中に 2 回描かない（背景のゴースト文字も禁止）。各テキストは画面内に 1 箇所だけ、くっきり 1 回。
- 視覚階層は **文字 > 主役ビジュアル > 背景**。文字は最もコントラストが高く、テキストパネルは不透明で内側に絵を描き込まない。背景は描き込んでよいが、文字の周囲は明度・彩度を落として一段引く。単色ベタののっぺり背景も失敗。
- 日本語の文言は **プロンプト内に正確に明記**し、1 行 15 字前後で折り返す。生成後に view_image で開き、(a) 文字化け・脱字・二重描きがないか (b) 最初に目が行くのが見出しか、を確認。崩れていれば同じファイルを作り直す。
- 絵文字・顔文字は描かない。実在の企業ロゴやキャラクターを模写しない（ロゴが必要なら「ロゴ差し込み位置」として無地の枠を空けておく）。
- 参考画像が添付されている場合は、その画風・配色・キャラクターを踏襲する（ただし文字は今回の文言に差し替える）。`;
}

// ------------------------------------------------------------------ チラシ
const FLYER_SIZES = {
  'a4': { size: '1448x2048', label: '1448x2048（A4 縦の比率）', page: 'a4' },
  'a4-landscape': { size: '2048x1448', label: '2048x1448（A4 横の比率）', page: 'a4-landscape' },
  'square': { size: '1536x1536', label: '1536x1536（正方形・SNS 用）', page: 'fit' },
};

function flyerCopyPrompt(brief, outPath, today) {
  return `あなたはチラシ・ポスターのコピーライター兼アートディレクターです。以下の依頼内容から、チラシ 1 枚に載せる文言と、ビジュアルの設計を JSON で作成してください（画像の生成はまだしない）。

# 依頼内容
- 本日の日付: ${today}
${briefBlock(brief)}
- 開催情報（あるものだけ）:
${line('  日時', brief.eventDate)}${line('  場所', brief.eventPlace)}${line('  対象', brief.eventTarget)}${line('  定員', brief.eventCapacity)}${line('  参加費', brief.eventFee)}${line('  申込方法', brief.eventApply)}${line('  主催・共催', brief.eventHost)}${line('  持ち物・その他', brief.eventNote)}
# 書き方
- チラシは「3 秒で何のチラシか分かり、10 秒で日時・対象・申込が分かる」が合格ライン。
- キャッチコピーは 12〜18 字、サブコピーは 20〜30 字。本文の箇条書きは 3〜4 項目・各 15 字以内。
- 開催情報は「日時 / 場所 / 対象 / 定員 / 参加費 / 申込」を情報ブロックとして短く。無い項目は入れない（「調整中」と書くのは日時だけ可）。
- 対象読者（子ども・保護者・高齢者・事業者など）に合わせた語彙・文字の大きさ・配色を選ぶ。
- 「避けたい表現」があれば、キャッチにも本文にもその語を使わない。

# JSON の形
{
  "headline": "キャッチコピー",
  "subhead": "サブコピー",
  "eyebrow": "上部の小さな帯文言（主催名・企画名など。任意）",
  "bullets": ["魅力 1", "魅力 2", "魅力 3"],
  "info": [{ "label": "日時", "value": "..." }, { "label": "場所", "value": "..." }],
  "cta": "行動喚起（申込はこちら / お問い合わせ など）",
  "footer": "主催・連絡先などの 1 行",
  "visual": {
    "concept": "メインビジュアルの内容を具体的に（誰が・何をしている・どんな雰囲気。60〜120 字）",
    "style": "画風（例: 明るいフラットイラスト / 写真風 / 和風 など）",
    "palette": ["主色 HEX", "アクセント HEX", "背景 HEX"],
    "layout": "レイアウトの指定（例: 上 1/3 に大きなキャッチ、中央にメインビジュアル、下 1/3 に情報ブロック。文字パネルの位置と形も）"
  }
}
${JSON_RULES(outPath)}`;
}

function flyerImagePrompt(copy, brief, fileName, sizeKey, refImages) {
  const sz = FLYER_SIZES[sizeKey] || FLYER_SIZES.a4;
  const v = copy.visual || {};
  const info = (copy.info || []).map((i) => `${i.label}: ${i.value}`).join(' / ');
  return `# あなたへの作業指示
あなたは熟練のチラシデザイナーです。以下の文言とビジュアル設計に従って、**チラシ画像を 1 枚** 生成し、現在のディレクトリ（cwd）に \`./${fileName}\` として保存してください。

${imageGenRules(sz.label)}
${refImages && refImages.length ? `- 参考画像が ${refImages.length} 枚添付されている。キャラクター・画風・配色の参考にする（文字はそのまま使わない）。\n` : ''}
# チラシに描く文言（一字一句この通り。省略・要約・言い換え禁止）
- 上部の帯（eyebrow）: ${s(copy.eyebrow) || '（なし）'}
- キャッチコピー（最大・主役）: ${s(copy.headline)}
- サブコピー: ${s(copy.subhead)}
- 魅力（箇条書き・各 1 行）:
${(copy.bullets || []).map((b) => `  - ${s(b)}`).join('\n')}
- 情報ブロック（ラベル: 値 の表組み風パネル）:
${(copy.info || []).map((i) => `  - ${s(i.label)}: ${s(i.value)}`).join('\n')}
- 行動喚起（ボタン風・目立つ）: ${s(copy.cta)}
- 最下部の 1 行: ${s(copy.footer)}

# ビジュアル設計
- メインビジュアル: ${s(v.concept)}
- 画風: ${s(v.style) || s(brief.style) || '明るく親しみやすいイラスト'}
- 配色: ${Array.isArray(v.palette) ? v.palette.join(' / ') : s(brief.colors)}
- レイアウト: ${s(v.layout)}
- 対象読者: ${s(brief.audience)}。この読者が手に取って読みやすい文字の大きさ（キャッチはチラシ幅の 7 割、本文も離れて読める大きさ）。
${s(brief.avoid) ? `- 🚨 描いてはいけない・ぼかす内容: ${s(brief.avoid)}（画面内のモチーフ・文言ともに避ける）` : ''}
${s(brief.extra) ? `- その他: ${s(brief.extra)}` : ''}

# 手順
1. 上の文言・設計をすべて含む image_gen プロンプトを組み立てる（レイアウト・各テキストの位置・パネルの形・文言そのものを明記）。
2. image_gen を 1 回呼び、\`./${fileName}\` に保存する（size=${sz.size}）。
3. view_image で開き、文言の誤り・文字化け・二重描き・情報ブロックの欠けを確認。問題があれば同じファイル名で作り直す（最大 3 回）。
4. 完了したらファイルパスだけを報告する。`;
}

// ------------------------------------------------------------------ 説明資料（スライド）
function slidesOutlinePrompt(brief, outPath, today) {
  const count = Math.max(3, Math.min(30, parseInt(brief.count, 10) || 8));
  return `あなたは説明資料（プレゼンスライド）の構成作家です。以下の依頼内容から、${count} 枚のスライドのアウトラインを JSON で作成してください（画像の生成はまだしない）。

# 依頼内容
- 本日の日付: ${today}
- 枚数: ${count} 枚
- 想定説明時間: ${s(brief.durationMin) || '10'} 分
${briefBlock(brief)}
# 書き方（「伝わる」ためのルール）
- 1 枚 1 メッセージ。見出し 15 字以内（結論を言い切る）、キーメッセージ 1 文 30 字以内、本文は最大 4 項目・各 15 字以内のキーワード。丁寧な説明は notes（話す内容）に回す。
- 構成の基本: 表紙 → 目的・結論 → 背景/課題 → 提案内容（何を・どう） → 対象・規模 → 流れ・スケジュール → 体制・安全面などの配慮 → 費用の考え方 → 期待効果 → 次のステップ。用途に合わせて取捨選択し、同じレイアウト型が 2 枚続かないよう kind と layout を散らす。
- kind は cover / divider / content / summary のいずれか。
- layout は hero（大きなビジュアル+少量文字）/ center（中央にキーフレーズ）/ two-column（左文字・右ビジュアル）/ number（巨大な数字）/ list（アイコン付き項目）/ diagram（フロー・比較表）/ table（表）から選ぶ。
- imagePrompt にはそのスライドのビジュアル（背景・モチーフ・図解）を 60〜120 字で具体的に書く（文言は書かない）。
- 「避けたい表現」がある場合、見出し・本文・imagePrompt のすべてでその語・モチーフを避ける。

# JSON の形
{
  "title": "資料タイトル",
  "subtitle": "副題",
  "slides": [
    { "no": 1, "kind": "cover", "layout": "hero", "section": "表紙", "title": "見出し", "keyMessage": "1 文", "body": "本文 1\\n本文 2", "notes": "話す内容（3〜6 行）", "imagePrompt": "ビジュアル指定" }
  ]
}
${JSON_RULES(outPath)}`;
}

function slidesBatchPrompt(outline, brief, slideNos, refImages) {
  const slides = (outline.slides || []).filter((x) => slideNos.includes(x.no));
  const style = s(brief.style) || 'モダンで清潔感のあるビジネス資料。余白多め。';
  const colors = s(brief.colors) || '紺 #1e2b4d を主色、金 #b8963e をアクセント';
  return `# あなたへの作業指示
あなたは熟練のプレゼンスライドデザイナーです。資料「${s(outline.title)}」のスライド ${slideNos.join(', ')} 番（計 ${slides.length} 枚）を 1 枚ずつ生成し、現在のディレクトリ（cwd）の \`./slides/\` 配下に \`slide_NN.png\`（NN は 2 桁の番号）として保存してください。既に存在する他の番号のファイルには触らない。

${imageGenRules('1920x1080（16:9）')}
${refImages && refImages.length ? `- 参考画像が添付されている。キャラクター・画風の参考にする。キャラは案内役として隅に置き、見出しと重ねない。\n` : ''}
# 全体のトーン
- 画風・デザイン: ${style}
- 配色: ${colors}
- 対象読者: ${s(brief.audience)}
- 文字サイズの目安: 見出し 90px 以上、本文 44px 以上（会場の後ろから読める）。
- 表紙と章扉以外は、右下に小さくページ番号（「${'NN'} / ${outline.slides.length}」形式）を描く。
- 同じレイアウト型を連続させない。文字パネルは不透明。
${s(brief.avoid) ? `- 🚨 描いてはいけない・ぼかす内容: ${s(brief.avoid)}（モチーフ・文言ともに避ける）` : ''}

# 各スライドの仕様（文言は一字一句この通り。省略・要約禁止）
${slides.map((x) => `## slide_${String(x.no).padStart(2, '0')}.png
- 種別: ${x.kind || 'content'} / レイアウト: ${x.layout || 'two-column'} / セクション: ${s(x.section)}
- 見出し: ${s(x.title)}
${s(x.keyMessage) ? `- キーメッセージ: ${s(x.keyMessage)}\n` : ''}- 本文（各 1 行で描く）:
${s(x.body).split('\n').filter(Boolean).map((l) => `  - ${l.trim()}`).join('\n') || '  （なし）'}
- ビジュアル: ${s(x.imagePrompt)}`).join('\n\n')}

# 手順
1. \`mkdir -p ./slides\`
2. 上から順に、各スライドについて「レイアウト・各テキストの位置・パネルの形・文言そのもの・ビジュアル」を全部入れた image_gen プロンプトを組み立て、image_gen を呼んで \`./slides/slide_NN.png\` に保存する（size=1920x1080）。
3. 各生成の直後に view_image で確認し、文言の誤り・二重描き・文字化けがあれば同じ番号を作り直す。
4. **指定された ${slides.length} 枚すべてが存在するまで turn を終わらせない。** \`ls ./slides/\` で確認する。
5. 完了したらファイル名の一覧だけを報告する。`;
}

function slideRegeneratePrompt(outline, brief, slide, instruction, refImages) {
  return slidesBatchPrompt(outline, brief, [slide.no], refImages) + `

# 追加の修正指示（この 1 枚だけ）
${s(instruction) || '（同じ仕様で作り直す）'}`;
}

module.exports = {
  briefBlock, proposalPrompt, revisePrompt, sheetPrompt,
  flyerCopyPrompt, flyerImagePrompt, FLYER_SIZES,
  slidesOutlinePrompt, slidesBatchPrompt, slideRegeneratePrompt, imageGenRules,
};
