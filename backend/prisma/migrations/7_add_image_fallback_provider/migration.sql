ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "imageFallbackProvider" TEXT NOT NULL DEFAULT 'pexels';
ALTER TABLE "scenes"  ADD COLUMN IF NOT EXISTS "imageProvider"         TEXT;
