'use client';
import { useState, use, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createYoutubeSource, createManualSource, getProject } from '@/lib/api';
import { AlertTriangle, Youtube, PenLine, Newspaper, BookOpen, Save, Check } from 'lucide-react';
import { VoiceConfigPanel } from '@/components/video/VoiceConfigPanel';
import { CharacterRefSheet } from '@/components/video/CharacterRefSheet';
import { AiConfigPanel } from '@/components/video/AiConfigPanel';
import { PipelineProgress } from '@/components/video/PipelineProgress';

const TABS = [
  { id: 'youtube', label: '📺 YouTube', icon: Youtube },
  { id: 'article', label: '📰 Báo',     icon: Newspaper },
  { id: 'story',   label: '📖 Truyện',  icon: BookOpen },
  { id: 'manual',  label: '✍️ Tự nhập', icon: PenLine },
];

type FormState = {
  tab: string; url: string; title: string; script: string;
  description: string; articleUrl: string; disclaimerAccepted: boolean;
};

const EMPTY: FormState = { tab: 'youtube', url: '', title: '', script: '', description: '', articleUrl: '', disclaimerAccepted: false };

export default function CreatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const draftKey = `vca:draft:${projectId}`;

  const { data: project } = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId) });
  const [voiceConfig, setVoiceConfig] = useState<any>({});
  const [form, setForm] = useState<FormState>(EMPTY);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  // Restore draft from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try { setForm({ ...EMPTY, ...JSON.parse(saved) }); } catch {}
    }
  }, [draftKey]);

  const saveDraft = () => {
    localStorage.setItem(draftKey, JSON.stringify(form));
    setDraftSavedAt(Date.now());
    setTimeout(() => setDraftSavedAt(null), 2000);
  };

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  const ytMutation = useMutation({
    mutationFn: () => createYoutubeSource({ projectId, url: form.url }),
    onSuccess: (data: any) => { setActiveSourceId(data.sourceId || data.id); localStorage.removeItem(draftKey); },
  });

  const manualMutation = useMutation({
    mutationFn: () => createManualSource({
      projectId,
      title: form.title || (form.articleUrl ? `Article: ${form.articleUrl.slice(0,40)}` : 'Untitled'),
      script: form.script,
      disclaimerAccepted: form.disclaimerAccepted || form.tab === 'story' || form.tab === 'manual',
    }),
    onSuccess: (data: any) => { setActiveSourceId(data.id); localStorage.removeItem(draftKey); },
  });

  const submit = () => {
    if (form.tab === 'youtube') ytMutation.mutate();
    else manualMutation.mutate();
  };

  const submitDisabled =
    (form.tab === 'youtube' && (!form.url || !form.disclaimerAccepted)) ||
    (form.tab === 'article' && !form.articleUrl) ||
    (form.tab === 'story' && !form.script) ||
    (form.tab === 'manual' && (!form.title || !form.script)) ||
    ytMutation.isPending || manualMutation.isPending;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Tạo video mới</h1>
      </div>

      {activeSourceId && (
        <PipelineProgress projectId={projectId} sourceId={activeSourceId} onClose={() => setActiveSourceId(null)} />
      )}

      {/* Source input tabs */}
      <div className="card p-5 mb-4">
        <div className="text-xs font-medium text-zinc-400 mb-3 uppercase tracking-wider">Nguồn đầu vào</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => set({ tab: t.id })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                form.tab === t.id ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {form.tab === 'youtube' && (
          <div className="space-y-3">
            <input value={form.url} onChange={e => set({ url: e.target.value })}
              placeholder="🔗 https://youtube.com/watch?v=..."
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500" />
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Bạn chịu trách nhiệm về bản quyền nội dung tham khảo.</span>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.disclaimerAccepted}
                onChange={e => set({ disclaimerAccepted: e.target.checked })} className="accent-violet-600" />
              Tôi hiểu và chịu trách nhiệm về bản quyền
            </label>
            <textarea value={form.description} onChange={e => set({ description: e.target.value })}
              placeholder="Mô tả thêm (tuỳ chọn): văn phong, đối tượng..." rows={3}
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 resize-none" />
          </div>
        )}

        {form.tab === 'article' && (
          <div className="space-y-3">
            <input value={form.articleUrl} onChange={e => set({ articleUrl: e.target.value })}
              placeholder="🔗 URL bài báo (VD: https://vnexpress.net/...)"
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500" />
            <textarea value={form.script} onChange={e => set({ script: e.target.value })}
              placeholder="Hoặc dán nội dung bài báo trực tiếp vào đây..." rows={6}
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 resize-none" />
            <div className="text-xs text-zinc-500">💡 V1: dán nội dung trực tiếp. V2 sẽ auto-fetch từ URL.</div>
          </div>
        )}

        {form.tab === 'story' && (
          <div className="space-y-3">
            <input value={form.title} onChange={e => set({ title: e.target.value })}
              placeholder="Tên truyện..."
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500" />
            <textarea value={form.script} onChange={e => set({ script: e.target.value })}
              placeholder="Dán hoặc upload truyện ngắn..." rows={10}
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 font-mono resize-none" />
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input type="file" accept=".txt,.md" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) set({ script: await f.text() }); }} />
              <span className="bg-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-700">📁 Upload file .txt / .md</span>
            </label>
          </div>
        )}

        {form.tab === 'manual' && (
          <div className="space-y-3">
            <input value={form.title} onChange={e => set({ title: e.target.value })}
              placeholder="Tiêu đề video..."
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500" />
            <textarea value={form.script} onChange={e => set({ script: e.target.value })}
              placeholder="Dán kịch bản vào đây..." rows={8}
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 font-mono resize-none" />
          </div>
        )}
      </div>

      <AiConfigPanel projectId={projectId} config={{ ...project, ...voiceConfig }}
        onChange={patch => setVoiceConfig((v: any) => ({ ...v, ...patch }))} />
      <VoiceConfigPanel projectId={projectId} config={{ ...project, ...voiceConfig }}
        onChange={patch => setVoiceConfig((v: any) => ({ ...v, ...patch }))} />
      <CharacterRefSheet projectId={projectId} />

      <div className="flex gap-3 justify-end mt-4">
        <button onClick={saveDraft}
          className="flex items-center gap-2 text-sm text-zinc-400 px-4 py-2 border border-zinc-700 rounded-lg hover:text-white">
          {draftSavedAt ? <><Check size={14} className="text-emerald-400" /> Đã lưu</> : <><Save size={14} /> Lưu nháp</>}
        </button>
        <button onClick={submit} disabled={submitDisabled}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg font-medium">
          {ytMutation.isPending || manualMutation.isPending ? '⏳ Đang gửi...' : '▶ Sinh kịch bản & Tạo video'}
        </button>
      </div>
    </div>
  );
}
