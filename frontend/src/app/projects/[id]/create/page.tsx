'use client';
import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createYoutubeSource, createManualSource, getProject } from '@/lib/api';
import { AlertTriangle, Youtube, PenLine } from 'lucide-react';
import { VoiceConfigPanel } from '@/components/video/VoiceConfigPanel';
import { CharacterRefSheet } from '@/components/video/CharacterRefSheet';
import { AiConfigPanel } from '@/components/video/AiConfigPanel';

const TABS = [
  { id: 'youtube', label: '📺 YouTube', icon: Youtube },
  { id: 'manual', label: '✍️ Tự nhập', icon: PenLine },
];

export default function CreatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const { data: project } = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId) });
  const [voiceConfig, setVoiceConfig] = useState<any>({});
  const [tab, setTab] = useState('youtube');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [script, setScript] = useState('');
  const [description, setDescription] = useState('');
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const ytMutation = useMutation({
    mutationFn: () => createYoutubeSource({ projectId, url }),
    onSuccess: () => router.push(`/projects/${projectId}/videos`),
  });

  const manualMutation = useMutation({
    mutationFn: () => createManualSource({ projectId, title, script, disclaimerAccepted }),
    onSuccess: () => router.push(`/projects/${projectId}/videos`),
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Tạo video mới</h1>
      </div>

      {/* Source input tabs */}
      <div className="card p-5 mb-4">
        <div className="text-xs font-medium text-zinc-400 mb-3 uppercase tracking-wider">Nguồn đầu vào</div>
        <div className="flex gap-2 mb-4">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'youtube' && (
          <div className="space-y-3">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="🔗 https://youtube.com/watch?v=..."
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500"
            />
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Bạn chịu trách nhiệm về bản quyền nội dung tham khảo. Chỉ dùng để học hỏi và tham khảo.</span>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={disclaimerAccepted}
                onChange={e => setDisclaimerAccepted(e.target.checked)}
                className="accent-violet-600"
              />
              Tôi hiểu và chịu trách nhiệm về bản quyền
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Mô tả thêm (tuỳ chọn): văn phong, đối tượng..."
              rows={3}
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 resize-none"
            />
          </div>
        )}

        {tab === 'manual' && (
          <div className="space-y-3">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Tiêu đề video..."
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500"
            />
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              placeholder="Dán kịch bản vào đây..."
              rows={8}
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 font-mono resize-none"
            />
          </div>
        )}
      </div>

      {/* AI Config — linked to active API keys */}
      <AiConfigPanel
        projectId={projectId}
        config={{ ...project, ...voiceConfig }}
        onChange={patch => setVoiceConfig((v: any) => ({ ...v, ...patch }))}
      />

      {/* Voice config */}
      <VoiceConfigPanel
        projectId={projectId}
        config={{ ...project, ...voiceConfig }}
        onChange={patch => setVoiceConfig((v: any) => ({ ...v, ...patch }))}
      />

      {/* Characters */}
      <CharacterRefSheet projectId={projectId} />

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button className="text-sm text-zinc-400 px-4 py-2 border border-zinc-700 rounded-lg hover:text-white">
          💾 Lưu nháp
        </button>
        <button
          onClick={() => tab === 'youtube' ? ytMutation.mutate() : manualMutation.mutate()}
          disabled={
            (tab === 'youtube' && (!url || !disclaimerAccepted)) ||
            (tab === 'manual' && (!title || !script)) ||
            ytMutation.isPending || manualMutation.isPending
          }
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg font-medium"
        >
          {ytMutation.isPending || manualMutation.isPending ? '⏳ Đang gửi...' : '▶ Sinh kịch bản & Tạo video'}
        </button>
      </div>
    </div>
  );
}
