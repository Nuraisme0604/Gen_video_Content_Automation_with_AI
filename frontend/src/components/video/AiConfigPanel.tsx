'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiKeys, updateProject } from '@/lib/api';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';

// Suggested models per provider — user can type any model not in this list.
// Updated for 2026: real model names, no fake/outdated ones.
const SUGGESTED_MODELS: Record<string, string[]> = {
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-5', 'dall-e-3', 'gpt-image-1', 'tts-1', 'tts-1-hd'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  google:    ['gemini-2.5-flash', 'gemini-2.5-pro', 'imagen-4-fast', 'imagen-4-ultra', 'veo-3.0', 'veo-2.0'],
  gemini:    ['gemini-2.5-flash', 'gemini-2.5-pro'],
  runway:    ['gen-3-alpha', 'gen-3-alpha-turbo'],
  elevenlabs:['eleven_multilingual_v2', 'eleven_turbo_v2', 'eleven_monolingual_v1', 'eleven_music'],
  replicate: ['black-forest-labs/flux-1.1-pro', 'kwaivgi/kling-1.6', 'luma/dream-machine'],
  pexels:    ['pexels-stock', 'pexels-video'],
  local:     ['slideshow'],
  'edge-tts':['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural', 'en-US-AriaNeural', 'en-US-GuyNeural'],
};

// Brief tagline shown next to model when user picks it
const MODEL_NOTES: Record<string, string> = {
  'gemini-2.5-flash':  'Free, nhanh — OK cho video ngắn',
  'gemini-2.5-pro':    'Free, chất lượng cao hơn',
  'claude-opus-4-7':   '~$15/1M tok — best cho tiếng Việt',
  'claude-sonnet-4-6': '~$3/1M tok — cân bằng',
  'gpt-4o':            '~$2.5/1M tok — đa năng',
  'gpt-4o-mini':       '~$0.15/1M tok — rẻ',
  'imagen-4-fast':     '$0.04/ảnh — cần Google paid',
  'imagen-4-ultra':    '$0.10/ảnh — 4K',
  'dall-e-3':          '$0.04/ảnh — style hoạt hoạ',
  'gpt-image-1':       '$0.04/ảnh',
  'pexels-stock':      'Free — ảnh stock có sẵn',
  'veo-3.0':           '$0.50/giây — best animation, có audio',
  'veo-2.0':           '$0.30/giây',
  'gen-3-alpha':       '$0.05/giây — creative motion',
  'kwaivgi/kling-1.6': '$0.20/giây — cinematic',
  'pexels-video':      'Free — B-roll có sẵn',
  'slideshow':         'Free — Ken Burns ảnh tĩnh',
  'eleven_multilingual_v2': '$0.30/min — đa NN, cảm xúc',
  'eleven_music':      '$22/tháng — AI nhạc nền',
  'tts-1':             '$0.02/1K char',
  'vi-VN-NamMinhNeural': 'Free — nam Việt trẻ',
  'vi-VN-HoaiMyNeural':  'Free — nữ Việt trẻ',
};

const TASK_KEY_TYPE: Record<string, string> = {
  script: 'SCRIPT', refine: 'SCRIPT', image: 'IMAGE', video: 'VIDEO',
};

const TASK_LABELS: Record<string, string> = {
  script: 'Sinh kịch bản',
  refine: 'Refine kịch bản',
  image:  'Sinh ảnh',
  video:  'Sinh video',
};

const TASKS = [
  { key: 'script', providerField: 'scriptProvider', modelField: 'scriptModel' },
  { key: 'refine', providerField: 'refineProvider', modelField: 'refineModel' },
  { key: 'image',  providerField: 'imageProvider',  modelField: 'imageModel'  },
  { key: 'video',  providerField: 'videoProvider',  modelField: 'videoModel'  },
];

// Free providers that work without an API key
const FREE_PROVIDERS = ['local', 'pexels', 'edge-tts'];

type Props = {
  projectId: string;
  config: Record<string, any>;
  onChange: (patch: any) => void;
};

