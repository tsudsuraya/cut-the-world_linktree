const PRODUCTION_ORIGIN = "https://tsudsuraya.github.io";
const DEFAULT_RETENTION_DAYS = 180;
const MAX_BODY_BYTES = 4096;
const MAX_REPORT_DAYS = 366;
const ADMIN_USERNAME = "tsudsuraya";

const LINK_LABELS = Object.freeze({
  intro_note: "はじめに",
  experiment_log_1: "実験記録 1",
  experiment_log_2: "実験記録 2",
  experiment_log_3: "実験記録 3",
  billing_note: "課金について",
  note_top: "note",
  latest_note: "最新記事",
  etsy: "Etsy",
  youtube: "YouTube"
});

const LINK_RULES = Object.freeze({
  intro_note: {hostname: "note.com", pathname: "/tsudsuraya/n/nbbcb11a8995f"},
  experiment_log_1: {hostname: "note.com", pathname: "/tsudsuraya/n/na69275259c78"},
  experiment_log_2: {hostname: "note.com", pathname: "/tsudsuraya/n/n67a1ed28b38e"},
  experiment_log_3: {hostname: "note.com", pathname: "/tsudsuraya/n/n6ba8abc70d80"},
  billing_note: {hostname: "note.com", pathname: "/tsudsuraya/n/n13a233a63002"},
  note_top: {hostname: "note.com", pathname: "/tsudsuraya"},
  latest_note: {hostname: "note.com", pathnamePattern: /^\/tsudsuraya\/n\/n[a-zA-Z0-9]+$/},
  etsy: {hostname: "www.etsy.com", pathname: "/shop/ChasingEchoesstudio"},
  youtube: {hostname: "www.youtube.com", pathname: "/@nemurenai_koshoshitsu"}
});

const REPORTS = Object.freeze({
  day: {
    columns: ["date", "clicks"],
    sql: `SELECT report_date_jst AS date, COUNT(*) AS clicks
          FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2
          GROUP BY report_date_jst ORDER BY report_date_jst`
  },
  link: {
    columns: ["link_id", "clicks"],
    sql: `SELECT link_id, COUNT(*) AS clicks
          FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2
          GROUP BY link_id ORDER BY clicks DESC, link_id`
  },
  referrer: {
    columns: ["referrer", "clicks"],
    sql: `SELECT CASE WHEN referrer_host = '' THEN 'direct' ELSE referrer_host END AS referrer,
                 COUNT(*) AS clicks
          FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2
          GROUP BY referrer ORDER BY clicks DESC, referrer`
  },
  source: {
    columns: ["source", "clicks"],
    sql: `SELECT source, COUNT(*) AS clicks
          FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2
          GROUP BY source ORDER BY clicks DESC, source`
  },
  campaign: {
    columns: ["utm_source", "utm_campaign", "clicks"],
    sql: `SELECT COALESCE(utm_source, '') AS utm_source,
                 COALESCE(utm_campaign, '') AS utm_campaign,
                 COUNT(*) AS clicks
          FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2
          GROUP BY utm_source, utm_campaign ORDER BY clicks DESC, utm_source, utm_campaign`
  },
  source_link: {
    columns: ["source", "link_id", "clicks"],
    sql: `SELECT source, link_id, COUNT(*) AS clicks
          FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2
          GROUP BY source, link_id ORDER BY clicks DESC, source, link_id`
  }
});

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeHostname(value) {
  const host = cleanText(value, 253);
  if (!host) return "";
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(normalized) ? normalized : "";
}

