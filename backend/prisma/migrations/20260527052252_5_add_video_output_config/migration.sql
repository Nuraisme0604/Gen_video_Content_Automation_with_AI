-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "voiceProvider" SET DEFAULT 'edge-tts',
ALTER COLUMN "scriptProvider" SET DEFAULT 'google',
ALTER COLUMN "scriptModel" SET DEFAULT 'gemini-2.5-flash',
ALTER COLUMN "refineProvider" SET DEFAULT 'google',
ALTER COLUMN "refineModel" SET DEFAULT 'gemini-2.5-flash',
ALTER COLUMN "imageProvider" SET DEFAULT 'pexels',
ALTER COLUMN "imageModel" SET DEFAULT 'pexels-stock',
ALTER COLUMN "videoProvider" SET DEFAULT 'local',
ALTER COLUMN "videoModel" SET DEFAULT 'slideshow';

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "outputMode" TEXT NOT NULL DEFAULT 'master',
ADD COLUMN     "targetDurationSec" INTEGER;
