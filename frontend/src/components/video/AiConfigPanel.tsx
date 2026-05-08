'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiKeys, updateProject } from '@/lib/api';

// Suggested models per provider — user can type any model not in this list
const SUGGESTED_MODELS: Record<string, string[]> = {
  openai:    ['gpt-5.4-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-image-2', 'dall-e-3'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  google:    ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'veo-3.1-generate-preview', 'veo-2.0-generate-001'],
  gemini:    ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision'],
  runway:    ['gen4_turbo', 'gen3a_turbo'],
  elevenlabs:['eleven_multilingual_v2', 'eleven_turbo_v2', 'eleven_monolingual_v1'],
};

const TASK_KEY_TYPE: Record<string, string> = {
  script: 'SCRIPT',
  refine: 'SCRIPT',
  image:  'IMAGE',
  video:  'VIDEO',
};

const TASK_LABELS: Record<string, string> = {
  script: 'Script',
  refine: 'Refine',
  image:  'Ảnh',
  video:  'Video',
};

const TASKS = [
  { key: 'script', providerField: 'scriptProvider', modelField: 'scriptModel' },
  { key: 'refine', providerField: 'refineProvider', modelField: 'refineModel' },
  { key: 'image',  providerField: 'imageProvider',  modelField: 'imageModel'  },
  { key: 'video',  providerField: 'videoProvider',  modelField: 'videoModel'  },
];

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
  });

  const set = (patch: any) => { onChange(patch); save.mutate(patch); };

  // All unique providers that have at least 1 active key for a given key type
  const activeProviders = (keyType: string): string[] => {
    const keys = (allKeys as any[]).filter(k => k.type === keyType && k.isActive);
    return [...new Set<string>(keys.map(k => k.provider as string))];
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Cấu hình AI</div>

      {TASKS.map(({ key, providerField, modelField }) => {
        const providers = activeProviders(TASK_KEY_TYPE[key]);
        const currentProvider = config[providerField] || '';
        const currentModel   = config[modelField]   || '';
        const suggested = SUGGESTED_MODELS[currentProvider] || [];
        const listId = `models-${key}`;

        return (
          <div key={key}>
            <div className="text-xs text-zinc-500 mb-1.5">{TASK_LABELS[key]}</div>
            <div className="grid grid-cols-2 gap-2">
              {/* Provider selector */}
              <select
                value={currentProvider}
                onChange={e => set({ [providerField]: e.target.value, [modelField]: SUGGESTED_MODELS[e.target.value]?.[0] || '' })}
                className="w-full bg-zinc-800 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 outline-none focus:border-violet-500"
              >
                <option value="">— chọn provider —</option>
                {providers.map(p => <option key={p} value={p}>{p}</option>)}
                {/* Show current provider even if no key yet */}
                {currentProvider && !providers.includes(currentProvider) && (
                  <option value={currentProvider}>{currentProvider} ⚠️</option>
                )}
              </select>

              {/* Model: free text + suggestions via datalist */}
              <div className="relative">
                <input
                  list={listId}
                  value={currentModel}
                  onChange={e => set({ [modelField]: e.target.value })}
                  placeholder="Nhập tên model..."
                  disabled={!currentProvider}
                  className="w-full bg-zinc-800 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 outline-none focus:border-violet-500 disabled:opacity-40"
                />
                <datalist id={listId}>
                  {suggested.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>
            </div>

            {providers.length === 0 && (
              <p className="text-[10px] text-amber-400 mt-1">
                Chưa có key active cho loại này → vào{' '}
                <a href="/api-sources" className="underline">Nguồn API</a> để thêm
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
