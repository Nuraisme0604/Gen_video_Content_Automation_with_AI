'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiKeys, createApiKey, toggleApiKey, deleteApiKey, resetApiKeyQuota, testTelegram, testApiKey, testStoredApiKey } from '@/lib/api';
import { Plus, CheckCircle2, XCircle, Trash2, Send, Eye, EyeOff, RotateCcw, Gauge, Sparkles, Loader2, Activity, AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Friendly display name + concrete model coverage (matches AiConfigPanel)
const PROVIDER_INFO: Record<string, {
  displayName: string;
  description: string;
  modelsByCapability: Record<string, string[]>;
}> = {
  google: {
    displayName: 'Google AI',
    description: 'Gemini · Imagen · Veo',
    modelsByCapability: {
      SCRIPT: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      IMAGE:  ['imagen-4-fast', 'imagen-4-ultra (paid)'],
      VIDEO:  ['veo-3 (paid)'],
      VOICE:  ['google-tts-vi'],
    },
  },
  openai: {
    displayName: 'OpenAI',
    description: 'GPT · DALL-E · TTS',
    modelsByCapability: {
      SCRIPT: ['gpt-4o', 'gpt-4o-mini'],
      IMAGE:  ['dall-e-3'],
      VOICE:  ['tts-1 (Onyx, Alloy...)'],
    },
  },
  anthropic: {
    displayName: 'Anthropic',
    description: 'Claude (text only)',
    modelsByCapability: {
      SCRIPT: ['claude-opus-4-7', 'claude-sonnet-4-6'],
    },
  },
  elevenlabs: {
    displayName: 'ElevenLabs',
    description: 'Voice + Music',
    modelsByCapability: {
      VOICE: ['eleven-multilingual-v2', 'eleven-turbo-v2'],
      BGM:   ['eleven-music'],
    },
  },
  runway: {
    displayName: 'Runway ML',
    description: 'Video gen',
    modelsByCapability: {
      VIDEO: ['gen-3-alpha', 'gen-3-turbo'],
    },
  },
  replicate: {
    displayName: 'Replicate',
    description: 'Đa model (Flux, Kling, Luma...)',
    modelsByCapability: {
      IMAGE: ['flux-1.1-pro'],
      VIDEO: ['kling-1.6', 'luma-dream'],
    },
  },
  pexels: {
    displayName: 'Pexels',
    description: 'Stock ảnh + video (Free)',
    modelsByCapability: {
      IMAGE: ['pexels-stock'],
      VIDEO: ['pexels-video'],
    },
  },
};

function getProviderInfo(provider: string) {
  return PROVIDER_INFO[provider.toLowerCase()] || {
    displayName: provider || 'Unknown',
    description: 'Provider tuỳ chỉnh',
    modelsByCapability: {},
  };
}

const TYPE_TABS = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Kịch bản', value: 'SCRIPT' },
  { label: 'Ảnh', value: 'IMAGE' },
  { label: 'Video', value: 'VIDEO' },
  { label: 'Voice', value: 'VOICE' },
  { label: 'BGM', value: 'BGM' },
] as const;

const CAPABILITIES = [
  { value: 'SCRIPT', label: 'Kịch bản (Script)' },
  { value: 'IMAGE',  label: 'Ảnh (Image)' },
  { value: 'VIDEO',  label: 'Video' },
  { value: 'VOICE',  label: 'Voice' },
  { value: 'BGM',    label: 'BGM (nhạc nền)' },
] as const;

// Auto-detect provider from key prefix + default capabilities
function detectProvider(key: string): { provider: string; defaults: string[]; description: string } {
  const k = key.trim();
  if (k.startsWith('AIza'))    return { provider: 'google',     defaults: ['SCRIPT','IMAGE','VIDEO'], description: 'Google AI (Gemini, Imagen, Veo)' };
  if (k.startsWith('sk-ant-')) return { provider: 'anthropic',  defaults: ['SCRIPT'],                  description: 'Anthropic Claude' };
  if (k.startsWith('sk-proj-') || k.startsWith('sk-'))
                               return { provider: 'openai',     defaults: ['SCRIPT','IMAGE'],          description: 'OpenAI (GPT, DALL-E)' };
  if (k.startsWith('xi-'))     return { provider: 'elevenlabs', defaults: ['VOICE','BGM'],             description: 'ElevenLabs (voice + music)' };
  if (k.startsWith('key_'))    return { provider: 'runway',     defaults: ['VIDEO'],                   description: 'Runway ML' };
  return { provider: '', defaults: [], description: 'Provider không xác định — chọn thủ công' };
}

