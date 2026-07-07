CREATE TABLE IF NOT EXISTS site_analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'web_vital')),
  route TEXT NOT NULL,
  path TEXT NOT NULL,
  catalog_type TEXT,
  visitor_id TEXT,
  session_id TEXT,
  referrer_host TEXT,
  source TEXT,
  device_type TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  connection_type TEXT,
  metric_name TEXT,
  metric_value DOUBLE PRECISION,
  metric_rating TEXT,
  metric_id TEXT,
  navigation_type TEXT,
  load_time_ms INTEGER,
  ttfb_ms INTEGER,
  dom_content_loaded_ms INTEGER,
  country TEXT,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_analytics_created
  ON site_analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_analytics_event_created
  ON site_analytics_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_analytics_route_created
  ON site_analytics_events (route, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_analytics_metric_created
  ON site_analytics_events (metric_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_analytics_catalog_created
  ON site_analytics_events (catalog_type, created_at DESC);
