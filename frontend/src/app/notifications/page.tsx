'use client';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { CheckCircle2, XCircle, Send } from 'lucide-react';

const TABS = ['Tất cả', 'Lỗi', 'Telegram'];

export default function NotificationsPage() {
  const { data: logs = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(),
    refetchInterval: 15_000,
  });

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Thông báo & Logs</h1>

      <div className="card divide-y divide-[--border]">
        {logs.length === 0 && (
          <p className="text-zinc-500 text-sm p-6 text-center">Chưa có thông báo nào</p>
        )}
        {logs.map((log: any) => (
          <div key={log.id} className="flex items-start gap-3 p-4">
            {log.status === 'sent'
              ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              : <XCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200">{log.message}</p>
              {log.errorMsg && <p className="text-xs text-rose-400 mt-0.5">{log.errorMsg}</p>}
              <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                <Send size={10} /> {log.channel}
                <span>·</span>
                {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: vi })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
