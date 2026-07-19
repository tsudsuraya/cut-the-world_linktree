# cut the world — Linktree

## プロジェクト概要

このプロジェクトは「cut the world」の Linktree（GitHub Pages で公開する単一HTMLのリンク集ページ）である。

- **公開URL**: https://tsudsuraya.github.io/cut-the-world_linktree/
- **本体ファイル**: `index.html`（単一HTML・外部依存は Google Fonts と Cloudflare Analytics のみ）

## デプロイ手順

ユーザーが「反映して」「デプロイして」「push して」等と言ったら、`index.html` 等の変更を
`git add` → `git commit` → `git push` で公開に反映すること。`.\deploy.ps1 "コミットメッセージ"` の利用も可
（メッセージ省略時は `update YYYY-MM-DD HH:mm` が自動で使われる）。

コミット後、GitHub Pages の再ビルドに **1〜2分** かかることをユーザーに伝えること。

## 設計思想

単一HTML・サーバー依存なし・ブラウザローカル完結。
この方針を崩す提案（サーバー化・フレームワーク導入等）はしないこと。