function normalizedClickedUrl(value, linkId) {
  const rule = LINK_RULES[linkId];
  if (!rule || typeof value !== "string" || value.length > 1000) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (url.hostname.toLowerCase() !== rule.hostname) return null;

  const pathname = url.pathname.replace(/\/$/, "") || "/";
  const expectedPath = rule.pathname?.replace(/\/$/, "") || null;
  if (expectedPath && pathname !== expectedPath) return null;
  if (rule.pathnamePattern && !rule.pathnamePattern.test(pathname)) return null;

  url.hostname = rule.hostname;
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function jstDate(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(({type, value: part}) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

function deriveSource(utmSource, referrerHost) {
  return (cleanText(utmSource, 200) || normalizeHostname(referrerHost) || "direct").toLowerCase();
}

function validateClickPayload(payload, now = new Date()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("invalid_payload");
  }

  const eventId = cleanText(payload.event_id, 64);
  if (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
    throw new Error("invalid_event_id");
  }

  const linkId = cleanText(payload.link_id, 64);
  const clickedUrl = normalizedClickedUrl(payload.clicked_url, linkId);
  if (!clickedUrl) throw new Error("invalid_clicked_link");

  const landingPage = cleanText(payload.landing_page, 300);
  if (!landingPage || !/^\/cut-the-world_linktree(?:\/|$)/.test(landingPage) || /[?#]/.test(landingPage)) {
    throw new Error("invalid_landing_page");
  }

  const deviceType = cleanText(payload.device_type, 16);
  if (!["mobile", "tablet", "desktop", "unknown"].includes(deviceType)) {
    throw new Error("invalid_device_type");
  }

  const referrerHost = normalizeHostname(payload.referrer_host);
  const utmSource = cleanText(payload.utm_source, 200);
  const occurredAt = now.toISOString();

  return {
    eventId,
    occurredAt,
    reportDateJst: jstDate(now),
    linkId,
    clickedUrl,
    landingPage,
    referrerHost,
    source: deriveSource(utmSource, referrerHost),
    utmSource,
    utmMedium: cleanText(payload.utm_medium, 200),
    utmCampaign: cleanText(payload.utm_campaign, 200),
    utmContent: cleanText(payload.utm_content, 200),
    utmTerm: cleanText(payload.utm_term, 200),
    deviceType
  };
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  return origin === (env.ALLOWED_ORIGIN || PRODUCTION_ORIGIN) ? origin : null;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {"Content-Type": "application/json; charset=utf-8", ...headers}
  });
}

async function safeTokenMatch(received, expected) {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function isAuthorized(request, env) {
  if (!env.REPORT_TOKEN) return false;
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  return safeTokenMatch(authorization.slice(7), env.REPORT_TOKEN);
}

function basicCredentials(request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Basic ")) return null;
  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {username: decoded.slice(0, separator), password: decoded.slice(separator + 1)};
  } catch {
    return null;
  }
}

async function isAdminAuthorized(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const credentials = basicCredentials(request);
  if (!credentials) return false;
  const [usernameMatches, passwordMatches] = await Promise.all([
    safeTokenMatch(credentials.username, ADMIN_USERNAME),
    safeTokenMatch(credentials.password, env.ADMIN_PASSWORD)
  ]);
  return usernameMatches && passwordMatches;
}

function adminUnauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="CutTheWorld Analytics", charset="UTF-8"'
    }
  });
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function displayLink(linkId) {
  const id = String(linkId ?? "");
  const label = LINK_LABELS[id];
  return label ? `${label} (${id})` : id;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function formatJstTimestamp(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(({type, value: part}) => [type, part]));
  return `${fields.year}-${fields.month}-${fields.day} ${fields.hour}:${fields.minute}:${fields.second}`;
}

function renderRanking(rows, key, emptyText = "データはありません") {
  if (!rows.length) return `<tr><td colspan="2" class="empty">${emptyText}</td></tr>`;
  return rows.map((row) => `<tr><td>${escapeHtml(key === "link_id" ? displayLink(row[key]) : row[key])}</td><td class="number">${formatCount(row.clicks)}</td></tr>`).join("");
}

