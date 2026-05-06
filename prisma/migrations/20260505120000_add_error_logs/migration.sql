-- Add error_logs table for developer-facing server error viewer.

CREATE TABLE IF NOT EXISTS "error_logs" (
  "id" SERIAL NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "level" VARCHAR(10) NOT NULL DEFAULT 'error',
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "method" VARCHAR(10),
  "path" TEXT,
  "status_code" INTEGER,
  "user_id" TEXT,
  "user_email" TEXT,
  "meta" JSONB,
  CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_error_logs_created_at" ON "error_logs" ("created_at");

