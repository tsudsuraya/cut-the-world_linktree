import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteExpiredEvents,
  deriveSource,
  handleRequest,
  normalizedClickedUrl,
  toCsv,
  validateClickPayload
} from "../analytics-worker/src/index.js";

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async run() {
    this.db.runs.push({sql: this.sql, params: this.params});
    return {success: true};
  }

  async all() {
    this.db.reads.push({sql: this.sql, params: this.params});
    return {success: true, results: this.db.results};
  }
}

function mockDb(results = []) {
  return {
    runs: [],
    reads: [],
    results,
    prepare(sql) {
      return new MockStatement(this, sql);
    },
    async batch(statements) {
      this.reads.push(...statements.map(({sql, params}) => ({sql, params})));
      return statements.map(() => ({success: true, results: []}));
    }
  };
}

const basePayload = Object.freeze({
  event_id: "123e4567-e89b-42d3-a456-426614174000",
  link_id: "latest_note",
  clicked_url: "https://note.com/tsudsuraya/n/nabc123?tracking=remove#fragment",
  landing_page: "/cut-the-world_linktree/",
  referrer_host: "NOTE.COM",
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  device_type: "mobile"
});

test("source priority is utm_source, then referrer_host, then direct", () => {
  assert.equal(deriveSource(" Instagram ", "note.com"), "instagram");
  assert.equal(deriveSource(null, "NOTE.COM"), "note.com");
  assert.equal(deriveSource("", ""), "direct");
});

test("clicked URL is allowlisted and stripped of query/hash", () => {
  assert.equal(
    normalizedClickedUrl(basePayload.clicked_url, "latest_note"),
    "https://note.com/tsudsuraya/n/nabc123"
  );
  assert.equal(normalizedClickedUrl("https://evil.example/path", "latest_note"), null);
  assert.equal(normalizedClickedUrl("https://note.com/someone/n/nabc123", "latest_note"), null);
  assert.equal(normalizedClickedUrl("https://note.com/tsudsuraya", "unknown"), null);
});

test("validated event uses server time and stores only coarse fields", () => {
  const now = new Date("2026-09-03T16:30:00.000Z");
  const event = validateClickPayload(basePayload, now);
  assert.equal(event.occurredAt, "2026-09-03T16:30:00.000Z");
  assert.equal(event.reportDateJst, "2026-09-04");
  assert.equal(event.clickedUrl, "https://note.com/tsudsuraya/n/nabc123");
  assert.equal(event.referrerHost, "note.com");
  assert.equal(event.source, "note.com");
  assert.equal("ip" in event, false);
  assert.equal("userAgent" in event, false);
  assert.equal("sessionId" in event, false);
});

test("click endpoint accepts only the configured GitHub Pages origin", async () => {
  const db = mockDb();
  const env = {DB: db, ALLOWED_ORIGIN: "https://tsudsuraya.github.io"};
  const accepted = await handleRequest(new Request("https://worker.example/v1/events/click", {
    method: "POST",
    headers: {Origin: "https://tsudsuraya.github.io", "Content-Type": "text/plain;charset=UTF-8"},
    body: JSON.stringify(basePayload)
  }), env);

  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get("Access-Control-Allow-Origin"), "https://tsudsuraya.github.io");
  assert.equal(db.runs.length, 1);
  assert.match(db.runs[0].sql, /ON CONFLICT\(event_id\) DO NOTHING/);
  assert.equal(db.runs[0].params[4], "https://note.com/tsudsuraya/n/nabc123");
  assert.equal(db.runs[0].params[7], "note.com");

  const rejected = await handleRequest(new Request("https://worker.example/v1/events/click", {
    method: "POST",
    headers: {Origin: "https://attacker.example"},
    body: JSON.stringify(basePayload)
  }), env);
  assert.equal(rejected.status, 403);
  assert.equal(db.runs.length, 1);
});

test("invalid link combinations never reach D1", async () => {
  const db = mockDb();
  const response = await handleRequest(new Request("https://worker.example/v1/events/click", {
    method: "POST",
    headers: {Origin: "https://tsudsuraya.github.io"},
    body: JSON.stringify({...basePayload, clicked_url: "https://evil.example/collect"})
  }), {DB: db});
  assert.equal(response.status, 400);
  assert.equal(db.runs.length, 0);
});

