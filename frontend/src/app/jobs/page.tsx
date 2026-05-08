'use client';
import { useQuery } from '@tanstack/react-query';
import { getJobs } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { statusColor, statusLabel, cn } from '@/lib/utils';

export default function JobsPage() {
  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => getJobs(),
    refetchInterval: 5000,
  });

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Job Queue</h1>

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
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded">{j.queue}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{j.bullJobId || j.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-zinc-400 truncate max-w-[160px]">{j.videoId?.slice(0, 12) || '-'}</td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs font-medium', statusColor(j.status))}>{statusLabel(j.status)}</span>
                </td>
                <td className="px-4 py-3">
                  {j.status === 'active' || j.status === 'queued' ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${j.progress}%` }} />
                      </div>
                      <span className="text-xs text-zinc-500">{j.progress}%</span>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-600">{j.progress}%</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {formatDistanceToNow(new Date(j.createdAt), { addSuffix: true, locale: vi })}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-sm">Chưa có job nào</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
