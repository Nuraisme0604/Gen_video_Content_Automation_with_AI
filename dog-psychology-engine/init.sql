-- Bảng quản lý video
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    topic_title TEXT NOT NULL,
    script_text TEXT,
    qa_score INTEGER,
    total_scenes INTEGER,
    completed_scenes INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',  -- pending|generating|rendering|uploaded|published
    character_ref_url TEXT,
    youtube_video_id VARCHAR(20),
    total_cost_usd DECIMAL(8,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP
);

-- Bảng quản lý từng scene
CREATE TABLE IF NOT EXISTS scenes (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id),
    scene_index INTEGER NOT NULL,
    voiceover_text TEXT,
    image_prompt TEXT,
    video_prompt TEXT,
    audio_path TEXT,
    video_path TEXT,
    image_path TEXT,
    status VARCHAR(20) DEFAULT 'pending',  -- pending|processing|completed|failed
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    cost_usd DECIMAL(6,3) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Content calendar
CREATE TABLE IF NOT EXISTS content_calendar (
    id SERIAL PRIMARY KEY,
    topic_title TEXT,
    keywords TEXT[],
    emotion_primary VARCHAR(50),
    seasonal_tag VARCHAR(50),
    planned_date DATE,
    video_id INTEGER REFERENCES videos(id),
    status VARCHAR(20) DEFAULT 'planned'
);

-- Cost tracking  
CREATE TABLE IF NOT EXISTS cost_log (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id),
    service VARCHAR(50),       -- openai_text|openai_image|runway|elevenlabs
    api_call_type VARCHAR(50),
    tokens_used INTEGER,
    cost_usd DECIMAL(6,3),
    created_at TIMESTAMP DEFAULT NOW()
);
