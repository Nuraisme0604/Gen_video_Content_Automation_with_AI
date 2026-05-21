'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJobs, cancelJob } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { statusColor, statusLabel, cn } from '@/lib/utils';
import { Filter, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectGate } from '@/components/layout/ProjectGate';
import { useSelectedProject } from '@/hooks/useSelectedProject';

const QUEUES   = ['', 'render', 'transcript-fetch', 'notify'];
const STATUSES = ['', 'queued', 'active', 'completed', 'failed'];
const PAGE_SIZE = 20;

function JobsContent({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [queue,  setQueue]  = useState('');
  const [status, setStatus] = useState('');
  const [page,   setPage]   = useState(0);

  // Reset page when filters change (otherwise can land on empty page out of range)
  useEffect(() => { setPage(0); }, [queue, status]);

  const { data } = useQuery({
    queryKey: ['jobs', projectId, queue, status, page],
    queryFn: () => getJobs({
      projectId,
      queue:  queue  || undefined,
      status: status || undefined,
      limit:  PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    refetchInterval: 5000,
  });
  const jobs  = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cancel = useMutation({
    mutationFn: cancelJob,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Đã huỷ job');
    },
    onError: (e: any) => toast.error('Huỷ job thất bại', { description: e?.response?.data?.message || e?.message }),
  });

  const cancellable = (s: string) => s === 'active' || s === 'queued';
  const onCancel = (jobId: string) => {
    if (confirm('Huỷ job này? Worker đang chạy sẽ vẫn finish task hiện tại nhưng job bị mark failed.')) {
      cancel.mutate(jobId);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold">Job Queue</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Logs/queue thuộc dự án đang chọn</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* Mobile: card list. Desktop: table */}
      <div className="md:hidden space-y-2">
        {jobs.length === 0 && (
          <div className="card p-6 text-center text-sm text-zinc-500">
            Không có job nào{queue || status ? ' khớp filter' : ''}.
          </div>
        )}
        {jobs.map((j: any) => (
          <div key={j.id} className="card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] bg-zinc-800 px-2 py-0.5 rounded">{j.queue}</span>
              <div className="flex items-center gap-2">
                <span className={cn('text-xs font-medium', statusColor(j.status))}>{statusLabel(j.status)}</span>
                {cancellable(j.status) && (
                  <button onClick={() => onCancel(j.id)}
                    disabled={cancel.isPending}
                    className="p-1 text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 rounded disabled:opacity-50"
                    title="Huỷ job">
                    {cancel.isPending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  </button>
                )}
              </div>
            </div>
            <div className="font-mono text-[11px] text-zinc-400">
              {j.bullJobId || j.id.slice(0, 12)}
            </div>
            {cancellable(j.status) && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${j.progress}%` }} />
                </div>
                <span className="text-xs text-zinc-500">{j.progress}%</span>
              </div>
            )}
            <div className="text-[11px] text-zinc-500">
              {formatDistanceToNow(new Date(j.createdAt), { addSuffix: true, locale: vi })}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-zinc-500 border-b border-[--border]">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Queue</th>
              <th className="text-left px-4 py-3 font-medium">Job ID</th>
              <th className="text-left px-4 py-3 font-medium">Video</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Progress</th>
              <th className="text-left px-4 py-3 font-medium">Thời gian</th>
              <th className="text-right px-4 py-3 font-medium w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[--border]">
            {jobs.map((j: any) => (
              <tr key={j.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3"><span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded">{j.queue}</span></td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">{j.bullJobId || j.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-zinc-300 truncate max-w-[160px]">{j.videoId?.slice(0, 12) || '-'}</td>
                <td className="px-4 py-3"><span className={cn('text-xs font-medium', statusColor(j.status))}>{statusLabel(j.status)}</span></td>
                <td className="px-4 py-3">
                  {cancellable(j.status) ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${j.progress}%` }} />
                      </div>
                      <span className="text-xs text-zinc-500">{j.progress}%</span>
                    </div>
                  ) : <span className="text-xs text-zinc-600">{j.progress}%</span>}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {formatDistanceToNow(new Date(j.createdAt), { addSuffix: true, locale: vi })}
                </td>
                <td className="px-4 py-3 text-right">
                  {cancellable(j.status) && (
                    <button onClick={() => onCancel(j.id)}
                      disabled={cancel.isPending}
                      className="p-1.5 text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 rounded disabled:opacity-50"
                      title="Huỷ job">
                      {cancel.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500 text-sm">
                Không có job nào{queue || status ? ' khớp filter' : ''}
              </td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination footer (desktop) */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[--border] text-xs text-zinc-400">
            <span>Trang {page + 1} / {totalPages} · Tổng {total}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-2 py-1 rounded hover:bg-white/5 disabled:opacity-40">« Trước</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page + 1 >= totalPages}
                className="px-2 py-1 rounded hover:bg-white/5 disabled:opacity-40">Sau »</button>
            </div>
          </div>
        )}
      </div>

      {/* Pagination footer (mobile) */}
      {total > PAGE_SIZE && (
        <div className="md:hidden flex items-center justify-between mt-3 text-xs text-zinc-400">
          <span>Trang {page + 1} / {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 rounded card hover:bg-white/5 disabled:opacity-40">« Trước</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page + 1 >= totalPages}
              className="px-3 py-1.5 rounded card hover:bg-white/5 disabled:opacity-40">Sau »</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobsPage() {
  const { projectId } = useSelectedProject();
  return (
    <ProjectGate message="Logs/jobs hiện lọc theo dự án — chọn 1 dự án để xem.">
      {projectId && <JobsContent projectId={projectId} />}
    </ProjectGate>
  );
}
