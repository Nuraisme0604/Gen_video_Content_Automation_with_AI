'use client';
import { use, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVideo, getVideoPreviewUrl, getVideoClips, regenerateScene, updateVideo, deleteVideo } from '@/lib/api';
import { useJobSocket } from '@/hooks/useJobSocket';
import { statusLabel, statusColor, cn } from '@/lib/utils';
import { RefreshCw, AlertCircle, CheckCircle2, Clock, Volume2, Pencil, Save, Trash2, Download, X } from 'lucide-react';
import { toast } from 'sonner';

export default function VideoDetailPage({ params }: { params: Promise<{ id: string; vid: string }> }) {
  const { id: projectId, vid } = use(params);
  const qc = useQueryClient();
  const router = useRouter();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [liveStage, setLiveStage] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const { data: video } = useQuery({ queryKey: ['video', vid], queryFn: () => getVideo(vid) });
  const { data: preview } = useQuery({
    queryKey: ['preview', vid],
    queryFn: () => getVideoPreviewUrl(vid),
  });
  const { data: clips = [] } = useQuery({
    queryKey: ['clips', vid],
    queryFn: () => getVideoClips(vid),
    refetchInterval: video?.status === 'rendering' ? 5000 : false,
  });

  // Sync titleDraft with video.title once loaded
  useEffect(() => {
    if (video?.title && !editingTitle) setTitleDraft(video.title);
  }, [video?.title, editingTitle]);

  const errMsg = (e: any) => e?.response?.data?.message || e?.message || 'Lỗi không xác định';

  const regenerate = useMutation({
    mutationFn: regenerateScene,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['video', vid] }); toast.success('Đang chạy lại cảnh...'); },
    onError: (e: any) => toast.error('Chạy lại thất bại', { description: errMsg(e) }),
  });

  const saveTitle = useMutation({
    mutationFn: () => updateVideo(vid, { title: titleDraft.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['video', vid] });
      qc.invalidateQueries({ queryKey: ['videos', projectId] });
      setEditingTitle(false);
      toast.success('Đã lưu tiêu đề');
    },
    onError: (e: any) => toast.error('Lưu thất bại', { description: errMsg(e) }),
  });

  const removeVideo = useMutation({
    mutationFn: () => deleteVideo(vid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['videos', projectId] });
      toast.success('Đã xoá video');
      router.push(`/projects/${projectId}/videos`);
    },
    onError: (e: any) => toast.error('Xoá thất bại', { description: errMsg(e) }),
  });

  const handleDownload = () => {
    if (!preview?.url) { toast.error('Chưa có file video để tải'); return; }
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = `${(video?.title || 'video').replace(/[^a-zA-Z0-9-_]/g, '_')}.mp4`;
    a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
  };

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
      <div className="flex items-start justify-between mb-5 gap-4">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && titleDraft.trim()) saveTitle.mutate();
                  if (e.key === 'Escape') { setTitleDraft(video?.title || ''); setEditingTitle(false); }
                }}
                className="text-xl font-semibold bg-zinc-900 border border-violet-500 rounded-lg px-3 py-1.5 outline-none flex-1"
              />
              <button
                onClick={() => titleDraft.trim() && saveTitle.mutate()}
                disabled={!titleDraft.trim() || saveTitle.isPending}
                className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg"
              >
                <Save size={13} /> {saveTitle.isPending ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button
                onClick={() => { setTitleDraft(video?.title || ''); setEditingTitle(false); }}
                className="text-zinc-500 hover:text-white p-1.5 rounded hover:bg-zinc-800"
                title="Huỷ"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-xl font-semibold truncate">{video?.title || 'Video'}</h1>
              <button
                onClick={() => setEditingTitle(true)}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-violet-400 p-1 rounded hover:bg-zinc-800 transition-opacity"
                title="Đổi tên"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
            <span>{scenes.length} cảnh</span>
            {video?.durationSec && <span>⏱ {Math.floor(video.durationSec / 60)}:{String(Math.round(video.durationSec % 60)).padStart(2, '0')}</span>}
            <span className={statusColor(video?.status)}>{statusLabel(video?.status)}</span>
            {video?.totalCostUsd > 0 && <span>💰 ${video.totalCostUsd.toFixed(2)}</span>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownload}
            disabled={!preview?.url}
            className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg hover:border-violet-500 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed"
            title={preview?.url ? 'Tải file MP4' : 'Chưa có file để tải'}
          >
            <Download size={13} /> Tải xuống
          </button>
          <button
            onClick={() => {
              if (confirm(`Xoá video "${video?.title || 'Video'}"?\n\nThao tác này không thể hoàn tác — sẽ xoá master, scenes, và mọi file liên quan trong storage.`)) {
                removeVideo.mutate();
              }
            }}
            disabled={removeVideo.isPending}
            className="flex items-center gap-1.5 text-sm border border-rose-500/30 text-rose-300 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 disabled:opacity-50"
          >
            <Trash2 size={13} /> {removeVideo.isPending ? 'Đang xoá...' : 'Xoá'}
          </button>
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

      {/* Per-scene clips grid — always rendered for any video with scenes.
          User can download individual scene MP4s to edit/re-arrange in external tools. */}
      {(clips as any[]).length > 0 && (
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-medium text-sm">Clip từng cảnh ({(clips as any[]).length})</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Download từng cảnh riêng để edit/ghép bằng tool ngoài (CapCut, Premiere, ...).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {(clips as any[]).map((c: any) => (
              <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-violet-500 transition-colors">
                <div className="aspect-video bg-black relative">
                  {c.clipUrl ? (
                    <video src={c.clipUrl} controls preload="metadata"
                      className="w-full h-full object-cover" />
                  ) : c.imageUrl ? (
                    <img src={c.imageUrl} alt="" className="w-full h-full object-cover opacity-50" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-zinc-600">
                      {c.status === 'rendering' ? '⏳ Đang render' : c.status === 'failed' ? '❌ Lỗi' : 'Pending'}
                    </div>
                  )}
                </div>
                <div className="p-2 flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-400">#{String(c.sceneIndex + 1).padStart(3, '0')}</span>
                  {c.clipUrl ? (
                    <a href={c.clipUrl} download={`clip_${String(c.sceneIndex + 1).padStart(3, '0')}.mp4`}
                      className="flex items-center gap-1 text-violet-400 hover:text-violet-300"
                      title="Tải clip">
                      <Download size={12} />
                    </a>
                  ) : (
                    <span className="text-zinc-600">{c.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scene list with prompt + status — for editing/regenerating individual scenes */}
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
