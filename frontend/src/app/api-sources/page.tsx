'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiKeys, createApiKey, toggleApiKey, deleteApiKey, testTelegram } from '@/lib/api';
import { Plus, CheckCircle2, XCircle, Trash2, Send, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_TABS = [
  { label: 'Kịch bản', value: 'SCRIPT' },
  { label: 'Ảnh', value: 'IMAGE' },
  { label: 'Video', value: 'VIDEO' },
  { label: 'Voice', value: 'VOICE' },
  { label: 'BGM', value: 'BGM' },
] as const;

const PROVIDER_PRESETS: Record<string, { provider: string; type: string }[]> = {
  SCRIPT: [
    { provider: 'openai', type: 'SCRIPT' },
    { provider: 'anthropic', type: 'SCRIPT' },
  ],
  IMAGE: [{ provider: 'openai', type: 'IMAGE' }],
  VIDEO: [
    { provider: 'google', type: 'VIDEO' },
    { provider: 'runway', type: 'VIDEO' },
  ],
  VOICE: [{ provider: 'elevenlabs', type: 'VOICE' }],
  BGM: [{ provider: 'elevenlabs', type: 'BGM' }],
};

type ApiKey = {
  id: string;
  provider: string;
  type: string;
  label?: string;
  keyMasked: string;
  quotaLimit?: number;
  quotaUsed: number;
  isActive: boolean;
};

export default function ApiSourcesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>('SCRIPT');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ provider: '', type: tab, key: '', label: '', quotaLimit: '' });
  const [showKey, setShowKey] = useState(false);

  const { data: allKeys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => getApiKeys(),
  });

  const keys: ApiKey[] = allKeys.filter((k: ApiKey) => k.type === tab);

  const add = useMutation({
    mutationFn: () => createApiKey({
      provider: form.provider,
      type: form.type,
      key: form.key,
      label: form.label || undefined,
      quotaLimit: form.quotaLimit ? Number(form.quotaLimit) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setShowAdd(false);
      setForm({ provider: '', type: tab, key: '', label: '', quotaLimit: '' });
    },
  });

  const toggle = useMutation({
    mutationFn: toggleApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const del = useMutation({
    mutationFn: deleteApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const testTg = useMutation({ mutationFn: testTelegram });

  const quotaPercent = (k: ApiKey) =>
    k.quotaLimit ? Math.round((k.quotaUsed / k.quotaLimit) * 100) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Nguồn API</h1>

      {/* Tab bar */}
      <div className="card">
        <div className="flex border-b border-[--border]">
          {TYPE_TABS.map(t => (
            <button
              key={t.value}
              onClick={() => { setTab(t.value); setShowAdd(false); }}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors',
                tab === t.value
                  ? 'text-violet-400 border-b-2 border-violet-500'
                  : 'text-zinc-500 hover:text-white',
              )}
            >
              {t.label}
              {allKeys.filter((k: ApiKey) => k.type === t.value).length > 0 && (
                <span className="ml-1.5 text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full">
                  {allKeys.filter((k: ApiKey) => k.type === t.value).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Key list */}
        <div className="divide-y divide-[--border]">
          {isLoading && <p className="p-4 text-sm text-zinc-500">Đang tải...</p>}

          {!isLoading && keys.length === 0 && (
            <p className="p-4 text-sm text-zinc-500">Chưa có key nào cho loại này.</p>
          )}

          {keys.map(k => {
            const pct = quotaPercent(k);
            return (
              <div key={k.id} className={cn('flex items-center gap-4 px-4 py-3', !k.isActive && 'opacity-50')}>
                {/* Provider badge */}
                <div className="shrink-0 w-24 font-mono text-xs bg-zinc-800 px-2 py-1 rounded text-center capitalize">
                  {k.provider}
                </div>

                {/* Label + masked key */}
                <div className="flex-1 min-w-0">
                  {k.label && <div className="text-xs text-zinc-400 mb-0.5">{k.label}</div>}
                  <div className="font-mono text-sm text-zinc-300">{k.keyMasked}</div>
                </div>

                {/* Quota bar */}
                {pct !== null && (
                  <div className="w-32 shrink-0">
                    <div className="flex justify-between text-xs text-zinc-500 mb-0.5">
                      <span>{k.quotaUsed}/{k.quotaLimit}</span>
                      <span className={pct > 80 ? 'text-amber-400' : 'text-zinc-500'}>{pct}%</span>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', pct > 80 ? 'bg-amber-500' : 'bg-violet-600')}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Status */}
                <div className="shrink-0">
                  {k.isActive
                    ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 size={12} /> OK</span>
                    : <span className="flex items-center gap-1 text-zinc-500 text-xs"><XCircle size={12} /> Tắt</span>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggle.mutate(k.id)}
                    className="p-1.5 text-zinc-500 hover:text-white rounded hover:bg-zinc-800"
                    title={k.isActive ? 'Tắt key' : 'Bật key'}
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    onClick={() => { if (confirm('Xoá key này?')) del.mutate(k.id); }}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 rounded hover:bg-zinc-800"
                    title="Xoá"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add key form */}
          {showAdd && (
            <div className="p-4 bg-zinc-900/50 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Provider</label>
                  <select
                    value={form.provider}
                    onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                    className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500"
                  >
                    <option value="">-- Chọn --</option>
                    {(PROVIDER_PRESETS[tab] || []).map(p => (
                      <option key={p.provider} value={p.provider}>{p.provider}</option>
                    ))}
                    <option value="other">Khác</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Label (tuỳ chọn)</label>
                  <input
                    value={form.label}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="VD: key chính"
                    className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={form.key}
                    onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
                    placeholder="sk-... hoặc AIza..."
                    className="w-full bg-zinc-800 rounded-lg px-3 py-2 pr-9 text-sm font-mono outline-none border border-zinc-700 focus:border-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Quota limit (tuỳ chọn)</label>
                <input
                  type="number"
                  value={form.quotaLimit}
                  onChange={e => setForm(f => ({ ...f, quotaLimit: e.target.value }))}
                  placeholder="VD: 100"
                  className="w-40 bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="text-sm text-zinc-400 px-3 py-1.5 hover:text-white"
                >Huỷ</button>
                <button
                  onClick={() => add.mutate()}
                  disabled={!form.provider || !form.key || add.isPending}
                  className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg"
                >
                  {add.isPending ? 'Đang lưu...' : 'Lưu key'}
                </button>
              </div>
            </div>
          )}

          {/* Add button */}
          {!showAdd && (
            <div className="p-3">
              <button
                onClick={() => { setShowAdd(true); setForm(f => ({ ...f, type: tab })); }}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800"
              >
                <Plus size={14} /> Thêm key {TYPE_TABS.find(t => t.value === tab)?.label}
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-500 px-4 pb-3">
          🔒 Key được mã hoá AES-256 trước khi lưu. Chỉ hiển thị 4 ký tự cuối.
          {' '}💡 Hệ thống tự xoay vòng khi 1 key đạt giới hạn quota.
        </p>
      </div>

      {/* Telegram test */}
      <div className="card p-5">
        <h2 className="font-medium mb-3">Test Telegram</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Cấu hình <code className="font-mono">TELEGRAM_BOT_TOKEN</code> và <code className="font-mono">TELEGRAM_CHAT_ID</code> trong file <code>.env</code> để nhận thông báo.
        </p>
        <button
          onClick={() => testTg.mutate()}
          disabled={testTg.isPending}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm px-4 py-2 rounded-lg"
        >
          <Send size={14} />
          {testTg.isPending ? 'Đang gửi...' : 'Gửi test message'}
          {testTg.data?.ok === true && <CheckCircle2 size={14} className="text-emerald-400" />}
          {testTg.data?.ok === false && <span className="text-rose-400 text-xs">{testTg.data.error}</span>}
        </button>
      </div>
    </div>
  );
}
