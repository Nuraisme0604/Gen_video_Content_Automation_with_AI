CREATE TABLE IF NOT EXISTS "render_events" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "render_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "render_events_videoId_createdAt_idx" ON "render_events"("videoId", "createdAt");

ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "stage" TEXT;
