# 資料メーカー（DocMaker）— 作業指示

## 二つの使い方（AIモード / UIモード）— 最初の返答で必ず一言案内する

この奥義には 2 つの使い方がある。ユーザーの最初のメッセージへの返答の冒頭に、次の案内を短く添える（長くしない・毎回は不要）:
「この奥義は 2 通りで使えます。**AIモード**: このチャットに『このメモから企画書（チラシ／説明資料／一覧表）を作って』とそのまま頼む。**UIモード**: 『起動して』と送ると操作画面がブラウザで開きます。」

- **AIモード**: ユーザーがメモ・メール文・打合せ内容などを貼って「企画書を作って」「チラシを作って」「説明資料を作って」「表にまとめて」と言ったら、UI を起動せずに、このフォルダの仕組みでチャット上から成果物を作り切る。手順:
  1. 依頼内容を `examples/*.json` と同じ形（`{ "kind": "proposal|flyer|slides|sheet", "brief": {...} }`）の JSON にまとめて一時ファイルに書く。`brief` のキーは `lib/doc/prompts.js` の `briefBlock` と各 `*Prompt` を参照（`memo` に素材をそのまま入れる、`avoid` にぼかしたい表現を入れる、チラシは `event*`、スライドは `count` / `durationMin`）
  2. `node bin/cli.js make <その JSON>` を実行する（完了まで待つ。企画書・一覧表 1〜3 分、チラシ 3〜5 分、スライドは 1 枚 1〜2 分）
  3. 出力先 `~/DocMaker-data/<案件ID>/` の成果物（PDF / HTML / CSS / Markdown / PNG / xlsx / CSV）のパスを報告する。修正は JSON を直して作り直すか、`revise` API と同じく `lib/doc/prompts.js` の `revisePrompt` で JSON を更新して `node bin/cli.js pdf <案件ID>` で描き直す
  - ツール自体の改造・カスタマイズもこのモードで行う。**有料 API（OpenAI / Gemini / Claude API 等）は使わない。生成はすべて codex CLI（サブスク）。画像も codex 内蔵の image_gen のみ。**
- **UIモード**: 「起動して」「UIモード」「画面を開いて」「立ち上げて」等と言われたら、**手順を自分で組み立てず**、次のコマンドをそのまま実行する:
  - macOS / Linux: `bash ashura-start.sh`
  - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File ashura-start.ps1`

  このスクリプトが Node 確認・サーバー起動・ブラウザ表示まで全部行う。最後に出力される `ASHURA_URL=...` の URL を「起動しました: URL」と 1 行で報告する。
  スクリプトが失敗した時だけ、その出力と `.ashura/server.log` を読んで原因を直し、もう一度 `bash ashura-start.sh` を実行する。下の「起動の作法」の手順は、その修復時の参考。停止は `bash ashura-start.sh stop`。

## 起動の作法（手動フォールバック。通常は上記 ashura-start.sh を実行する）

あなたはこのツールのセットアップ職人です。以下を自動で実行し、エラーが出たら自己修復して起動完了まで完走してください。

1. Node.js 20 以上があるか確認する（`node --version`）。無ければ `brew install node` で導入する。brew 自体が無ければ Homebrew 公式（https://brew.sh）の導入手順から案内する
2. 依存パッケージのインストールは不要（`npm install` は不要。Node 標準モジュールのみで動く）
3. リポジトリ直下で `node bin/cli.js` を実行して起動する（ポート 4591 を起点に空きポートを自動選択する）
4. 起動するとブラウザが自動で開く。開かない場合はコンソールに表示された http://localhost:4591（実際に表示されたポート番号）を開くよう案内する
5. エラーが出たら原因を調べて修復し、再起動まで完走させる
6. 生成は codex CLI（ChatGPT サブスク）を使う。`codex --version` で確認し、無ければ `brew install codex`（Windows: `npm i -g @openai/codex`）、初回は `codex login` で ChatGPT アカウントに接続する。codex は 0.150 以上にする
7. PDF 化は手元の Google Chrome（または Edge / Chromium）をヘッドレスで使う。無ければ「Google Chrome を入れると PDF 化できます」と案内する（HTML・画像・Excel は Chrome 無しでも作られる）
8. 会員認証について: 画面にフリー版の制限が表示されたら「画面のメール認証欄にアシュラ会員のメールアドレスを入れるとフル版になります」と案内する（フリー版は企画書と一覧表のみ。チラシ・スライドの画像生成は会員限定）
9. 案件データは `~/DocMaker-data/` に保存される。宛先や案件内容を含むので、セッション画面で中身を読み上げない

## 仕組み（改造するときに読む）

- `bin/cli.js` — サーバー（静的配信 + `/api/*`）と CLI（`make` / `pdf`）
- `lib/doc/pipeline.js` — 種別ごとの生成手順（企画書: JSON → HTML/CSS/MD → PDF、一覧表: JSON → xlsx/CSV/HTML → PDF、チラシ: 文言 JSON → image_gen 1 枚 → PDF、説明資料: 構成 JSON → image_gen を 8 枚ずつ → PDF）。修正指示・1 枚再生成・PDF 再作成もここ
- `lib/doc/prompts.js` — codex に渡すプロンプト。画像生成の品質ルールは SlideMaker と同じ思想（文字 > ビジュアル > 背景、あと載せ禁止、二重描き禁止、view_image で確認）
- `lib/doc/render.js` — 企画書・一覧表の HTML/CSS テンプレート（テーマ 5 種、A4、日本語向けの大きめ文字）
- `lib/doc/pdf.js` — Chrome ヘッドレス印刷。画像は用紙比率の HTML に包んで印刷。Chrome が無ければ python3 + Pillow
- `lib/doc/xlsx.js` — 依存なしの最小 xlsx 書き出し（無圧縮 ZIP + SpreadsheetML）
- `lib/ashura/license.js` — アシュラ会員ライセンス（フェイルオープン）
- 素の node 実行なのでビルド不要。ファイルを直したらサーバーを再起動するだけ