export function AiConfigPanel({ projectId, config, onChange }: Props) {
  const qc = useQueryClient();
  const { data: allKeys = [] } = useQuery({ queryKey: ['api-keys'], queryFn: () => getApiKeys() });

  const save = useMutation({
    mutationFn: (data: any) => updateProject(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
    onError: (e: any) => toast.error('Lưu cấu hình thất bại', { description: e?.response?.data?.message || e?.message }),
  });

  const set = (patch: any) => { onChange(patch); save.mutate(patch); };

  // Providers with at least 1 active key for a given capability + free providers always available
  const availableProviders = (capability: string): string[] => {
    const fromKeys = (allKeys as any[])
      .filter(k => k.type === capability && k.isActive)
      .map(k => k.provider as string);
    return [...new Set([...FREE_PROVIDERS.filter(p => SUGGESTED_MODELS[p]?.length), ...fromKeys])];
  };

  return (
    <div className="card p-5 space-y-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-zinc-200">Cấu hình AI cho project</div>
          <div className="text-xs text-zinc-500 mt-0.5">Chọn provider + model cho từng giai đoạn</div>
        </div>
        <a href="/api-sources" className="text-xs text-violet-400 hover:underline">Quản lý API keys →</a>
      </div>

      {TASKS.map(({ key, providerField, modelField }) => {
        const capability = TASK_KEY_TYPE[key];
        const providers = availableProviders(capability);
        const currentProvider = config[providerField] || '';
        const currentModel   = config[modelField]   || '';
        const suggested = SUGGESTED_MODELS[currentProvider] || [];
        const listId = `models-${key}`;
        const note = MODEL_NOTES[currentModel];

        return (
          <div key={key}>
            <div className="text-xs text-zinc-400 mb-1.5 font-medium">{TASK_LABELS[key]}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Provider selector */}
              <select
                value={currentProvider}
                onChange={e => {
                  const newProv = e.target.value;
                  // Auto-pick first suggested model if changing provider
                  set({
                    [providerField]: newProv,
                    [modelField]: SUGGESTED_MODELS[newProv]?.[0] || '',
                  });
                }}
                className="w-full bg-zinc-800 text-sm rounded-lg px-3 py-2 border border-zinc-700 outline-none focus:border-violet-500"
              >
                <option value="">— chọn provider —</option>
                {providers.map(p => (
                  <option key={p} value={p}>
                    {p}{FREE_PROVIDERS.includes(p) ? ' (free)' : ''}
                  </option>
                ))}
                {/* Show current provider even if no key (so user sees what's saved) */}
                {currentProvider && !providers.includes(currentProvider) && (
                  <option value={currentProvider}>{currentProvider} ⚠️ chưa có key</option>
                )}
              </select>

              {/* Model: dropdown + free-text input via datalist */}
              <div className="relative">
                <input
                  list={listId}
                  value={currentModel}
                  onChange={e => set({ [modelField]: e.target.value })}
                  placeholder={currentProvider ? 'Chọn / nhập model...' : 'Chọn provider trước'}
                  disabled={!currentProvider}
                  className="w-full bg-zinc-800 text-sm rounded-lg px-3 py-2 border border-zinc-700 outline-none focus:border-violet-500 disabled:opacity-40"
                />
                <datalist id={listId}>
                  {suggested.map(m => (
                    <option key={m} value={m}>
                      {MODEL_NOTES[m] || ''}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            {/* Helper line showing model note OR warning if no key */}
            {currentModel && note && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Sparkles size={11} className="text-violet-400" />
                <span className="font-mono text-zinc-400">{currentModel}</span>
                <span>·</span>
                <span>{note}</span>
              </div>
            )}

            {currentProvider && !FREE_PROVIDERS.includes(currentProvider) && providers.length > 0 && !providers.includes(currentProvider) && (
              <p className="text-[11px] text-amber-400 mt-1">
                ⚠️ Chưa có key active cho provider này — vào{' '}
                <a href="/api-sources" className="underline">Nguồn API</a> để thêm
              </p>
            )}

            {providers.length === 0 && (
              <p className="text-[11px] text-amber-400 mt-1">
                Chưa có key active cho loại "{capability}" — thêm key tại{' '}
                <a href="/api-sources" className="underline">Nguồn API</a>
              </p>
            )}
          </div>
        );
      })}

      <div className="pt-3 border-t border-zinc-800">
        <div className="text-xs text-zinc-400 mb-1.5 font-medium">
          Prompt nền cho AI sinh kịch bản <span className="text-zinc-600 font-normal">(tuỳ chọn)</span>
        </div>
        <textarea
          value={config.scriptBasePrompt || ''}
          onChange={e => onChange({ scriptBasePrompt: e.target.value })}
          onBlur={e => save.mutate({ scriptBasePrompt: e.target.value })}
          rows={4}
          placeholder="Để trống = dùng director template mặc định (gồm niche, language, visual style của project). Viết riêng nếu muốn override toàn bộ — VD: 'Bạn là biên kịch chuyên kể chuyện ma Việt Nam thập niên 80, tone u ám, narrative ngôi thứ nhất...'"
          className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 resize-y font-mono text-[12px] leading-relaxed"
        />
        <p className="text-[11px] text-zinc-600 mt-1.5">
          💡 Default sẽ tự lắp niche/language/visual style + ràng buộc JSON output. Override khi muốn giọng văn / persona riêng.
        </p>
      </div>

      <p className="text-[11px] text-zinc-600 pt-2 border-t border-zinc-800">
        💡 Provider có (free) chạy không cần key. Còn lại cần thêm key tương ứng trong "Nguồn API".
      </p>
    </div>
  );
}
