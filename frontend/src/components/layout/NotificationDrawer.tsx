'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '@/lib/api';
import { Bell, X, CheckCircle2, XCircle, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'error' | 'telegram';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('all');

  const { data: logs = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(),
    refetchInterval: open ? 10_000 : false,
  });

  const filtered = logs.filter((l: any) => {
    if (tab === 'error') return l.status === 'failed';
    if (tab === 'telegram') return l.channel === 'telegram';
    return true;
  });

  const unread = logs.filter((l: any) => l.status === 'failed').length;

  return (
    <>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative hover:text-white text-zinc-400"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Drawer */}
      <div className={cn(
        'fixed top-12 right-0 bottom-7 z-50 w-80 bg-[#111113] border-l border-[--border] flex flex-col transition-transform duration-200',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[--border]">
          <span className="font-medium text-sm">Thông báo</span>
          <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[--border]">
          {([['all', 'Tất cả'], ['error', 'Lỗi'], ['telegram', 'TG']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2 text-xs font-medium transition-colors',
                tab === t ? 'text-violet-400 border-b-2 border-violet-500' : 'text-zinc-500 hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto divide-y divide-[--border]">
          {filtered.length === 0 && (
            <p className="text-zinc-500 text-xs p-4 text-center">Không có thông báo</p>
          )}
          {filtered.map((log: any) => (
            <div key={log.id} className="flex items-start gap-2.5 px-4 py-3">
              {log.status === 'sent'
                ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                : <XCircle size={13} className="text-rose-400 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-200 leading-snug">{log.message}</p>
                {log.errorMsg && <p className="text-[10px] text-rose-400 mt-0.5">{log.errorMsg}</p>}
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-600">
                  <Send size={9} />
                  <span>{log.channel}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: vi })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[--border]">
          <a href="/notifications/settings" className="text-xs text-zinc-500 hover:text-violet-400">
            Cài đặt thông báo →
          </a>
        </div>
      </div>
    </>
  );
}