type ApiKey = {
  id: string;
  provider: string;
  type: string;
  label?: string;
  keyMasked: string;
  quotaLimit?: number;
  quotaUsed: number;
  isActive: boolean;
  lastTestedAt?: string | null;
  lastTestStatus?: 'ok' | 'invalid' | 'quota' | 'error' | null;
  lastTestError?: string | null;
  lastTestLatency?: number | null;
};

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s trước`;
  if (s < 3600)  return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

function HealthBadge({ k, testing }: { k: ApiKey; testing: boolean }) {
  if (testing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-violet-300 text-xs font-medium px-2 py-1 rounded-full bg-violet-500/15 border border-violet-500/30">
        <Loader2 size={12} className="animate-spin" /> Đang test...
      </span>
    );
  }
  if (!k.lastTestStatus) {
    return (
      <span className="inline-flex items-center gap-1.5 text-zinc-400 text-xs font-medium px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700"
        title="Chưa kiểm tra với provider — bấm Test để xác minh">
        <HelpCircle size={12} /> Chưa test
      </span>
    );
  }
  if (k.lastTestStatus === 'ok') {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-300 text-xs font-medium px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30"
        title={`Hoạt động · ${k.lastTestLatency || '?'}ms · ${relativeTime(k.lastTestedAt)}`}>
        <CheckCircle2 size={12} /> OK{k.lastTestLatency != null && ` · ${k.lastTestLatency}ms`}
      </span>
    );
  }
  if (k.lastTestStatus === 'quota') {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-300 text-xs font-medium px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30"
        title={k.lastTestError || 'Quota tạm thời hết'}>
        <AlertTriangle size={12} /> Hết quota
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-rose-300 text-xs font-medium px-2 py-1 rounded-full bg-rose-500/15 border border-rose-500/30"
      title={k.lastTestError || 'Key không sử dụng được'}>
      <XCircle size={12} /> Hỏng
    </span>
  );
}

export default function ApiSourcesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({
    key: '',
    provider: '',
    capabilities: [] as string[],
    label: '',
    quotaLimit: '',
  });

  const { data: allKeys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => getApiKeys(),
  });

  // Detection runs as user types
  const detection = useMemo(() => detectProvider(form.key), [form.key]);

  // When key changes and we detect a known provider, auto-fill capabilities + provider
  const onKeyChange = (val: string) => {
    const det = detectProvider(val);
    setForm(f => ({
      ...f,
      key: val,
      // Only auto-fill if user hasn't manually changed yet (provider matches detected, or it's empty)
      provider: det.provider || f.provider,
      capabilities: det.defaults.length > 0 && f.capabilities.length === 0 ? det.defaults : f.capabilities,
    }));
  };

  const filteredKeys: ApiKey[] = tab === 'ALL'
    ? allKeys
    : (allKeys as ApiKey[]).filter(k => k.type === tab);

  // Group same key by keyMasked + provider for cleaner display (1 row even if used for multiple types)
  const grouped = useMemo(() => {
    const map = new Map<string, ApiKey[]>();
    for (const k of filteredKeys) {
      const groupKey = `${k.provider}:${k.keyMasked}:${k.label || ''}`;
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(k);
    }
    return Array.from(map.values());
  }, [filteredKeys]);

  const errMsg = (e: any) => e?.response?.data?.message || e?.message || 'Lỗi không xác định';

  const add = useMutation({
    mutationFn: async () => {
      if (!form.capabilities.length) throw new Error('Phải chọn ít nhất 1 loại sử dụng');
      const promises = form.capabilities.map(type =>
        createApiKey({
          provider: form.provider,
          type,
          key: form.key,
          label: form.label || undefined,
          quotaLimit: form.quotaLimit ? Number(form.quotaLimit) : undefined,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setShowAdd(false);
      setShowKey(false);
      const count = form.capabilities.length;
      const provName = getProviderInfo(form.provider).displayName;
      setForm({ key: '', provider: '', capabilities: [], label: '', quotaLimit: '' });
      toast.success(`Đã thêm key ${provName}`, { description: `Cho ${count} loại tác vụ` });
    },
    onError: (e: any) => toast.error('Thêm key thất bại', { description: errMsg(e) }),
  });

  const toggle = useMutation({
    mutationFn: toggleApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
    onError: (e: any) => toast.error('Đổi trạng thái thất bại', { description: errMsg(e) }),
  });

  const resetQuota = useMutation({
    mutationFn: resetApiKeyQuota,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('Đã reset quota'); },
    onError: (e: any) => toast.error('Reset quota thất bại', { description: errMsg(e) }),
  });

  const del = useMutation({
    mutationFn: deleteApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const delGroup = useMutation({
    mutationFn: async (ids: string[]) => Promise.all(ids.map(id => deleteApiKey(id))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('Đã xoá key'); },
    onError: (e: any) => toast.error('Xoá key thất bại', { description: errMsg(e) }),
  });

  const testTg = useMutation({ mutationFn: testTelegram });

  const testKey = useMutation({
    mutationFn: () => testApiKey({ key: form.key, provider: form.provider }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success('Key hợp lệ', { description: `Phản hồi ${r.latencyMs}ms` });
      else toast.error('Key không sử dụng được', { description: r?.error || 'Unknown' });
    },
    onError: (e: any) => toast.error('Test thất bại', { description: errMsg(e) }),
  });

  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const testStored = useMutation({
    mutationFn: async (id: string) => {
      setTestingIds(prev => new Set(prev).add(id));
      try { return await testStoredApiKey(id); }
      finally { setTestingIds(prev => { const n = new Set(prev); n.delete(id); return n; }); }
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      if (r?.ok) toast.success('Key OK', { description: `${r.latencyMs}ms` });
      else toast.error('Key không hoạt động', { description: r?.error || 'Unknown' });
    },
    onError: (e: any) => toast.error('Test thất bại', { description: errMsg(e) }),
  });

  const testAllStored = useMutation({
    mutationFn: async () => {
      const ids = (allKeys as ApiKey[]).map(k => k.id);
      // Dedup by provider:keyMasked so we only test each unique key once
      const seen = new Set<string>();
      const uniqueIds = (allKeys as ApiKey[]).filter(k => {
        const tag = `${k.provider}:${k.keyMasked}`;
        if (seen.has(tag)) return false;
        seen.add(tag);
        return true;
      }).map(k => k.id);
      setTestingIds(new Set(ids));
      try { await Promise.allSettled(uniqueIds.map(id => testStoredApiKey(id))); }
      finally { setTestingIds(new Set()); }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
    onSuccess: () => toast.success('Đã test xong tất cả key'),
  });

  const toggleCap = (cap: string) => {
    setForm(f => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter(c => c !== cap)
        : [...f.capabilities, cap],
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Nguồn API</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Quản lý key + kiểm tra key nào còn hoạt động</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => testAllStored.mutate()}
            disabled={testAllStored.isPending || (allKeys as ApiKey[]).length === 0}
            className="flex items-center gap-2 border border-zinc-700 hover:border-violet-500 hover:text-violet-300 text-zinc-300 text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
            title="Test tất cả key xem cái nào còn hoạt động"
          >
            {testAllStored.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <Activity size={14} />}
            {testAllStored.isPending ? 'Đang test...' : 'Test tất cả'}
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-3 py-1.5 rounded-lg">
            <Plus size={14} /> Thêm key
          </button>
        </div>
      </div>

      {/* Tab filter */}
      <div className="card">
        <div className="flex border-b border-[--border] flex-wrap">
          {TYPE_TABS.map(t => {
            const count = t.value === 'ALL'
              ? new Set((allKeys as ApiKey[]).map(k => `${k.provider}:${k.keyMasked}`)).size
              : (allKeys as ApiKey[]).filter(k => k.type === t.value).length;
            return (
              <button key={t.value} onClick={() => setTab(t.value)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium transition-colors',
                  tab === t.value ? 'text-violet-400 border-b-2 border-violet-500' : 'text-zinc-500 hover:text-white',
                )}>
                {t.label}
                {count > 0 && (
                  <span className="ml-1.5 text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Key list — grouped */}
        <div className="divide-y divide-[--border]">
          {isLoading && <p className="p-4 text-sm text-zinc-500">Đang tải...</p>}

          {!isLoading && grouped.length === 0 && (
            <p className="p-4 text-sm text-zinc-500">Chưa có key nào{tab !== 'ALL' ? ' cho loại này' : ''}.</p>
          )}

          {grouped.map((group, idx) => {
            const k = group[0];
            const types = group.map(g => g.type);
            const totalUsed = group.reduce((s, x) => s + x.quotaUsed, 0);
            const totalLimit = group[0]?.quotaLimit;
            const pct = totalLimit ? Math.round((totalUsed / totalLimit) * 100) : null;
            const allActive = group.every(g => g.isActive);
            const ids = group.map(g => g.id);

            const info = getProviderInfo(k.provider);
            const isTesting = testingIds.has(k.id);
            const badgeAccent =
              k.lastTestStatus === 'ok'      ? 'ring-emerald-500/30' :
              k.lastTestStatus === 'quota'   ? 'ring-amber-500/30' :
              k.lastTestStatus === 'invalid' ||
              k.lastTestStatus === 'error'   ? 'ring-rose-500/30' :
              'ring-transparent';
            return (
              <div key={idx} className={cn(
                'flex flex-wrap md:flex-nowrap items-start md:items-center gap-3 md:gap-4 px-3 sm:px-4 py-3.5 transition-colors hover:bg-zinc-900/40 ring-1 ring-inset',
                badgeAccent,
                !allActive && 'opacity-60',
              )}>
                {/* Provider info */}
                <div className="shrink-0 w-full md:w-48">
                  <div className="text-sm font-semibold text-white mb-0.5">{info.displayName}</div>
                  <div className="text-[11px] text-zinc-500 mb-1.5">{info.description}</div>
                  <div className="flex flex-wrap gap-1">
                    {types.map(t => (
                      <span key={t} className="text-[10px] bg-violet-500/20 text-violet-200 px-1.5 py-0.5 rounded font-medium">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  {k.label && <div className="text-xs text-zinc-300 mb-0.5 font-medium">{k.label}</div>}
                  <div className="font-mono text-xs text-zinc-200 mb-1">{k.keyMasked}</div>
                  <div className="text-[10px] text-zinc-500">
                    Models:{' '}
                    {types.flatMap(t => info.modelsByCapability[t] || []).slice(0, 4).map(m => (
                      <span key={m} className="font-mono mr-1.5 text-zinc-300">{m}</span>
                    ))}
                    {types.flatMap(t => info.modelsByCapability[t] || []).length === 0 && (
                      <span className="text-zinc-600">— (provider tuỳ chỉnh, model nhập tay)</span>
                    )}
                  </div>
                  {k.lastTestedAt && (
                    <div className="text-[10px] text-zinc-600 mt-1">
                      Test gần nhất: {relativeTime(k.lastTestedAt)}
                      {k.lastTestStatus !== 'ok' && k.lastTestError && (
                        <span className="text-rose-400/70 ml-1.5">· {k.lastTestError}</span>
                      )}
                    </div>
                  )}
                </div>

                {pct !== null && (
                  <div className="w-full md:w-32 shrink-0">
                    <div className="flex justify-between text-xs text-zinc-400 mb-0.5">
                      <span>{totalUsed}/{totalLimit}</span>
                      <span className={pct > 80 ? 'text-amber-300 font-medium' : 'text-zinc-400'}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', pct > 80 ? 'bg-amber-500' : 'bg-violet-500')}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                )}

                <div className="shrink-0 flex md:flex-col flex-row items-start md:items-end gap-1.5 md:gap-1 w-full md:w-auto">
                  <HealthBadge k={k} testing={isTesting} />
                  {!allActive && (
                    <span className="text-[10px] text-zinc-500">Đang tắt</span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-auto md:ml-0">
                  <button onClick={() => testStored.mutate(k.id)}
                    disabled={isTesting}
                    className="p-2 text-violet-300 hover:text-violet-200 rounded-lg hover:bg-violet-500/15 disabled:opacity-50"
                    title="Test key với provider thật">
                    {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                  </button>
                  <button onClick={() => ids.forEach(id => toggle.mutate(id))}
                    className="p-2 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800"
                    title={allActive ? 'Tắt tất cả' : 'Bật tất cả'}>
                    <RotateCcw size={14} />
                  </button>
                  {totalLimit && (
                    <button onClick={() => { if (confirm('Reset quotaUsed về 0 cho tất cả?')) ids.forEach(id => resetQuota.mutate(id)); }}
                      className="p-2 text-zinc-300 hover:text-amber-300 rounded-lg hover:bg-amber-500/15"
                      title="Reset quota">
                      <Gauge size={14} />
                    </button>
                  )}
                  <button onClick={() => { if (confirm(`Xoá key này (${types.length} usage)?`)) delGroup.mutate(ids); }}
                    className="p-2 text-rose-300 hover:text-rose-200 rounded-lg hover:bg-rose-500/15"
                    title="Xoá key">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-zinc-500 px-4 py-3 border-t border-[--border]">
          🔒 Key được mã hoá AES-256 trước khi lưu. 1 key có thể dùng cho nhiều loại tác vụ (ví dụ Gemini key cover cả Script + Image + Video).
        </p>
      </div>

      {/* Telegram test */}
      <div className="card p-5">
        <h2 className="font-medium mb-3">Test Telegram</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Cấu hình <code className="font-mono">TELEGRAM_BOT_TOKEN</code> và <code className="font-mono">TELEGRAM_CHAT_ID</code> trong file <code>.env</code>.
        </p>
        <button onClick={() => testTg.mutate()} disabled={testTg.isPending}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm px-4 py-2 rounded-lg">
          <Send size={14} />
          {testTg.isPending ? 'Đang gửi...' : 'Gửi test message'}
          {testTg.data?.ok === true && <CheckCircle2 size={14} className="text-emerald-400" />}
          {testTg.data?.ok === false && <span className="text-rose-400 text-xs">{testTg.data.error}</span>}
        </button>
      </div>

      {/* Add key modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold flex items-center gap-2">
              <Plus size={16} /> Thêm API key mới
            </h2>

            {/* Step 1: Paste key */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={form.key}
                  onChange={e => onKeyChange(e.target.value)}
                  placeholder="Paste key vào đây (sk-..., AIza..., xi-..., key_...)"
                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 pr-9 text-sm font-mono outline-none border border-zinc-700 focus:border-violet-500"
                />
                <button type="button" onClick={() => setShowKey(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {form.key && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-xs">
                    {detection.provider ? (
                      <>
                        <Sparkles size={12} className="text-violet-400" />
                        <span className="text-violet-300">
                          Phát hiện: <span className="font-medium">{getProviderInfo(detection.provider).displayName}</span>
                          <span className="text-zinc-500"> · {detection.description}</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-amber-400">{detection.description}</span>
                    )}
                  </div>
                  {/* Show models this provider serves */}
                  {detection.provider && (
                    <div className="mt-2 text-[11px] text-zinc-500 bg-zinc-900 rounded p-2 border border-zinc-800">
                      <div className="text-zinc-400 mb-1">Key này dùng được cho:</div>
                      {Object.entries(getProviderInfo(detection.provider).modelsByCapability).map(([cap, models]) => (
                        <div key={cap} className="flex gap-2 leading-relaxed">
                          <span className="text-violet-400 font-medium w-14">{cap}:</span>
                          <span className="font-mono">{models.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Provider (auto-filled but editable) */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Provider</label>
              <input
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                placeholder="google / openai / anthropic / elevenlabs / runway / khác"
                className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500"
              />
            </div>

            {/* Step 3: Capabilities checkboxes */}
            <div>
              <label className="text-xs text-zinc-400 mb-2 block">Có thể dùng cho</label>
              <div className="grid grid-cols-2 gap-2">
                {CAPABILITIES.map(c => (
                  <label key={c.value}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors',
                      form.capabilities.includes(c.value)
                        ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500',
                    )}>
                    <input type="checkbox" checked={form.capabilities.includes(c.value)}
                      onChange={() => toggleCap(c.value)} className="accent-violet-600" />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                💡 Mặc định auto-tick theo provider phát hiện được. Bạn có thể tự chọn lại tuỳ ý.
              </p>
            </div>

            {/* Optional: label + quota */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Label (tuỳ chọn)</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="VD: key chính"
                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Quota limit (tuỳ chọn)</label>
                <input type="number" value={form.quotaLimit}
                  onChange={e => setForm(f => ({ ...f, quotaLimit: e.target.value }))}
                  placeholder="VD: 100"
                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500" />
              </div>
            </div>

            {add.error && (
              <div className="text-xs text-rose-400 bg-rose-500/10 rounded p-2">
                {(add.error as Error).message}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2 items-center">
              <button onClick={() => testKey.mutate()}
                disabled={!form.key || !form.provider || testKey.isPending}
                className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg hover:border-violet-500 disabled:opacity-50">
                {testKey.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {testKey.isPending ? 'Đang test...' : 'Test kết nối'}
              </button>
              <div className="flex-1" />
              <button onClick={() => { setShowAdd(false); setForm({ key:'', provider:'', capabilities:[], label:'', quotaLimit:'' }); }}
                className="text-sm text-zinc-400 px-3 py-1.5 hover:text-white">Huỷ</button>
              <button onClick={() => add.mutate()}
                disabled={!form.key || !form.provider || form.capabilities.length === 0 || add.isPending}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg">
                {add.isPending ? 'Đang lưu...' : `Lưu key${form.capabilities.length > 1 ? ` (${form.capabilities.length} loại)` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
