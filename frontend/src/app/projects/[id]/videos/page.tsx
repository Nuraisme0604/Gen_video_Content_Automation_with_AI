'use client';
import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVideos, deleteVideo, getSources } from '@/lib/api';
import Link from 'next/link';
import { Plus, Video, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { statusLabel, statusColor, formatDuration, cn } from '@/lib/utils';
import { toast } from 'sonner';

const ACTIVE_SOURCE_STATUSES = ['pending', 'queued', 'fetching', 'fetched', 'sent_to_n8n', 'rendering'];

export default function VideosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const qc = useQueryClient();
  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['videos', projectId],
    queryFn: () => getVideos(projectId),
    refetchInterval: 5000,
  });
  const { data: sources = [] } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => getSources(projectId),
    refetchInterval: 3000,
  });

  const activeSources = (sources as any[]).filter(s => ACTIVE_SOURCE_STATUSES.includes(s.status));
  const failedSources = (sources as any[]).filter(s => s.status === 'failed').slice(0, 3);

  const errMsg = (e: any) => e?.response?.data?.message || e?.message || 'Lỗi không xác định';
  const remove = useMutation({
    mutationFn: deleteVideo,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['videos', projectId] }); toast.success('Đã xoá video'); },
    onError: (e: any) => toast.error('Xoá thất bại', { description: errMsg(e) }),
  });

  const onDelete = (e: React.MouseEvent, v: any) => {
    e.preventDefault(); e.stopPropagation();
    if (confirm(`Xoá video "${v.title || 'Video'}"?\n\nKhông thể hoàn tác.`)) {
      remove.mutate(v.id);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Video đã tạo</h1>
        <Link
          href={`/projects/${projectId}/create`}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-3 py-1.5 rounded-lg"
        >
          <Plus size={14} /> Tạo mới
        </Link>
      </div>

      {isLoading && <p className="text-zinc-500 text-sm">Đang tải...</p>}

      {/* Active pipelines — show as banner above video grid so user always sees them */}
      {activeSources.length > 0 && (
        <div className="mb-5 space-y-2">
          <div className="text-xs font-medium text-violet-400 flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            ĐANG GEN ({activeSources.length})
          </div>
          {activeSources.map((s: any) => {
            const stageLabel: Record<string, string> = {
              pending:     '⏳ Đang xếp hàng',
              queued:      '⏳ Đang chờ retry',
              fetching:    '📥 Đang lấy nguồn',
              fetched:     '✓ Đã có nguồn',
              sent_to_n8n: '📝 Đang sinh kịch bản (n8n + Gemini)',
              rendering:   '🎬 Đang dựng video',
            };
            return (
              <Link key={s.id} href={`/projects/${projectId}/create`}
                className="card p-3 flex items-center gap-3 hover:border-violet-500 transition-colors">
                <Loader2 size={16} className="text-violet-400 animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">
                    {s.sourceUrl || s.title || `Source ${s.id.slice(0, 8)}`}
                  </div>
                  <div className="text-xs text-violet-300 mt-0.5">{stageLabel[s.status] || s.status}</div>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">{s.id.slice(0, 8)}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Recent failures */}
      {failedSources.length > 0 && (
        <div className="mb-5 space-y-2">
          <div className="text-xs font-medium text-rose-400 flex items-center gap-1.5">
            <AlertCircle size={12} /> THẤT BẠI GẦN ĐÂY
          </div>
          {failedSources.map((s: any) => (
            <div key={s.id} className="card p-3 flex items-center gap-3 border-rose-500/20">
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">{s.sourceUrl || s.title || `Source ${s.id.slice(0, 8)}`}</div>
                {s.errorMsg && <div className="text-xs text-rose-300 mt-0.5 truncate">{s.errorMsg}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && videos.length === 0 && activeSources.length === 0 && (
        <div className="text-center py-12 text-zinc-500 text-sm">
          Chưa có video nào. <Link href={`/projects/${projectId}/create`} className="text-violet-400 hover:underline">Tạo video đầu tiên</Link>.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {videos.map((v: any) => (
          <div
            key={v.id}
            className="card overflow-hidden group hover:border-violet-500 transition-colors relative"
          >
            <Link href={`/projects/${projectId}/videos/${v.id}`} className="block">
              <div className="aspect-video bg-zinc-800 flex items-center justify-center relative">
                <Video size={24} className="text-zinc-600" />
                <div className="absolute bottom-1 right-1">
                  <span className={cn('pill-draft', statusColor(v.status) === 'text-emerald-500' ? 'pill-done' : '')}>
                    {statusLabel(v.status)}
                  </span>
                </div>
              </div>
              <div className="p-3">
                <div className="text-sm font-medium truncate group-hover:text-violet-300">{v.title || 'Video'}</div>
                <div className="flex items-center justify-between mt-1 text-xs text-zinc-500">
                  <span>{v._count?.scenes ?? 0} cảnh</span>
                  {v.durationSec && <span>{formatDuration(v.durationSec)}</span>}
                  {v.totalCostUsd > 0 && <span>${v.totalCostUsd.toFixed(2)}</span>}
                </div>
              </div>
            </Link>

            {/* Hover delete button — overlay on top right */}
            <button
              onClick={(e) => onDelete(e, v)}
              disabled={remove.isPending}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 z-10"
              title="Xoá video"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
