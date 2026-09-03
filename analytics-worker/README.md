# Click analytics Worker

GitHub Pagesから送られるoutbound clickだけを記録するCloudflare Worker / D1です。
既存Cloudflare Web Analyticsによる訪問全体の解析は置き換えません。

## 本番状態

- `wrangler.jsonc` は本番D1の`DB` bindingを1個だけ持つ
- `index.html` の `ANALYTICS_ENDPOINT` は本番Worker URLへ接続済み
- `REPORT_TOKEN` はCloudflare Worker Secretにのみ保存し、リポジトリには保存しない

## ローカルテスト

リポジトリルートで次を実行します。

```powershell
npm.cmd test
```

Wranglerでローカル起動する場合だけ、`.dev.vars.example`を`.dev.vars`へコピーし、
ローカル専用の長いランダムtokenを設定します。`.dev.vars`はcommitしません。

## 本番準備

1. CloudflareアカウントでD1 database `cut-the-world-click-analytics`を作成する
2. 返されたdatabase IDを`wrangler.jsonc`へ設定する
3. migrationをremote D1へ適用する
4. Workerを作成・deployする
5. ユーザー自身がWorker Secret `REPORT_TOKEN`へ長いランダム値を登録する
6. Worker URLを`index.html`の`ANALYTICS_ENDPOINT`へ設定する
7. GitHub Pages公開前に、許可origin、クリック送信、Bearer認証、CSV/JSONを確認する

リポジトリルートで依存関係を準備した後、Cloudflare操作は`analytics-worker`から実行します。

```powershell
npm.cmd ci
Set-Location analytics-worker
npm.cmd exec wrangler -- login
npm.cmd exec wrangler -- d1 create cut-the-world-click-analytics
# 表示されたdatabase IDをwrangler.jsoncへ設定する
npm.cmd exec wrangler -- d1 migrations apply DB --remote
npm.cmd exec wrangler -- deploy
npm.cmd exec wrangler -- secret put REPORT_TOKEN
```

`REPORT_TOKEN`の値はユーザーが対話入力し、画面共有、チャット、ソース、コマンド引数へ記載しません。
Worker URLが確定した後、GitHub Pagesを公開する前に`index.html`のプレースホルダーを置換します。

Cloudflare API token、`REPORT_TOKEN`、`.dev.vars`の内容は、ソース、HTML、ログ、チャットへ
記載しません。`database_id`はbinding識別子であり認証情報ではありません。

`wrangler secret put`はWorkerの新しいversionをdeployするため、secret登録も本番操作として扱います。

## Endpoint

- `POST /v1/events/click`: 許可originからのクリック記録。成功は`204`
- `OPTIONS /v1/events/click`: CORS preflight
- `GET /v1/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`: 全集計をJSONで返す
- `GET /v1/reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD&group=source_link&format=csv`
- `GET /health`: D1内容を含まない死活確認

管理APIでは`Authorization: Bearer <REPORT_TOKEN>`が必須です。tokenをURL queryへ入れません。
集計期間は最大366日です。

利用可能な`group`:

- `day`
- `link`
- `referrer`
- `source`
- `campaign`
- `source_link`

## 保持期間

Cronは毎日03:20 JSTに動作し、180日より古い生イベントを削除します。
将来の日次通知を追加する場合も、通知処理は保存・集計処理から分離します。
