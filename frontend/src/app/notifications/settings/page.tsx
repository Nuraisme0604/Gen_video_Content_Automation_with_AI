'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { testTelegram } from '@/lib/api';
import { CheckCircle2, XCircle, Send, Info } from 'lucide-react';

export default function NotificationSettingsPage() {
  const testTg = useMutation({ mutationFn: testTelegram });
  const [logLevel, setLogLevel] = useState('info');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Cài đặt thông báo</h1>

      {/* Telegram config */}
      <div className="card p-5 space-y-4">
        <h2 className="font-medium">Telegram Bot</h2>

        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-3">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>
            Cấu hình <code className="font-mono">TELEGRAM_BOT_TOKEN</code> và{' '}
            <code className="font-mono">TELEGRAM_CHAT_ID</code> trong file <code>.env</code> rồi restart backend.
            Không lưu token trực tiếp trong UI.
          </span>
        </div>

        <div className="space-y-3 text-sm">
          <div className="font-medium text-zinc-400 text-xs uppercase tracking-wider">Sự kiện gửi thông báo</div>
          {[
            { label: 'Video hoàn thành', checked: true },
            { label: 'Cảnh lỗi (>3 lần retry)', checked: true },
            { label: 'Hết quota API', checked: true },
            { label: 'Mỗi cảnh sinh xong (spam — không nên bật)', checked: false },
          ].map(({ label, checked }) => (
            <label key={label} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" defaultChecked={checked} className="accent-violet-600" />
              <span className="text-zinc-300">{label}</span>
            </label>
          ))}
        </div>

        <div className="pt-2">
          <div className="text-xs text-zinc-400 mb-2">Template tin nhắn mặc định</div>
          <div className="bg-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-300 space-y-1">
            <div>✅ {'{project}'} - {'{video_title}'} hoàn thành</div>
            <div>⏱ {'{duration}'} · 🎬 {'{scene_count}'} cảnh</div>
            <div>💰 {'{cost}'}</div>
          </div>
        </div>

        <button onClick={() => testTg.mutate()} disabled={testTg.isPending}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm px-4 py-2 rounded-lg">
          <Send size={14} />
          {testTg.isPending ? 'Đang gửi...' : 'Gửi test message'}
          {testTg.data?.ok === true && <CheckCircle2 size={14} className="text-emerald-400" />}
          {testTg.data?.ok === false && <XCircle size={14} className="text-rose-400" />}
        </button>
      </div>

      {/* Log sink */}
      <div className="card p-5 space-y-4">
        <h2 className="font-medium">Đẩy log</h2>
        <div className="space-y-3 text-sm">
          {[
            { label: 'File local (./logs/app-{date}.log)', checked: true },
            { label: 'Telegram channel', checked: true },
            { label: 'Webhook URL', checked: false },
          ].map(({ label, checked }) => (
            <label key={label} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" defaultChecked={checked} className="accent-violet-600" />
              <span className="text-zinc-300">{label}</span>
            </label>
          ))}
        </div>

        <div>
          <div className="text-xs text-zinc-400 mb-2">Mức độ log</div>
          <div className="flex gap-2">
            {['debug', 'info', 'warn', 'error'].map(l => (
              <button key={l} onClick={() => setLogLevel(l)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  logLevel === l ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
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
