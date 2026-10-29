import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {normalizedClickedUrl} from "../analytics-worker/src/index.js";

const root = new URL("../", import.meta.url);

test("all outbound cards have stable unique link IDs", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const expected = [
    "kindle_novel",
    "etsy",
    "billing_note",
    "membership",
    "intro_note",
    "experiment_log_1",
    "experiment_log_2",
    "experiment_log_3",
    "note_top",
    "latest_note",
    "youtube"
  ];
  const actual = [...html.matchAll(/<a class="book" data-link-id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, actual.length);
});

test("every outbound card is accepted by the click analytics allowlist", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const cards = [...html.matchAll(/<a class="book" data-link-id="([^"]+)" href="([^"]+)"/g)];
  assert.ok(cards.length > 0);
  for (const [, linkId, href] of cards) {
    assert.notEqual(normalizedClickedUrl(href, linkId), null, `${linkId} ${href}`);
  }
});

test("latest-note updater preserves latest_note ID", async () => {
  const source = await readFile(new URL("scripts/update_latest.py", root), "utf8");
  assert.match(source, /data-link-id=\\?"latest_note\\?"/);
  assert.match(source, /LATEST_ARTICLE_START/);
  assert.match(source, /LATEST_ARTICLE_END/);
});

test("click tracking does not intercept navigation and ignores right auxclick", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.doesNotMatch(html, /preventDefault\s*\(/);
  assert.match(html, /addEventListener\("auxclick"/);
  assert.match(html, /event\.button !== 1/);
  assert.match(html, /navigator\.sendBeacon/);
  assert.match(html, /keepalive:\s*true/);
  assert.match(html, /https:\/\/cut-the-world-click-analytics\.tsudsura\.workers\.dev\/v1\/events\/click/);
});

test("existing Cloudflare Web Analytics beacon remains present", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.match(html, /1d38a89ca88d4a04947b88b458768330/);
});

test("privacy page and unobtrusive footer link are present", async () => {
  const [index, privacy] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("privacy.html", root), "utf8")
  ]);
  assert.match(index, /href="privacy\.html">Privacy<\/a>/);
  assert.match(privacy, /180日間保持/);
  assert.match(privacy, /生のIPアドレス/);
  assert.match(privacy, /永続的なvisitor IDまたはsession ID/);
  assert.match(privacy, /sessionStorage/);
});
