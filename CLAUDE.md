# CutTheWorld — Linktree

## プロジェクト概要

このプロジェクトは「CutTheWorld」の Linktree（GitHub Pages で公開する単一HTMLのリンク集ページ）である。
ブランドの正式表記は **CutTheWorld**（URL・リポジトリ名は cut-the-world_linktree のまま変更しない）。

- **公開URL**: https://tsudsuraya.github.io/cut-the-world_linktree/
- **本体ファイル**: `index.html`（単一HTML・外部依存は Google Fonts、Cloudflare Analytics、匿名クリック解析Workerのみ）

## デプロイ手順

ユーザーが「反映して」「デプロイして」「push して」等と言ったら、`index.html` 等の変更を
`git add` → `git commit` → `git push` で公開に反映すること。`.\deploy.ps1 "コミットメッセージ"` の利用も可
（メッセージ省略時は `update YYYY-MM-DD HH:mm` が自動で使われる）。

コミット後、GitHub Pages の再ビルドに **1〜2分** かかることをユーザーに伝えること。

## 最新note記事の自動更新

- 公開ページは引き続き単一HTML。最新記事カードのみ GitHub Actions がビルド時に更新する
- `scripts/update_latest.py` が note の RSS から先頭記事を取得し、`index.html` の
  `<!-- LATEST_ARTICLE_START -->` 〜 `<!-- LATEST_ARTICLE_END -->` 区間を書き換える
- スケジュール: 毎日 06:15 JST（`.github/workflows/update-latest-note.yml`）
- 手動実行: GitHub の Actions タブ →「Update latest note article」→「Run workflow」
  （ローカルでは `python scripts/update_latest.py` → `.\deploy.ps1`）
- RSS 取得失敗時は `index.html` を書き換えず、最後に正常取得した記事の表示を維持する
- 「反映して」で既存 `deploy.ps1` を使う運用は維持する

## 設計思想

公開ページは単一HTMLを維持し、フレームワーク化やWebアプリ化をしない。
例外として、個人を識別しないoutbound click解析専用のCloudflare Worker / D1のみ利用できる。
既存Cloudflare Web Analyticsは削除せず、訪問全体の解析として維持する。

クリック解析では、生IP、詳細User-Agent、Cookie、fingerprint、永続visitor/session IDを保存しない。
D1は「クリックした訪問について、流入属性から押下先」を集計する用途に限定する。
Worker/D1の本番作成・migration・secret登録・デプロイは、ユーザーの明示的な承認後に行うこと。
