# 資料メーカー 〜企画書・チラシ・説明資料・一覧表を PDF まで〜

内容メモ（メール文・打合せメモ・箇条書き）を渡すだけで、**企画書（HTML / CSS / Markdown）・チラシ（画像）・説明資料（16:9 スライド）・一覧表（Excel / CSV）** を作り、**そのまま PDF まで** 仕上げるローカルツール。

- 依存パッケージなし（Node 標準のみ）
- 文章・表・画像の生成はすべて **codex CLI（ChatGPT サブスク）**。有料 API（OpenAI / Gemini 等）は一切使わない。画像は codex 内蔵の image_gen
- PDF 化は手元の **Google Chrome**（Edge / Chromium 可）をヘッドレスで使う。無ければ python3 + Pillow で画像だけ PDF 化
- 案件データはすべて `~/DocMaker-data/` に保存（外部送信なし）

## 起動

```bash
node bin/cli.js
```

既定ポート 4591（使用中なら自動で次の空きポート）。ブラウザが自動で開く。
スラッシュコマンド: `/docmaker`。会員向け起動スクリプト: `bash ashura-start.sh`

## 事前準備（macOS）

```bash
brew install codex
codex login          # ChatGPT アカウントに接続
```

Google Chrome が入っていれば PDF 化もそのまま動く。設定タブの「環境チェック」で確認できる。

## 使い方

1. **作る**: 種類（企画書・提案書 / チラシ / 説明資料 / 一覧表）を選び、内容メモを貼る。宛先・差出人・目的・「避けたい表現」などを入れて「作成する」
2. **処理状況**: 生成の進み具合が見える。企画書・一覧表 1〜3 分、チラシ 3〜5 分、スライドは 1 枚 1〜2 分。画面を閉じても続く
3. **作った資料**: カードを開くとプレビューと成果物（PDF / HTML / CSS / Markdown / PNG / xlsx / CSV）。「修正指示」に一言書けば作り直し。スライドは 1 枚ずつ作り直しも可
4. **設定**: 保存フォルダ、PDF 化に使うブラウザ、差出人の既定値、デザインテーマ

### 成果物

| 種類 | 生成物 |
|---|---|
| 企画書・提案書 | `proposal.html` + `proposal.css` + `proposal.md` + PDF（A4 縦・テーマ 5 種） |
| チラシ | `flyer.png`（A4 縦 / A4 横 / 正方形）+ PDF + 文言 JSON |
| 説明資料 | `slides/slide_NN.png`（1920x1080）+ PDF + `speaker_notes.md` |
| 一覧表 | `sheet.xlsx` + CSV + `sheet.html` + PDF（A4 横） |

企画書・一覧表は HTML/CSS を手で直してから「HTML から PDF を作り直す」もできる。

## コマンドラインで作る（自動化・AI モード）

```bash
node bin/cli.js make examples/hokuto-proposal.json   # 1 件作って完了まで待つ
node bin/cli.js pdf <案件ID>                          # PDF だけ作り直す
```

`examples/*.json` が依頼ファイルの見本（`{ "kind": "...", "brief": {...} }`）。

## ライセンス

フリー版は企画書と一覧表（フッターにクレジット付き）。チラシ・説明資料の画像生成はアシュラ会員限定。画面のメール認証欄で会員認証できる。`LICENSE.md` 参照。
