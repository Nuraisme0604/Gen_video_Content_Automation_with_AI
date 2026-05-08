'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJobs } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { statusColor, statusLabel, cn } from '@/lib/utils';
import { Filter } from 'lucide-react';

const QUEUES = ['', 'render', 'transcript-fetch', 'notify'];
const STATUSES = ['', 'queued', 'active', 'completed', 'failed'];

export default function JobsPage() {
  const [queue, setQueue] = useState('');
  const [status, setStatus] = useState('');

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs', queue, status],
    queryFn: () => getJobs({ queue: queue || undefined, status: status || undefined }),
    refetchInterval: 5000,
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Job Queue</h1>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-zinc-500" />
          <select value={queue} onChange={e => setQueue(e.target.value)}
            className="bg-zinc-800 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 outline-none focus:border-violet-500">
            {QUEUES.map(q => <option key={q || 'all'} value={q}>{q || 'Tất cả queue'}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="bg-zinc-800 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 outline-none focus:border-violet-500">
            {STATUSES.map(s => <option key={s || 'all'} value={s}>{s ? statusLabel(s) : 'Tất cả status'}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-zinc-500 border-b border-[--border]">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Queue</th>
              <th className="text-left px-4 py-3 font-medium">Job ID</th>
              <th className="text-left px-4 py-3 font-medium">Video</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Progress</th>
              <th className="text-left px-4 py-3 font-medium">Thời gian</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[--border]">
            {jobs.map((j: any) => (
              <tr key={j.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3"><span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded">{j.queue}</span></td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{j.bullJobId || j.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-zinc-400 truncate max-w-[160px]">{j.videoId?.slice(0, 12) || '-'}</td>
                <td className="px-4 py-3"><span className={cn('text-xs font-medium', statusColor(j.status))}>{statusLabel(j.status)}</span></td>
                <td className="px-4 py-3">
                  {j.status === 'active' || j.status === 'queued' ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${j.progress}%` }} />
                      </div>
                      <span className="text-xs text-zinc-500">{j.progress}%</span>
                    </div>
                  ) : <span className="text-xs text-zinc-600">{j.progress}%</span>}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {formatDistanceToNow(new Date(j.createdAt), { addSuffix: true, locale: vi })}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-sm">
                Không có job nào{queue || status ? ' khớp filter' : ''}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
