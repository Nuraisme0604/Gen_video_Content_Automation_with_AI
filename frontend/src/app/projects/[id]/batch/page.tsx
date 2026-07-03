'use client';
import { use, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { createBatch, getVideos } from '@/lib/api';
import { statusLabel, statusColor, formatDuration } from '@/lib/utils';
import { Loader2, Layers } from 'lucide-react';
import { toast } from 'sonner';

export default function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [titlesText, setTitlesText] = useState('');
  const [sceneCount, setSceneCount] = useState(3);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [expectedCount, setExpectedCount] = useState(0);

  const errMsg = (e: any) => e?.response?.data?.message || e?.message || 'Lỗi không xác định';

  const submit = useMutation({
    mutationFn: () => {
      const titles = titlesText.split('\n').map(t => t.trim()).filter(Boolean);
      return createBatch({ projectId, titles, sceneCount });
    },
    onSuccess: (res) => {
      setBatchId(res.batchId);
      setExpectedCount(res.count);
      toast.success(`Đã xếp hàng ${res.count} video — chạy tuần tự`);
    },
    onError: (e: any) => toast.error('Gửi batch thất bại', { description: errMsg(e) }),
  });

  const { data: videos = [] } = useQuery({
    queryKey: ['videos', projectId, batchId],
    queryFn: () => getVideos(projectId, batchId!),
    enabled: !!batchId,
    refetchInterval: 5000,
  });

  const pendingCount = Math.max(0, expectedCount - videos.length);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
        <Layers size={18} className="text-violet-400" /> Tạo hàng loạt
      </h1>
      <p className="text-sm text-zinc-500 mb-5">
        Nhập mỗi tiêu đề 1 dòng — hệ thống tạo video lần lượt (không song song) để tránh vượt rate-limit ảnh/voice.
      </p>

      <div className="card p-5 mb-5 space-y-3">
        <textarea
          value={titlesText}
          onChange={e => setTitlesText(e.target.value)}
          rows={8}
          placeholder={'Tại sao mèo hay liếm lông?\nVì sao chim cánh cụt không biết bay?\n...'}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 resize-y font-mono"
        />
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-500">Số cảnh mỗi video</label>
          <input
            type="number" min={3} max={20} value={sceneCount}
            onChange={e => setSceneCount(parseInt(e.target.value, 10) || 3)}
            className="w-20 bg-zinc-800 rounded-lg px-2 py-1 text-sm outline-none border border-zinc-700 focus:border-violet-500"
          />
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !titlesText.trim()}
            className="ml-auto flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg"
          >
            {submit.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Chạy batch
          </button>
        </div>
      </div>

      {batchId && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">Tiến độ batch ({videos.length}/{expectedCount})</h3>
            <span className="text-xs font-mono text-zinc-600">{batchId}</span>
          </div>
          <div className="space-y-2">
            {videos.map((v: any) => (
              <Link key={v.id} href={`/projects/${projectId}/videos/${v.id}`}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-violet-500 transition-colors">
                <span className={statusColor(v.status)}>{statusLabel(v.status)}</span>
                <span className="flex-1 min-w-0 truncate text-sm text-zinc-200">{v.title || v.id}</span>
                {v.durationSec ? <span className="text-xs text-zinc-500">{formatDuration(v.durationSec)}</span> : null}
              </Link>
            ))}
            {Array.from({ length: pendingCount }, (_, i) => (
              <div key={`pending-${i}`} className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-zinc-600">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-sm">Đang chờ tới lượt...</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
