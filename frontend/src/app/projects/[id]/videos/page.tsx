'use client';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getVideos } from '@/lib/api';
import Link from 'next/link';
import { Plus, Video } from 'lucide-react';
import { statusLabel, statusColor, formatDuration, cn } from '@/lib/utils';

export default function VideosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['videos', projectId],
    queryFn: () => getVideos(projectId),
  });

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {videos.map((v: any) => (
          <Link
            key={v.id}
            href={`/projects/${projectId}/videos/${v.id}`}
            className="card overflow-hidden group hover:border-violet-500 transition-colors"
          >
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
        ))}
      </div>
    </div>
  );
}
