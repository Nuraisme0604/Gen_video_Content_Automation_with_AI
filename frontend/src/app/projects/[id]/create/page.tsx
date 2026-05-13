'use client';
import { useState, use, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createYoutubeSource, createManualSource, getProject } from '@/lib/api';
import { AlertTriangle, Youtube, PenLine, Newspaper, BookOpen, Save, Check, Film, Clock, Ratio } from 'lucide-react';
import { toast } from 'sonner';
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

type AspectRatio = '16:9' | '9:16' | '1:1';
type FormState = {
  tab: string; url: string; title: string; script: string;
  description: string; articleUrl: string; disclaimerAccepted: boolean;
  sceneCount: number | '';
  targetDurationSec: number | '';
  aspectRatio: AspectRatio | '';
};

const EMPTY: FormState = {
  tab: 'youtube', url: '', title: '', script: '', description: '', articleUrl: '', disclaimerAccepted: false,
  sceneCount: '', targetDurationSec: '', aspectRatio: '',
};

const DURATION_PRESETS: { label: string; value: number }[] = [
  { label: '30 giây', value: 30 },
  { label: '1 phút',  value: 60 },
  { label: '2 phút',  value: 120 },
  { label: '3 phút',  value: 180 },
  { label: '5 phút',  value: 300 },
];

const ASPECT_OPTIONS: { label: string; value: AspectRatio; hint: string }[] = [
  { label: '16:9', value: '16:9', hint: 'Ngang (YouTube)' },
  { label: '9:16', value: '9:16', hint: 'Dọc (Shorts/TikTok)' },
  { label: '1:1',  value: '1:1',  hint: 'Vuông (IG/FB)' },
];

