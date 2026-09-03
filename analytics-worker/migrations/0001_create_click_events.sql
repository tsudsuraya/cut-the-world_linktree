CREATE TABLE IF NOT EXISTS click_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  report_date_jst TEXT NOT NULL,
  link_id TEXT NOT NULL,
  clicked_url TEXT NOT NULL,
  landing_page TEXT NOT NULL,
  referrer_host TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  device_type TEXT NOT NULL CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'unknown'))
);

CREATE INDEX IF NOT EXISTS idx_click_events_date_link
  ON click_events(report_date_jst, link_id);

CREATE INDEX IF NOT EXISTS idx_click_events_date_source_link
  ON click_events(report_date_jst, source, link_id);
