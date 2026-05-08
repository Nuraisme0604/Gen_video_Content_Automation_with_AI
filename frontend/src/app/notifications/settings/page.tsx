'use client';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { testTelegram } from '@/lib/api';
import { CheckCircle2, XCircle, Send, Info, Save } from 'lucide-react';

const STORAGE_KEY = 'vca:notification-config';

type Config = {
  events: { videoComplete: boolean; sceneError: boolean; quotaExceeded: boolean; eachScene: boolean };
  logSinks: { fileLocal: boolean; telegramChannel: boolean; webhook: boolean };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

const DEFAULT: Config = {
  events: { videoComplete: true, sceneError: true, quotaExceeded: true, eachScene: false },
  logSinks: { fileLocal: true, telegramChannel: true, webhook: false },
  logLevel: 'info',
};

export default function NotificationSettingsPage() {
  const testTg = useMutation({ mutationFn: testTelegram });
  const [config, setConfig] = useState<Config>(DEFAULT);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setConfig({ ...DEFAULT, ...JSON.parse(saved) }); } catch {}
    }
  }, []);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cài đặt thông báo</h1>
        <button onClick={save}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-4 py-2 rounded-lg">
          {savedAt ? <><CheckCircle2 size={14} /> Đã lưu</> : <><Save size={14} /> Lưu cài đặt</>}
        </button>
      </div>

      {/* Telegram config */}
      <div className="card p-5 space-y-4">
        <h2 className="font-medium">Telegram Bot</h2>
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-3">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>Bot Token + Chat ID set trong file <code>.env</code> (server-side). Settings dưới này lưu local trên trình duyệt.</span>
        </div>

        <div>
          <div className="font-medium text-zinc-400 text-xs uppercase tracking-wider mb-2">Sự kiện gửi thông báo</div>
          <div className="space-y-2 text-sm">
            {[
              { key: 'videoComplete', label: 'Video hoàn thành' },
              { key: 'sceneError', label: 'Cảnh lỗi (>3 lần retry)' },
              { key: 'quotaExceeded', label: 'Hết quota API' },
              { key: 'eachScene', label: 'Mỗi cảnh sinh xong (spam — không nên bật)' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(config.events as any)[key]}
                  onChange={e => setConfig(c => ({ ...c, events: { ...c.events, [key]: e.target.checked } }))}
                  className="accent-violet-600" />
                <span className="text-zinc-300">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <button onClick={() => testTg.mutate()} disabled={testTg.isPending}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm px-4 py-2 rounded-lg">
          <Send size={14} />
          {testTg.isPending ? 'Đang gửi...' : 'Gửi test message'}
          {testTg.data?.ok === true && <CheckCircle2 size={14} className="text-emerald-400" />}
          {testTg.data?.ok === false && <span className="text-rose-400 text-xs">{testTg.data.error}</span>}
        </button>
      </div>

      {/* Log sink */}
      <div className="card p-5 space-y-4">
        <h2 className="font-medium">Đẩy log</h2>
        <div className="space-y-2 text-sm">
          {[
            { key: 'fileLocal', label: 'File local (./logs/app-{date}.log)' },
            { key: 'telegramChannel', label: 'Telegram channel' },
            { key: 'webhook', label: 'Webhook URL' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={(config.logSinks as any)[key]}
                onChange={e => setConfig(c => ({ ...c, logSinks: { ...c.logSinks, [key]: e.target.checked } }))}
                className="accent-violet-600" />
              <span className="text-zinc-300">{label}</span>
            </label>
          ))}
        </div>

        <div>
          <div className="text-xs text-zinc-400 mb-2">Mức độ log</div>
          <div className="flex gap-2">
            {(['debug', 'info', 'warn', 'error'] as const).map(l => (
              <button key={l} onClick={() => setConfig(c => ({ ...c, logLevel: l }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  config.logLevel === l ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
