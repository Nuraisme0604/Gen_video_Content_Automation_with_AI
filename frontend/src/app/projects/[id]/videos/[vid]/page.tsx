'use client';
import { use, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVideo, getVideoPreviewUrl, regenerateScene } from '@/lib/api';
import { useJobSocket } from '@/hooks/useJobSocket';
import { statusLabel, statusColor, cn } from '@/lib/utils';
import { RefreshCw, AlertCircle, CheckCircle2, Clock, Volume2 } from 'lucide-react';

export default function VideoDetailPage({ params }: { params: Promise<{ id: string; vid: string }> }) {
  const { vid } = use(params);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [liveStage, setLiveStage] = useState('');

  const { data: video } = useQuery({ queryKey: ['video', vid], queryFn: () => getVideo(vid) });
  const { data: preview } = useQuery({ queryKey: ['preview', vid], queryFn: () => getVideoPreviewUrl(vid) });

  const regenerate = useMutation({
    mutationFn: regenerateScene,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video', vid] }),
  });

  useJobSocket(vid, useCallback((e) => {
    if (e.type === 'job:progress') {
      setProgress(p => ({ ...p, [e.data.jobId]: e.data.progress }));
      if (e.data.stage) setLiveStage(e.data.stage);
    }
    if (e.type === 'job:complete' || e.type === 'job:failed') {
      qc.invalidateQueries({ queryKey: ['video', vid] });
    }
    if (e.type === 'scene:rendered') {
      qc.invalidateQueries({ queryKey: ['video', vid] });
    }
  }, [vid, qc]));

  const scenes = video?.scenes ?? [];
  const globalProgress = Object.values(progress)[0];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">{video?.title || 'Video'}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
            <span>{scenes.length} cảnh</span>
            {video?.durationSec && <span>⏱ {Math.floor(video.durationSec / 60)}:{String(Math.round(video.durationSec % 60)).padStart(2, '0')}</span>}
            <span className={statusColor(video?.status)}>{statusLabel(video?.status)}</span>
          </div>
        </div>
      </div>

      {/* Global progress bar */}
      {globalProgress !== undefined && globalProgress < 100 && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-violet-400">{liveStage || 'Đang xử lý...'}</span>
            <span className="text-zinc-400">{globalProgress}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${globalProgress}%` }} />
          </div>
        </div>
      )}

      {/* Master video preview */}
      {preview?.url && (
        <div className="card p-4 mb-5">
          <video src={preview.url} controls className="w-full rounded-lg max-h-64 bg-black" />
        </div>
      )}

      {/* Scene list */}
      <div className="space-y-3">
        {scenes.map((s: any) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400">
                {s.sceneIndex + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-xs font-medium', statusColor(s.status))}>
                    {s.status === 'done' ? <CheckCircle2 size={12} className="inline mr-1" /> :
                     s.status === 'failed' ? <AlertCircle size={12} className="inline mr-1" /> :
                     s.status === 'rendering' ? <Clock size={12} className="inline mr-1" /> : null}
                    {statusLabel(s.status)}
                  </span>
                  {s.costUsd > 0 && <span className="text-xs text-zinc-600">${s.costUsd.toFixed(3)}</span>}
                </div>

                {s.voiceoverText && (
                  <p className="text-sm text-zinc-300 line-clamp-2 mb-1">
                    <Volume2 size={11} className="inline mr-1 text-zinc-500" />
                    {s.voiceoverText}
                  </p>
                )}

                {s.videoPrompt && (
                  <p className="text-xs text-zinc-500 font-mono line-clamp-1">{s.videoPrompt}</p>
                )}

                {s.status === 'failed' && s.errorMessage && (
                  <p className="text-xs text-rose-400 mt-1">{s.errorMessage}</p>
                )}
              </div>

              {(s.status === 'failed' || s.status === 'done') && (
                <button
                  onClick={() => regenerate.mutate(s.id)}
                  disabled={regenerate.isPending}
                  className="shrink-0 text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800"
                  title="Chạy lại cảnh này"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
