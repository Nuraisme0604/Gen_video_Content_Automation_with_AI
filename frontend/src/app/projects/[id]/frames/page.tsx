'use client';
import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFrames, createFrame, deleteFrame, addFrameImage, removeFrameImage } from '@/lib/api';
import { Plus, Trash2, Image, X } from 'lucide-react';

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

  const create = useMutation({
    mutationFn: () => createFrame({ projectId, name: newName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['frames', projectId] }); setNewName(''); setShowAdd(false); },
  });

  const del = useMutation({
    mutationFn: deleteFrame,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frames', projectId] }),
  });

  const addImg = useMutation({
    mutationFn: ({ frameId, imageKey }: { frameId: string; imageKey: string }) =>
      addFrameImage(frameId, { imageKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frames', projectId] }),
  });

  const delImg = useMutation({
    mutationFn: removeFrameImage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frames', projectId] }),
  });

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
              {frame.images.map((img: any) => (
                <div key={img.id} className="relative group w-24 h-16 rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700">
                  {img.imageKey.startsWith('http') ? (
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
              ))}

              {/* Add image via URL */}
              <div className="w-24 h-16 rounded-lg border border-dashed border-zinc-600 flex items-center justify-center">
                <Plus size={18} className="text-zinc-600" />
              </div>
            </div>

            {/* Paste URL input */}
            <div className="flex gap-2">
              <input
                value={pasteUrl[frame.id] || ''}
                onChange={e => setPasteUrl(p => ({ ...p, [frame.id]: e.target.value }))}
                placeholder="Paste URL ảnh..."
                className="flex-1 bg-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none border border-zinc-700 focus:border-violet-500"
              />
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

            <p className="text-xs text-zinc-600 mt-3">
              Frame này là thư viện ảnh tham chiếu. Pipeline sẽ dùng ảnh trong frame làm initial frame cho Veo3.
            </p>
          </div>
        ))}
      </div>

      {/* New frame modal */}
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
