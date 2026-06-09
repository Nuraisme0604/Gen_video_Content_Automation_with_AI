'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getVideo, api, getVideoClips } from '@/lib/api';
import { CheckCircle2, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getSocket, subscribeToVideo, unsubscribeFromVideo } from '@/lib/socket';

type SceneStatus = 'queued' | 'rendering' | 'done' | 'failed';

const STAGES = [
  { key: 'queued',      label: 'Đang gửi yêu cầu' },
  { key: 'fetching',    label: 'Đang lấy nguồn' },
  { key: 'sent_to_n8n', label: 'Đang sinh kịch bản (Gemini)' },
  { key: 'rendering',   label: 'Đang dựng video & ảnh' },
  { key: 'rendered',    label: 'Hoàn thành' },
];

type Props = { projectId: string; sourceId: string; onClose: () => void };

export function PipelineProgress({ projectId, sourceId, onClose }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [notifiedTerminal, setNotifiedTerminal] = useState(false);
  const [sceneStates, setSceneStates] = useState<Record<number, SceneStatus>>({});
  const [selectedScene, setSelectedScene] = useState<number | null>(null);
  const renderStartRef = useRef<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Subscribe to scene-progress socket events (L.2/L.3)
  useEffect(() => {
    const socket = getSocket();
    subscribeToVideo(sourceId);
    const handler = (data: { videoId: string; sceneIndex: number; status: string }) => {
      if (data.videoId !== sourceId) return;
      if (data.status === 'rendering' && renderStartRef.current === null) {
        renderStartRef.current = Date.now();
      }
      setSceneStates(prev => ({ ...prev, [data.sceneIndex]: data.status as SceneStatus }));
    };
    socket.on('scene-progress', handler);
    return () => {
      unsubscribeFromVideo(sourceId);
      socket.off('scene-progress', handler);
    };
  }, [sourceId]);

  // Poll source status
  const { data: source } = useQuery({
    queryKey: ['source', sourceId],
    queryFn: async () => {
      const sources = await api.get(`/sources/project/${projectId}`).then(r => r.data);
      return sources.find((s: any) => s.id === sourceId) || null;
    },
    refetchInterval: 3000,
  });

  // Try to fetch the video — may not exist yet
  const { data: video } = useQuery({
    queryKey: ['video-poll', sourceId],
    queryFn: () => getVideo(sourceId).catch(() => null),
    refetchInterval: 4000,
  });

  // Fetch scene clips lazily when user clicks a done scene (L.4)
  const { data: clips } = useQuery({
    queryKey: ['video-clips', sourceId],
    queryFn: () => getVideoClips(sourceId),
    enabled: selectedScene !== null,
    staleTime: 30000,
  });
  const clipMap: Record<number, string | null> = {};
  (clips || []).forEach((c: any) => { clipMap[c.sceneIndex] = c.clipUrl; });

  // Determine current stage
  let currentStage = source?.status || 'queued';
  if (video) currentStage = video.status === 'done' || video.status === 'rendered' || video.status === 'uploaded' ? 'rendered' : 'rendering';
  if (video?.status === 'failed') currentStage = 'failed';

  const currentIdx = STAGES.findIndex(s => s.key === currentStage);
  const isFailed = currentStage === 'failed' || source?.status === 'failed';
  const isDone = currentStage === 'rendered';

  // N scenes: prefer source.metadata, fallback to max sceneIndex seen from socket events
  const eventMaxCount = Object.keys(sceneStates).length > 0
    ? Math.max(...Object.keys(sceneStates).map(Number)) + 1
    : 0;
  const sceneCount: number = source?.metadata?.sceneCount || eventMaxCount;
  const hasSceneGrid = sceneCount > 0;

  // ETA (L.5): avg wall-clock rate × scenes_remaining
  const doneCount = Object.values(sceneStates).filter(s => s === 'done' || s === 'failed').length;
  const elapsedSinceRender = renderStartRef.current ? Date.now() - renderStartRef.current : 0;
  const avgMs = doneCount > 0 ? elapsedSinceRender / doneCount : 0;
  const etaMs = avgMs > 0 && sceneCount > doneCount ? avgMs * (sceneCount - doneCount) : 0;
  const etaStr = etaMs > 0 ? (etaMs < 60000 ? `~${Math.round(etaMs / 1000)}s` : `~${Math.floor(etaMs / 60000)}m ${Math.round((etaMs % 60000) / 1000)}s`) : '';

  useEffect(() => {
    if ((isDone || isFailed) && !notifiedTerminal) {
      setNotifiedTerminal(true);
      try { localStorage.removeItem(`vca:active-source:${projectId}`); } catch {}
      if (isDone) toast.success('Video đã hoàn thành', { description: 'Bấm "Xem video" để xem.' });
      else if (isFailed) toast.error('Pipeline thất bại', { description: source?.errorMsg?.slice(0, 100) || 'Xem chi tiết bên dưới.' });
    }
  }, [isDone, isFailed, notifiedTerminal, projectId, source?.errorMsg]);

  return (
    <>
    <div className="card p-5 mb-4 border-violet-500/30">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            {isFailed
              ? <AlertCircle size={16} className="text-rose-400" />
              : isDone
              ? <CheckCircle2 size={16} className="text-emerald-400" />
              : <Loader2 size={16} className="text-violet-400 animate-spin" />}
            {isFailed ? 'Pipeline thất bại' : isDone ? 'Hoàn thành!' : 'Đang xử lý...'}
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            ⏱ {elapsed}s{etaStr && !isDone && !isFailed ? ` · ${etaStr} còn lại` : ''} · ID: <span className="font-mono">{sourceId.slice(0, 12)}</span>
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-white">×</button>
      </div>

      {/* Scene grid (L.3) — shown when sceneCount known */}
      {hasSceneGrid ? (
        <div>
          <p className="text-xs text-zinc-500 mb-2">{sceneCount} scene</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: sceneCount }, (_, i) => {
              const status: SceneStatus = sceneStates[i] || 'queued';
              return (
                <div
                  key={i}
                  title={`Scene ${i + 1}: ${status}`}
                  onClick={() => status === 'done' && setSelectedScene(i)}
                  className={cn(
                    'w-8 h-8 rounded flex items-center justify-center text-[11px] font-medium',
                    status === 'done'      && 'bg-emerald-500/20 text-emerald-400 cursor-pointer hover:ring-1 hover:ring-emerald-400/50',
                    status === 'failed'    && 'bg-rose-500/20 text-rose-400',
                    status === 'rendering' && 'bg-violet-500/20 text-violet-400',
                    status === 'queued'    && 'bg-zinc-800 text-zinc-500',
                  )}
                >
                  {status === 'done'      && <CheckCircle2 size={14} />}
                  {status === 'failed'    && <AlertCircle size={14} />}
                  {status === 'rendering' && <Loader2 size={14} className="animate-spin" />}
                  {status === 'queued'    && <span>{i + 1}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Fallback step bar when sceneCount not yet known */
        <div className="space-y-2">
          {STAGES.filter(s => s.key !== 'failed').map((stage, idx) => {
            const isActive = idx === currentIdx && !isDone;
            const isComplete = idx < currentIdx || isDone;
            return (
              <div key={stage.key} className="flex items-center gap-3 text-sm">
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                  isComplete ? 'bg-emerald-500/20 text-emerald-400' :
                  isActive   ? 'bg-violet-500/20 text-violet-400' :
                               'bg-zinc-800 text-zinc-600',
                )}>
                  {isComplete ? <CheckCircle2 size={12} /> : isActive ? <Loader2 size={12} className="animate-spin" /> : <span className="text-[10px]">{idx + 1}</span>}
                </div>
                <span className={cn(
                  isComplete ? 'text-emerald-300' : isActive ? 'text-violet-300' : 'text-zinc-500',
                )}>
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {isFailed && (
        <div className="mt-3 text-xs text-rose-400 bg-rose-500/10 rounded p-2">
          {source?.errorMsg || video?.errorMsg || 'Pipeline failed. Xem log /jobs để biết chi tiết.'}
        </div>
      )}

      {/* Action when done */}
      {isDone && video && (
        <Link href={`/projects/${projectId}/videos/${video.id}`}
          className="inline-flex items-center gap-2 mt-3 bg-violet-600 hover:bg-violet-700 text-white text-sm px-3 py-1.5 rounded-lg">
          Xem video <ExternalLink size={12} />
        </Link>
      )}

      {/* Hint while running */}
      {!isDone && !isFailed && elapsed > 30 && elapsed <= 120 && (
        <p className="mt-3 text-xs text-zinc-500">
          💡 Dựng video có thể mất 1-3 phút. Bạn có thể đóng panel này, pipeline vẫn chạy ở background.
        </p>
      )}

      {/* Stuck warning at 2+ min */}
      {!isDone && !isFailed && elapsed > 120 && (
        <div className="mt-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2.5 space-y-1">
          <div className="font-medium flex items-center gap-1.5">
            <AlertCircle size={12} /> Pipeline có vẻ chậm bất thường ({elapsed}s)
          </div>
          <div className="text-zinc-400">Nguyên nhân thường gặp:</div>
          <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
            <li>API quota hết (Gemini/OpenAI/Veo) — kiểm tra <a href="/api-sources" className="text-violet-400 hover:underline">Nguồn API</a></li>
            <li>Veo3 video gen mất 5-15 phút (bình thường nếu chọn Cao cấp)</li>
            <li>n8n workflow lỗi — xem <a href="/jobs" className="text-violet-400 hover:underline">Logs</a></li>
          </ul>
          <div className="pt-1 text-zinc-500">Hệ thống tự đánh dấu thất bại sau 3 phút nếu không có tiến triển.</div>
        </div>
      )}
    </div>

      {/* Scene clip preview modal (L.4) */}
      {selectedScene !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setSelectedScene(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-full max-w-2xl mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-zinc-200">Scene {selectedScene + 1}</span>
              <button onClick={() => setSelectedScene(null)} className="text-zinc-400 hover:text-white text-lg leading-none">×</button>
            </div>
            {clipMap[selectedScene] ? (
              <video src={clipMap[selectedScene]!} controls autoPlay className="w-full rounded" />
            ) : (
              <p className="text-sm text-zinc-500 py-8 text-center">Đang tải clip...</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
