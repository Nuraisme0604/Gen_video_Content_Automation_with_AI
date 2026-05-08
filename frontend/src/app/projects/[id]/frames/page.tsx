'use client';
import { use, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFrames, createFrame, deleteFrame, addFrameImage, removeFrameImage } from '@/lib/api';
import { Plus, Trash2, Image, X, Upload, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

const MAX_UPLOAD_MB = 3;
const ACCEPT_IMAGE = 'image/png,image/jpeg,image/webp,image/gif';

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function FramesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const qc = useQueryClient();
  const { data: frames = [], isLoading } = useQuery({
    queryKey: ['frames', projectId],
    queryFn: () => getFrames(projectId),
  });

  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [pasteUrl, setPasteUrl] = useState<Record<string, string>>({});

  const errMsg = (e: any) => e?.response?.data?.message || e?.message || 'Lỗi không xác định';

  const create = useMutation({
    mutationFn: () => createFrame({ projectId, name: newName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['frames', projectId] }); setNewName(''); setShowAdd(false); toast.success('Đã tạo frame'); },
    onError: (e: any) => toast.error('Tạo frame thất bại', { description: errMsg(e) }),
  });

  const del = useMutation({
    mutationFn: deleteFrame,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['frames', projectId] }); toast.success('Đã xoá frame'); },
    onError: (e: any) => toast.error('Xoá frame thất bại', { description: errMsg(e) }),
  });

  const addImg = useMutation({
    mutationFn: ({ frameId, imageKey }: { frameId: string; imageKey: string }) =>
      addFrameImage(frameId, { imageKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frames', projectId] }),
    onError: (e: any) => toast.error('Thêm ảnh thất bại', { description: errMsg(e) }),
  });

  const delImg = useMutation({
    mutationFn: removeFrameImage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frames', projectId] }),
  });

  const handleFiles = async (frameId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast.error(`Bỏ qua "${file.name}"`, { description: 'Chỉ hỗ trợ file ảnh' });
        continue;
      }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        toast.error(`File "${file.name}" quá lớn`, { description: `Giới hạn ${MAX_UPLOAD_MB}MB` });
        continue;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        await addImg.mutateAsync({ frameId, imageKey: dataUrl });
      } catch (e: any) {
        toast.error(`Lỗi đọc "${file.name}"`, { description: e?.message });
      }
    }
    if (files.length > 0) toast.success(`Đã thêm ${files.length} ảnh`);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Quản lý frame</h1>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Tạo frame mới
        </button>
      </div>

      {isLoading && <p className="text-zinc-500 text-sm">Đang tải...</p>}

      <div className="space-y-6">
        {frames.map((frame: any) => (
          <div key={frame.id} className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium">{frame.name}</h2>
              <button onClick={() => { if (confirm('Xoá frame này?')) del.mutate(frame.id); }}
                className="text-zinc-500 hover:text-rose-400 p-1"><Trash2 size={14} /></button>
            </div>

            {/* Image grid */}
            <div className="flex flex-wrap gap-3 mb-4">
              {frame.images.map((img: any) => {
                const isImage = img.imageKey?.startsWith('http') || img.imageKey?.startsWith('data:image');
                return (
                  <div key={img.id} className="relative group w-24 h-16 rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700">
                    {isImage ? (
                      <img src={img.imageKey} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image size={16} className="text-zinc-600" />
                      </div>
                    )}
                    <button
                      onClick={() => delImg.mutate(img.id)}
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                );
              })}

              {/* Quick upload tile (click or drag-drop) */}
              <FrameUploadTile frameId={frame.id} onFiles={(files) => handleFiles(frame.id, files)} />
            </div>

            {/* Add image inputs — 2 ways */}
            <div className="flex flex-col sm:flex-row gap-2">
              <label className="flex-1 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 text-sm cursor-pointer border border-zinc-700">
                <Upload size={14} className="text-violet-400" />
                <span className="text-zinc-300">Upload ảnh từ máy</span>
                <span className="text-xs text-zinc-500 ml-auto">≤ {MAX_UPLOAD_MB}MB · PNG/JPG/WebP</span>
                <input type="file" accept={ACCEPT_IMAGE} multiple className="hidden"
                  onChange={(e) => { handleFiles(frame.id, e.target.files); e.currentTarget.value = ''; }} />
              </label>

              <div className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <LinkIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={pasteUrl[frame.id] || ''}
                    onChange={e => setPasteUrl(p => ({ ...p, [frame.id]: e.target.value }))}
                    placeholder="Hoặc paste URL ảnh..."
                    className="w-full bg-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-sm outline-none border border-zinc-700 focus:border-violet-500"
                  />
                </div>
                <button
                  onClick={() => {
                    const url = pasteUrl[frame.id];
                    if (url) { addImg.mutate({ frameId: frame.id, imageKey: url }); setPasteUrl(p => ({ ...p, [frame.id]: '' })); }
                  }}
                  disabled={!pasteUrl[frame.id]}
                  className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-sm px-3 py-1.5 rounded-lg"
                >
                  Thêm
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-600 mt-3">
              💡 Frame này là thư viện ảnh tham chiếu. Pipeline sẽ dùng ảnh trong frame làm initial frame cho Veo3.
            </p>
          </div>
        ))}
      </div>

      {/* New frame modal — render after */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-sm">
            <h2 className="font-semibold mb-4">Tạo frame mới</h2>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Tên frame (VD: Intro nền xanh)..."
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-sm text-zinc-400 px-3 py-1.5 hover:text-white">Huỷ</button>
              <button onClick={() => create.mutate()} disabled={!newName.trim() || create.isPending}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg">
                Tạo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FrameUploadTile({ frameId, onFiles }: { frameId: string; onFiles: (f: FileList | null) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
      className={`w-24 h-16 rounded-lg border border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
        drag ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-600 hover:border-violet-500'
      }`}
      title="Click hoặc kéo thả ảnh"
    >
      <Upload size={14} className={drag ? 'text-violet-400' : 'text-zinc-600'} />
      <span className="text-[9px] text-zinc-500 mt-0.5">Kéo / click</span>
      <input ref={inputRef} type="file" accept={ACCEPT_IMAGE} multiple className="hidden"
        onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = ''; }} />
    </div>
  );
}
