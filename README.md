# cut-the-world_linktree

CutTheWorld｜断面研究所 — GitHub Pages で公開する単一HTMLのリンク集ページ。

- 公開URL: https://tsudsuraya.github.io/cut-the-world_linktree/
- 公開ページは引き続き単一HTML。例外として匿名outbound click解析専用のCloudflare Worker / D1を利用する

## クリック解析

- 既存Cloudflare Web Analytics: 訪問全体、referrer、端末、Web Vitals
- Worker / D1: クリックした訪問の流入属性と押下先
- 生IP、詳細User-Agent、Cookie、fingerprint、永続visitor/session IDは保存しない
- 生クリックイベントは180日後に日次処理で削除する
- `index.html` の `ANALYTICS_ENDPOINT` は本番Workerへ接続する
- 管理レポートAPIはWorker Secret `REPORT_TOKEN`のBearer認証が必須

Workerのローカルテスト:

```powershell
npm.cmd test
```

Cloudflare上の作成・migration・secret登録・デプロイは、通常のGitHub Pages公開とは別作業である。

## 最新note記事の自動更新

- 最新記事カードのみ、GitHub Actions がビルド時（毎日 06:15 JST）に更新する
  - `scripts/update_latest.py` が note の RSS（https://note.com/tsudsuraya/rss/）から先頭記事を取得し、
    `index.html` のマーカー区間を書き換え、差分があるときだけコミット・push する
- 手動実行: GitHub の Actions タブ → 「Update latest note article」→「Run workflow」
  （ローカルでは `python scripts/update_latest.py` を実行後、`.\deploy.ps1` で反映）
- RSS の取得に失敗した場合は `index.html` を書き換えず、最後に正常取得した記事の表示を維持する

## デプロイ

通常の変更は従来どおり `.\deploy.ps1 "コミットメッセージ"` で反映する（「反映して」運用は維持）。

Worker/D1の構成と保守手順は `analytics-worker/README.md` を参照する。

<!-- deploy test -->
