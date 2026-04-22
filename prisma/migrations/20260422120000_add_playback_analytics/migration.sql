-- Add playback_analytics table for offline-first player sync batches.

CREATE TABLE IF NOT EXISTS "playback_analytics" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "device_id" TEXT NOT NULL,
  "screen_id" TEXT NOT NULL,
  "sent_at" TIMESTAMPTZ(6),
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB,
  CONSTRAINT "playback_analytics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_playback_analytics_screen" ON "playback_analytics" ("screen_id");
CREATE INDEX IF NOT EXISTS "idx_playback_analytics_received_at" ON "playback_analytics" ("received_at");

