ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "scriptProvider"  TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "scriptModel"     TEXT NOT NULL DEFAULT 'gpt-5.4-mini';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "refineProvider"  TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "refineModel"     TEXT NOT NULL DEFAULT 'claude-opus-4-7';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "imageProvider"   TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "imageModel"      TEXT NOT NULL DEFAULT 'gpt-image-2';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "videoProvider"   TEXT NOT NULL DEFAULT 'google';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "videoModel"      TEXT NOT NULL DEFAULT 'veo-3.1-generate-preview';