export default function CreatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const draftKey = `vca:draft:${projectId}`;
  const activeKey = `vca:active-source:${projectId}`;

  const { data: project } = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId) });
  const [voiceConfig, setVoiceConfig] = useState<any>({});
  const [form, setForm] = useState<FormState>(EMPTY);
  const [activeSourceId, setActiveSourceIdState] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  // Persist activeSourceId so navigating away + back resumes the in-progress pipeline
  const setActiveSourceId = (id: string | null) => {
    setActiveSourceIdState(id);
    if (id) localStorage.setItem(activeKey, id);
    else localStorage.removeItem(activeKey);
  };

  // Restore draft AND active source on mount
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try { setForm({ ...EMPTY, ...JSON.parse(saved) }); } catch {}
    }
    const active = localStorage.getItem(activeKey);
    if (active) setActiveSourceIdState(active);
  }, [draftKey, activeKey]);

  const saveDraft = () => {
    localStorage.setItem(draftKey, JSON.stringify(form));
    setDraftSavedAt(Date.now());
    setTimeout(() => setDraftSavedAt(null), 2000);
  };

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  const scrollToProgress = () => {
    setTimeout(() => progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  const errMsg = (e: any) => e?.response?.data?.message || e?.message || 'Lỗi không xác định';

  const videoCfg = () => ({
    sceneCount: form.sceneCount === '' ? undefined : Number(form.sceneCount),
    targetDurationSec: form.targetDurationSec === '' ? undefined : Number(form.targetDurationSec),
    aspectRatio: form.aspectRatio === '' ? undefined : form.aspectRatio as AspectRatio,
  });

  const ytMutation = useMutation({
    mutationFn: () => createYoutubeSource({ projectId, url: form.url, ...videoCfg() }),
    onSuccess: (data: any) => {
      setActiveSourceId(data.sourceId || data.id);
      localStorage.removeItem(draftKey);
      scrollToProgress();
      toast.success('Đã gửi yêu cầu', { description: 'Đang fetch transcript YouTube...' });
    },
    onError: (e: any) => toast.error('Gửi YouTube thất bại', { description: errMsg(e) }),
  });

  const manualMutation = useMutation({
    mutationFn: () => createManualSource({
      projectId,
      title: form.title || (form.articleUrl ? `Article: ${form.articleUrl.slice(0,40)}` : 'Untitled'),
      script: form.script,
      disclaimerAccepted: form.disclaimerAccepted || form.tab === 'story' || form.tab === 'manual',
      ...videoCfg(),
    }),
    onSuccess: (data: any) => {
      setActiveSourceId(data.id);
      localStorage.removeItem(draftKey);
      scrollToProgress();
      toast.success('Đã gửi yêu cầu', { description: 'Pipeline AI đang chạy...' });
    },
    onError: (e: any) => toast.error('Gửi script thất bại', { description: errMsg(e) }),
  });

  const submit = () => {
    if (form.tab === 'youtube') ytMutation.mutate();
    else manualMutation.mutate();
  };

  const videoCfgIncomplete =
    form.sceneCount === '' || Number(form.sceneCount) < 3 || Number(form.sceneCount) > 20 ||
    form.targetDurationSec === '' || Number(form.targetDurationSec) < 15 ||
    form.aspectRatio === '';

  const submitDisabled =
    (form.tab === 'youtube' && (!form.url || !form.disclaimerAccepted)) ||
    (form.tab === 'article' && !form.articleUrl) ||
    (form.tab === 'story' && !form.script) ||
    (form.tab === 'manual' && (!form.title || !form.script)) ||
    videoCfgIncomplete ||
    ytMutation.isPending || manualMutation.isPending;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Tạo video mới</h1>
      </div>

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

      {/* Video config — required for ALL tabs (số scenes / thời lượng / aspect ratio) */}
      <div className="card p-5 mb-4">
        <div className="text-xs font-medium text-zinc-400 mb-3 uppercase tracking-wider">
          Cấu hình video <span className="text-rose-400 normal-case">*</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1.5">
              <Film size={12} /> Số scenes (3–20)
            </label>
            <input
              type="number" min={3} max={20}
              value={form.sceneCount}
              onChange={e => set({ sceneCount: e.target.value === '' ? '' : Math.max(3, Math.min(20, parseInt(e.target.value) || 0)) })}
              placeholder="VD: 8"
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1.5">
              <Clock size={12} /> Tổng thời lượng
            </label>
            <select
              value={form.targetDurationSec}
              onChange={e => set({ targetDurationSec: e.target.value === '' ? '' : parseInt(e.target.value) })}
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500"
            >
              <option value="">— Chọn thời lượng —</option>
              {DURATION_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1.5">
              <Ratio size={12} /> Tỉ lệ khung hình
            </label>
            <div className="flex gap-1.5">
              {ASPECT_OPTIONS.map(a => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => set({ aspectRatio: a.value })}
                  title={a.hint}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    form.aspectRatio === a.value
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {form.sceneCount !== '' && form.targetDurationSec !== '' && Number(form.sceneCount) > 0 && (
          <div className="text-xs text-zinc-500 mt-3">
            ≈ {(Number(form.targetDurationSec) / Number(form.sceneCount)).toFixed(1)}s / scene
          </div>
        )}
      </div>

      <AiConfigPanel projectId={projectId} config={{ ...project, ...voiceConfig }}
        onChange={patch => setVoiceConfig((v: any) => ({ ...v, ...patch }))} />
      <VoiceConfigPanel projectId={projectId} config={{ ...project, ...voiceConfig }}
        onChange={patch => setVoiceConfig((v: any) => ({ ...v, ...patch }))} />
      <CharacterRefSheet projectId={projectId} />

      {/* Submit error display — must be visible BEFORE the button row */}
      {(ytMutation.error || manualMutation.error) && (
        <div className="mt-4 flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-400" />
          <div>
            <div className="font-medium">Không gửi được yêu cầu</div>
            <div className="text-xs text-rose-400/80 mt-1 break-all">
              {(() => {
                const e: any = ytMutation.error || manualMutation.error;
                return e?.response?.data?.message || e?.message || 'Lỗi không xác định';
              })()}
            </div>
            <div className="text-xs text-zinc-500 mt-2">
              💡 Kiểm tra: project có chọn model AI ở panel "Cấu hình AI" chưa? Có ít nhất 1 API key active chưa?
            </div>
          </div>
        </div>
      )}

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

      {/* Pipeline progress — appears RIGHT BELOW the button when submit succeeds */}
      {activeSourceId && (
        <div ref={progressRef} className="mt-6">
          <PipelineProgress projectId={projectId} sourceId={activeSourceId} onClose={() => setActiveSourceId(null)} />
        </div>
      )}
    </div>
  );
}
