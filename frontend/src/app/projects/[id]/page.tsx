'use client';
import { useQuery } from '@tanstack/react-query';
import { getProject, getVideos, getJobs } from '@/lib/api';
import { use } from 'react';
import Link from 'next/link';
import { Plus, Video, Clock, DollarSign } from 'lucide-react';
import { statusLabel, statusColor, formatDuration, cn } from '@/lib/utils';

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project } = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) });
  const { data: videos = [] } = useQuery({ queryKey: ['videos', id], queryFn: () => getVideos(id) });
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs', id], queryFn: () => getJobs() });

  const running = jobs.filter((j: any) => j.status === 'active').length;
  const totalCost = videos.reduce((acc: number, v: any) => acc + (v.totalCostUsd || 0), 0);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">{project?.name || '...'}</h1>
          <p className="text-sm text-zinc-500">{project?.niche} · {project?.language}</p>
        </div>
        <Link
          href={`/projects/${id}/create`}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-3 py-1.5 rounded-lg"
        >
          <Plus size={14} /> Tạo video mới
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { icon: Video, label: 'Tổng video', value: videos.length },
          { icon: Clock, label: 'Đang chạy', value: running },
          { icon: DollarSign, label: 'Chi phí', value: `$${totalCost.toFixed(2)}` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <Icon size={18} className="text-violet-400 shrink-0" />
            <div>
              <div className="text-xs text-zinc-500">{label}</div>
              <div className="font-semibold text-lg">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {videos.map((v: any) => (
          <Link key={v.id} href={`/projects/${id}/videos/${v.id}`} className="card overflow-hidden group hover:border-violet-500 transition-colors">
            <div className="aspect-video bg-zinc-800 flex items-center justify-center">
              <Video size={24} className="text-zinc-600" />
            </div>
            <div className="p-3">
              <div className="text-sm font-medium truncate group-hover:text-violet-300">{v.title || 'Video'}</div>
              <div className="flex items-center justify-between mt-1">
                <span className={cn('text-xs', statusColor(v.status))}>{statusLabel(v.status)}</span>
                {v.durationSec && <span className="text-xs text-zinc-500">{formatDuration(v.durationSec)}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
