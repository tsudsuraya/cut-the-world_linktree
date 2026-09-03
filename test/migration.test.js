import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";

test("D1 migration is valid SQLite and creates the reporting indexes", async () => {
  const migration = await readFile(
    new URL("../analytics-worker/migrations/0001_create_click_events.sql", import.meta.url),
    "utf8"
  );
  const db = new DatabaseSync(":memory:");
  db.exec(migration);

  const indexes = db.prepare("PRAGMA index_list('click_events')").all().map((row) => row.name);
  assert.ok(indexes.includes("idx_click_events_date_link"));
  assert.ok(indexes.includes("idx_click_events_date_source_link"));

  db.prepare(`INSERT INTO click_events (
    event_id, occurred_at, report_date_jst, link_id, clicked_url, landing_page,
    referrer_host, source, device_type
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "123e4567-e89b-42d3-a456-426614174000",
    "2026-09-04T00:00:00.000Z",
    "2026-09-04",
    "etsy",
    "https://www.etsy.com/shop/ChasingEchoesstudio",
    "/cut-the-world_linktree/",
    "note.com",
    "note.com",
    "desktop"
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM click_events").get().count, 1);
  assert.throws(() => db.prepare(`INSERT INTO click_events (
    event_id, occurred_at, report_date_jst, link_id, clicked_url, landing_page,
    referrer_host, source, device_type
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "223e4567-e89b-42d3-a456-426614174000",
    "2026-09-04T00:00:00.000Z",
    "2026-09-04",
    "etsy",
    "https://www.etsy.com/shop/ChasingEchoesstudio",
    "/cut-the-world_linktree/",
    "note.com",
    "note.com",
    "smart-fridge"
  ));
  db.close();
});
