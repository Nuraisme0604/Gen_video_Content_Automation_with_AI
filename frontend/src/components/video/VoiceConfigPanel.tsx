'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProject } from '@/lib/api';

const VOICES = [
  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Nam · Adam' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Nữ · Bella' },
  { id: 'AZnzlk1XvdvUeBnXmlld', label: 'Trẻ · Domi' },
  { id: 'ErXwobaYiN019PkySvjV', label: 'Già · Antoni' },
];
const EMOTIONS = ['neutral', 'happy', 'sad', 'serious', 'excited'];

type Props = {
  projectId: string;
  config: { voiceId?: string; voiceSpeed?: number; voiceEmotion?: string; burnSubtitles?: boolean; disableBgm?: boolean; language?: string };
  onChange: (patch: any) => void;
};

export function VoiceConfigPanel({ projectId, config, onChange }: Props) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (data: any) => updateProject(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  });

  const set = (patch: any) => {
    onChange(patch);
    save.mutate(patch);
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Voice</div>

      {/* Voice selector */}
      <div>
        <div className="text-xs text-zinc-500 mb-2">Giọng đọc</div>
        <div className="grid grid-cols-2 gap-2">
          {VOICES.map(v => (
            <button
              key={v.id}
              onClick={() => set({ voiceId: v.id })}
              className={`px-3 py-2 rounded-lg text-xs text-left transition-colors border ${
                config.voiceId === v.id
                  ? 'border-violet-500 bg-violet-600/20 text-violet-300'
                  : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div>
        <div className="flex justify-between text-xs text-zinc-500 mb-1">
          <span>Tốc độ</span>
          <span>{(config.voiceSpeed ?? 1.0).toFixed(1)}x</span>
        </div>
        <input
          type="range" min={0.7} max={1.3} step={0.1}
          value={config.voiceSpeed ?? 1.0}
          onChange={e => set({ voiceSpeed: parseFloat(e.target.value) })}
          className="w-full accent-violet-600"
        />
      </div>

      {/* Emotion */}
      <div>
        <div className="text-xs text-zinc-500 mb-2">Cảm xúc</div>
        <div className="flex flex-wrap gap-2">
          {EMOTIONS.map(e => (
            <button
              key={e}
              onClick={() => set({ voiceEmotion: e })}
              className={`px-3 py-1 rounded-full text-xs transition-colors ${
                config.voiceEmotion === e
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Subtitles */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={config.burnSubtitles ?? false}
          onChange={e => set({ burnSubtitles: e.target.checked })}
          className="accent-violet-600"
        />
        <span className="text-zinc-300">Burn subtitle vào video</span>
      </label>

      {/* BGM */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={config.disableBgm ?? true}
          onChange={e => set({ disableBgm: e.target.checked })}
          className="accent-violet-600"
        />
        <span className="text-zinc-300">Tắt nhạc nền (chỉ giữ tiếng)</span>
      </label>

      {/* Narration language */}
      <div>
        <div className="text-xs text-zinc-500 mb-2">Ngôn ngữ lời dẫn</div>
        <select
          value={config.language ?? 'vi'}
          onChange={e => set({ language: e.target.value })}
          className="w-full bg-zinc-800 text-sm rounded-lg px-3 py-2 border border-zinc-700 outline-none focus:border-violet-500"
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  );
}
