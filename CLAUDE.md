# CutTheWorld — Linktree

## プロジェクト概要

このプロジェクトは「CutTheWorld」の Linktree（GitHub Pages で公開する単一HTMLのリンク集ページ）である。
ブランドの正式表記は **CutTheWorld**（URL・リポジトリ名は cut-the-world_linktree のまま変更しない）。

- **公開URL**: https://tsudsuraya.github.io/cut-the-world_linktree/
- **本体ファイル**: `index.html`（単一HTML・外部依存は Google Fonts と Cloudflare Analytics のみ）

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

単一HTML・サーバー依存なし・ブラウザローカル完結。
この方針を崩す提案（サーバー化・フレームワーク導入等）はしないこと。