function renderAdminHtml(data) {
  const dayCounts = new Map(data.days.map((row) => [row.date, Number(row.clicks || 0)]));
  const dailyRows = [];
  for (let offset = -29; offset <= 0; offset += 1) {
    const date = shiftDate(data.today, offset);
    dailyRows.push(`<tr><td>${date}</td><td class="number">${formatCount(dayCounts.get(date) || 0)}</td></tr>`);
  }
  const combinations = data.sourceLinks.length
    ? data.sourceLinks.map((row) => `<tr><td>${escapeHtml(row.source)}</td><td>${escapeHtml(displayLink(row.link_id))}</td><td class="number">${formatCount(row.clicks)}</td></tr>`).join("")
    : '<tr><td colspan="3" class="empty">データはありません</td></tr>';
  const lastEvent = data.lastEvent ? formatJstTimestamp(data.lastEvent) : "まだありません";

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Click Analytics | CutTheWorld</title>
<style>
:root{color-scheme:dark;--ink:#e8dfcc;--muted:#a89d87;--paper:#16130f;--panel:#211c16;--line:#514632;--gold:#c3a267}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#2b2419 0,#16130f 42%);color:var(--ink);font-family:Georgia,"Yu Mincho",serif;line-height:1.55}main{width:min(1080px,calc(100% - 28px));margin:0 auto;padding:38px 0 64px}header{border-bottom:1px solid var(--line);margin-bottom:24px}h1{font-size:clamp(1.55rem,4vw,2.35rem);font-weight:500;letter-spacing:.04em;margin:0 0 4px}h2{font-size:1.05rem;color:var(--gold);font-weight:500;margin:0 0 12px}.sub,.foot{color:var(--muted);font-size:.86rem}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.card,.panel{background:rgba(33,28,22,.92);border:1px solid var(--line);border-radius:5px;box-shadow:0 8px 24px #0004}.card{padding:18px}.card span{display:block;color:var(--muted);font-size:.8rem}.card strong{display:block;color:#f4e6c7;font-size:2rem;font-weight:400;margin-top:3px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{padding:18px;overflow:auto;margin-bottom:16px}.wide{grid-column:1/-1}table{width:100%;border-collapse:collapse;font-size:.9rem}th{text-align:left;color:var(--muted);font-weight:400;border-bottom:1px solid var(--line)}th,td{padding:9px 7px;vertical-align:top}tbody tr+tr td{border-top:1px solid #383024}.number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.empty{color:var(--muted);text-align:center}.foot{margin-top:8px}@media(max-width:700px){main{width:min(100% - 18px,1080px);padding-top:24px}.cards{grid-template-columns:1fr}.grid{display:block}.card strong{font-size:1.65rem}.panel{padding:13px}th,td{padding:8px 5px;font-size:.82rem}}
</style></head><body><main><header><h1>Click Analytics</h1><p class="sub">CutTheWorld 匿名クリック解析 · JST</p></header>
<section class="cards"><div class="card"><span>今日</span><strong>${formatCount(data.todayClicks)}</strong></div><div class="card"><span>過去7日</span><strong>${formatCount(data.sevenDayClicks)}</strong></div><div class="card"><span>過去30日</span><strong>${formatCount(data.thirtyDayClicks)}</strong></div></section>
<div class="grid"><section class="panel"><h2>クリック先別 · 過去30日</h2><table><thead><tr><th>リンク</th><th class="number">クリック</th></tr></thead><tbody>${renderRanking(data.links,"link_id")}</tbody></table></section>
<section class="panel"><h2>流入元別 · 過去30日</h2><table><thead><tr><th>source</th><th class="number">クリック</th></tr></thead><tbody>${renderRanking(data.sources,"source")}</tbody></table></section>
<section class="panel wide"><h2>流入元 → クリック先 · 過去30日</h2><table><thead><tr><th>source</th><th>リンク</th><th class="number">クリック</th></tr></thead><tbody>${combinations}</tbody></table></section>
<section class="panel wide"><h2>日別クリック数 · 過去30日</h2><table><thead><tr><th>日付 (JST)</th><th class="number">クリック</th></tr></thead><tbody>${dailyRows.join("")}</tbody></table></section></div>
<p class="foot">最終イベント受信: ${escapeHtml(lastEvent)} JST</p></main></body></html>`;
}

async function handleAdmin(env, now = new Date()) {
  const today = jstDate(now);
  const sevenDaysAgo = shiftDate(today, -6);
  const thirtyDaysAgo = shiftDate(today, -29);
  const statements = [
    env.DB.prepare("SELECT COUNT(*) AS clicks FROM click_events WHERE report_date_jst = ?1").bind(today),
    env.DB.prepare("SELECT COUNT(*) AS clicks FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2").bind(sevenDaysAgo, today),
    env.DB.prepare("SELECT COUNT(*) AS clicks FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2").bind(thirtyDaysAgo, today),
    env.DB.prepare("SELECT link_id, COUNT(*) AS clicks FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2 GROUP BY link_id ORDER BY clicks DESC, link_id").bind(thirtyDaysAgo, today),
    env.DB.prepare("SELECT source, COUNT(*) AS clicks FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2 GROUP BY source ORDER BY clicks DESC, source").bind(thirtyDaysAgo, today),
    env.DB.prepare("SELECT source, link_id, COUNT(*) AS clicks FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2 GROUP BY source, link_id ORDER BY clicks DESC, source, link_id").bind(thirtyDaysAgo, today),
    env.DB.prepare("SELECT report_date_jst AS date, COUNT(*) AS clicks FROM click_events WHERE report_date_jst BETWEEN ?1 AND ?2 GROUP BY report_date_jst ORDER BY report_date_jst").bind(thirtyDaysAgo, today),
    env.DB.prepare("SELECT MAX(occurred_at) AS last_event FROM click_events")
  ];
  const results = await env.DB.batch(statements);
  const rows = (index) => results[index]?.results || [];
  const html = renderAdminHtml({
    today,
    todayClicks: rows(0)[0]?.clicks || 0,
    sevenDayClicks: rows(1)[0]?.clicks || 0,
    thirtyDayClicks: rows(2)[0]?.clicks || 0,
    links: rows(3), sources: rows(4), sourceLinks: rows(5), days: rows(6),
    lastEvent: rows(7)[0]?.last_event || null
  });
  return new Response(html, {headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"}});
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function reportRange(url) {
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!validDate(from) || !validDate(to)) throw new Error("invalid_date_range");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days < 0 || days >= MAX_REPORT_DAYS) throw new Error("invalid_date_range");
  return {from, to};
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns, rows) {
  return [columns.join(","), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(","))].join("\r\n");
}

async function insertClick(env, event) {
  return env.DB.prepare(`INSERT INTO click_events (
      event_id, occurred_at, report_date_jst, link_id, clicked_url, landing_page,
      referrer_host, source, utm_source, utm_medium, utm_campaign, utm_content,
      utm_term, device_type
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    ON CONFLICT(event_id) DO NOTHING`)
    .bind(
      event.eventId, event.occurredAt, event.reportDateJst, event.linkId,
      event.clickedUrl, event.landingPage, event.referrerHost, event.source,
      event.utmSource, event.utmMedium, event.utmCampaign, event.utmContent,
      event.utmTerm, event.deviceType
    ).run();
}

async function handleClick(request, env) {
  const origin = allowedOrigin(request, env);
  if (!origin) return jsonResponse({error: "forbidden_origin"}, 403);

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return jsonResponse({error: "payload_too_large"}, 413, corsHeaders(origin));

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({error: "payload_too_large"}, 413, corsHeaders(origin));
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return jsonResponse({error: "invalid_json"}, 400, corsHeaders(origin));
  }

  try {
    await insertClick(env, validateClickPayload(payload));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_")) {
      return jsonResponse({error: error.message}, 400, corsHeaders(origin));
    }
    throw error;
  }

  return new Response(null, {status: 204, headers: corsHeaders(origin)});
}

async function reportRows(env, group, from, to) {
  const report = REPORTS[group];
  if (!report) throw new Error("invalid_group");
  const result = await env.DB.prepare(report.sql).bind(from, to).all();
  return {columns: report.columns, rows: result.results || []};
}

async function handleSummary(env, url) {
  const {from, to} = reportRange(url);
  const groups = ["day", "link", "referrer", "source", "campaign", "source_link"];
  const statements = groups.map((group) => env.DB.prepare(REPORTS[group].sql).bind(from, to));
  const results = await env.DB.batch(statements);
  const summary = {from, to};
  groups.forEach((group, index) => { summary[group] = results[index]?.results || []; });
  return jsonResponse(summary, 200, {"Cache-Control": "no-store"});
}

async function handleExport(env, url) {
  const {from, to} = reportRange(url);
  const group = url.searchParams.get("group") || "source_link";
  const format = url.searchParams.get("format") || "json";
  if (!REPORTS[group]) return jsonResponse({error: "invalid_group"}, 400, {"Cache-Control": "no-store"});
  if (!["json", "csv"].includes(format)) return jsonResponse({error: "invalid_format"}, 400, {"Cache-Control": "no-store"});

  const report = await reportRows(env, group, from, to);
  if (format === "csv") {
    return new Response(toCsv(report.columns, report.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clicks-${group}-${from}-${to}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  }
  return jsonResponse({from, to, group, rows: report.rows}, 200, {"Cache-Control": "no-store"});
}

async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/health" && request.method === "GET") {
    return jsonResponse({ok: true});
  }

  if (url.pathname === "/admin") {
    if (request.method !== "GET") return jsonResponse({error: "method_not_allowed"}, 405, {Allow: "GET", "Cache-Control": "no-store"});
    if (!env.ADMIN_PASSWORD) return jsonResponse({error: "admin_auth_not_configured"}, 503, {"Cache-Control": "no-store"});
    if (!(await isAdminAuthorized(request, env))) return adminUnauthorized();
    return handleAdmin(env);
  }

  if (url.pathname === "/v1/events/click" && request.method === "OPTIONS") {
    const origin = allowedOrigin(request, env);
    return origin
      ? new Response(null, {status: 204, headers: corsHeaders(origin)})
      : jsonResponse({error: "forbidden_origin"}, 403);
  }

  if (url.pathname === "/v1/events/click") {
    if (request.method !== "POST") return jsonResponse({error: "method_not_allowed"}, 405, {Allow: "POST, OPTIONS"});
    return handleClick(request, env);
  }

  if (url.pathname.startsWith("/v1/reports/")) {
    if (request.method !== "GET") return jsonResponse({error: "method_not_allowed"}, 405, {Allow: "GET"});
    if (!env.REPORT_TOKEN) return jsonResponse({error: "report_auth_not_configured"}, 503, {"Cache-Control": "no-store"});
    if (!(await isAuthorized(request, env))) return jsonResponse({error: "unauthorized"}, 401, {"Cache-Control": "no-store", "WWW-Authenticate": "Bearer"});

    try {
      if (url.pathname === "/v1/reports/summary") return handleSummary(env, url);
      if (url.pathname === "/v1/reports/export") return handleExport(env, url);
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_date_range") {
        return jsonResponse({error: "invalid_date_range"}, 400, {"Cache-Control": "no-store"});
      }
      throw error;
    }
  }

  return jsonResponse({error: "not_found"}, 404);
}

async function deleteExpiredEvents(env, scheduledTime = Date.now()) {
  const configured = Number.parseInt(env.RETENTION_DAYS || "", 10);
  const retentionDays = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_RETENTION_DAYS;
  const cutoffDateJst = jstDate(new Date(scheduledTime - retentionDays * 86400000));
  return env.DB.prepare("DELETE FROM click_events WHERE report_date_jst < ?1").bind(cutoffDateJst).run();
}

export {
  LINK_RULES,
  deriveSource,
  normalizedClickedUrl,
  validateClickPayload,
  handleRequest,
  handleAdmin,
  deleteExpiredEvents,
  toCsv
};

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error("analytics_worker_request_failed", error instanceof Error ? error.name : "unknown");
      return jsonResponse({error: "internal_error"}, 500, {"Cache-Control": "no-store"});
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(deleteExpiredEvents(env, controller.scheduledTime));
  }
};
