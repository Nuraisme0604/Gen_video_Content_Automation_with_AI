'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiKeys, updateProject } from '@/lib/api';

// Models available per provider
const PROVIDER_MODELS: Record<string, string[]> = {
  openai:    ['gpt-5.4-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  google:    ['veo-3.1-generate-preview', 'veo-2.0-generate-001'],
  runway:    ['gen4_turbo', 'gen3a_turbo'],
  elevenlabs:['eleven_multilingual_v2', 'eleven_monolingual_v1', 'eleven_turbo_v2'],
};

// Which key types map to which task
const TASK_KEY_TYPE: Record<string, string> = {
  script:  'SCRIPT',
  refine:  'SCRIPT',
  image:   'IMAGE',
  video:   'VIDEO',
  voice:   'VOICE',
  bgm:     'BGM',
};

const TASK_LABELS: Record<string, string> = {
  script:  'Script (AI viết kịch bản)',
  refine:  'Refine (AI tinh chỉnh)',
  image:   'Ảnh (Image gen)',
  video:   'Video (Veo / Runway)',
  voice:   'Voice (TTS)',
  bgm:     'BGM (Nhạc nền)',
};

type Config = {
  scriptProvider?: string; scriptModel?: string;
  refineProvider?: string; refineModel?: string;
  imageProvider?:  string; imageModel?:  string;
  videoProvider?:  string; videoModel?:  string;
  voiceProvider?:  string; voiceId?:     string;
};

type Props = { projectId: string; config: Config; onChange: (patch: any) => void };

export function AiConfigPanel({ projectId, config, onChange }: Props) {
  const qc = useQueryClient();
  const { data: allKeys = [] } = useQuery({ queryKey: ['api-keys'], queryFn: () => getApiKeys() });

  const save = useMutation({
    mutationFn: (data: any) => updateProject(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  });

  const set = (patch: any) => { onChange(patch); save.mutate(patch); };

  // Get providers with active keys for a given key type
  const activeProviders = (keyType: string): string[] => {
    const keys = (allKeys as any[]).filter((k) => k.type === keyType && k.isActive);
    return [...new Set<string>(keys.map((k) => k.provider as string))];
  };

  const tasks = [
    { key: 'script', providerField: 'scriptProvider', modelField: 'scriptModel' },
    { key: 'refine', providerField: 'refineProvider', modelField: 'refineModel' },
    { key: 'image',  providerField: 'imageProvider',  modelField: 'imageModel'  },
    { key: 'video',  providerField: 'videoProvider',  modelField: 'videoModel'  },
  ];

  return (
    <div className="card p-5 space-y-4">
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Cấu hình AI</div>

      {tasks.map(({ key, providerField, modelField }) => {
        const providers = activeProviders(TASK_KEY_TYPE[key]);
        const currentProvider = (config as any)[providerField] || providers[0] || '';
        const currentModel   = (config as any)[modelField]   || '';
        const models = PROVIDER_MODELS[currentProvider] || [];

        return (
          <div key={key} className="grid grid-cols-2 gap-2 items-start">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">{TASK_LABELS[key]}</label>
              <select
                value={currentProvider}
                onChange={e => set({ [providerField]: e.target.value, [modelField]: PROVIDER_MODELS[e.target.value]?.[0] || '' })}
                className="w-full bg-zinc-800 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 outline-none focus:border-violet-500"
              >
                {providers.length === 0 && (
                  <option value="">— Chưa có key —</option>
                )}
                {providers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {providers.length === 0 && (
                <p className="text-[10px] text-amber-400 mt-1">Thêm key tại Nguồn API</p>
              )}
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Model</label>
              <select
                value={currentModel}
                onChange={e => set({ [modelField]: e.target.value })}
                disabled={!currentProvider || models.length === 0}
                className="w-full bg-zinc-800 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 outline-none focus:border-violet-500 disabled:opacity-40"
              >
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