test("report API fails closed without the secret and rejects a wrong bearer token", async () => {
  const url = "https://worker.example/v1/reports/summary?from=2026-09-01&to=2026-09-04";
  const noSecret = await handleRequest(new Request(url), {DB: mockDb()});
  assert.equal(noSecret.status, 503);

  const wrongToken = await handleRequest(new Request(url, {
    headers: {Authorization: "Bearer wrong"}
  }), {DB: mockDb(), REPORT_TOKEN: "correct"});
  assert.equal(wrongToken.status, 401);
  assert.equal(wrongToken.headers.get("Cache-Control"), "no-store");
});

test("authorized summary and CSV export are available", async () => {
  const summaryDb = mockDb();
  const summary = await handleRequest(new Request(
    "https://worker.example/v1/reports/summary?from=2026-09-01&to=2026-09-04",
    {headers: {Authorization: "Bearer correct"}}
  ), {DB: summaryDb, REPORT_TOKEN: "correct"});
  assert.equal(summary.status, 200);
  assert.equal(summary.headers.get("Cache-Control"), "no-store");
  assert.equal(summaryDb.reads.length, 6);

  const exportDb = mockDb([{source: "note.com", link_id: "etsy", clicks: 5}]);
  const csv = await handleRequest(new Request(
    "https://worker.example/v1/reports/export?from=2026-09-01&to=2026-09-04&group=source_link&format=csv",
    {headers: {Authorization: "Bearer correct"}}
  ), {DB: exportDb, REPORT_TOKEN: "correct"});
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("Content-Type"), /^text\/csv/);
  assert.equal(await csv.text(), "source,link_id,clicks\r\nnote.com,etsy,5");
});

test("admin requires Basic authentication and advertises its realm", async () => {
  const url = "https://worker.example/admin";
  const noSecret = await handleRequest(new Request(url), {DB: mockDb()});
  assert.equal(noSecret.status, 503);

  const noCredentials = await handleRequest(new Request(url), {DB: mockDb(), ADMIN_PASSWORD: "correct"});
  assert.equal(noCredentials.status, 401);
  assert.match(noCredentials.headers.get("WWW-Authenticate"), /^Basic /);

  const wrongCredentials = await handleRequest(new Request(url, {
    headers: {Authorization: `Basic ${btoa("tsudsuraya:wrong")}`}
  }), {DB: mockDb(), ADMIN_PASSWORD: "correct"});
  assert.equal(wrongCredentials.status, 401);
});

test("authorized admin renders correct D1 aggregates without raw events", async () => {
  const results = [
    [{clicks: 2}],
    [{clicks: 7}],
    [{clicks: 30}],
    [{link_id: "latest_note", clicks: 12}, {link_id: "etsy", clicks: 8}],
    [{source: "note.com", clicks: 19}],
    [{source: "note.com", link_id: "etsy", clicks: 5}],
    [{date: "2026-09-04", clicks: 2}],
    [{last_event: "2026-09-04T12:34:56.000Z"}]
  ];
  const db = mockDb();
  db.batch = async (statements) => {
    db.reads.push(...statements.map(({sql, params}) => ({sql, params})));
    return results.map((rows) => ({success: true, results: rows}));
  };
  const response = await handleRequest(new Request("https://worker.example/admin", {
    headers: {Authorization: `Basic ${btoa("tsudsuraya:correct")}`}
  }), {DB: db, ADMIN_PASSWORD: "correct"});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.match(html, />2<\/strong>/);
  assert.match(html, />7<\/strong>/);
  assert.match(html, />30<\/strong>/);
  assert.match(html, /最新記事 \(latest_note\)/);
  assert.match(html, /note\.com/);
  assert.match(html, /Etsy \(etsy\)/);
  assert.match(html, /2026-09-04 21:34:56/);
  assert.doesNotMatch(html, /clicked_url|landing_page|event_id/);
  assert.equal(db.reads.length, 8);
  assert.deepEqual(db.reads[1].params, ["2026-08-29", "2026-09-04"]);
  assert.deepEqual(db.reads[2].params, ["2026-08-06", "2026-09-04"]);
});

test("CSV values are escaped", () => {
  assert.equal(toCsv(["name", "count"], [{name: "a,b", count: 2}]), 'name,count\r\n"a,b",2');
});

test("retention removes events older than 180 days by default", async () => {
  const db = mockDb();
  const scheduledTime = Date.parse("2026-09-04T00:00:00.000Z");
  await deleteExpiredEvents({DB: db}, scheduledTime);
  assert.equal(db.runs.length, 1);
  assert.match(db.runs[0].sql, /DELETE FROM click_events/);
  assert.equal(db.runs[0].params[0], "2026-03-08");
});
