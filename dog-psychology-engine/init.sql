-- AI YouTube Content Engine — PostgreSQL schema
-- Auto-applied khi postgres container init lần đầu (volume mount)

-- ============================================================
-- videos: Master record cho mỗi video pipeline
-- ============================================================
-- id dùng TEXT để khớp với episode_id string từ n8n manifest
CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    topic_title TEXT NOT NULL,
    -- status flow: pending → rendering → rendered → uploaded → published
    --   rendered = master video ready local (YouTube creds thiếu hoặc upload fail)
    --   uploaded = thực sự upload thành công lên YouTube
    --   published = workflow 03 đã notify Telegram + mark final
    status VARCHAR(20) DEFAULT 'pending',
    youtube_video_id VARCHAR(20),
    total_cost_usd DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP
);

-- ============================================================
-- scenes: Mỗi scene/clip ~8s trong video
-- ============================================================
CREATE TABLE IF NOT EXISTS scenes (
    id SERIAL PRIMARY KEY,
    video_id TEXT REFERENCES videos(id),
    scene_index INTEGER NOT NULL,
    voiceover_text TEXT,
    audio_path TEXT,            -- ElevenLabs voiceover mp3
    video_path TEXT,            -- Veo3/Runway clip mp4
    image_path TEXT,            -- DALL-E reference image
    status VARCHAR(20) DEFAULT 'pending',  -- pending|completed|failed
    error_message TEXT,         -- Chi tiết lỗi nếu fail (cho debug)
    cost_usd DECIMAL(8,3) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- cost_log: Tracking chi phí per-pipeline (high-level)
-- ============================================================
-- DECIMAL(10,4) thay vì (6,3) để tránh overflow với pipeline scale lớn
CREATE TABLE IF NOT EXISTS cost_log (
    id SERIAL PRIMARY KEY,
    video_id TEXT REFERENCES videos(id),
    service VARCHAR(50),       -- 'pipeline_total' | 'openai' | 'veo3' | etc.
    cost_usd DECIMAL(10,4),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Indexes (performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scenes_video_id ON scenes(video_id);
CREATE INDEX IF NOT EXISTS idx_scenes_video_status ON scenes(video_id, status);
CREATE INDEX IF NOT EXISTS idx_cost_log_video_id ON cost_log(video_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
