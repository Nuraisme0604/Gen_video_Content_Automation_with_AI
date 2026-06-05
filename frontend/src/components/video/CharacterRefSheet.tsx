'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCharacters, createCharacter, updateCharacter, deleteCharacter, generateCharacterImage } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Check, X, Sparkles, Loader2 } from 'lucide-react';

type Props = { projectId: string };

const errMsg = (e: any) => e?.response?.data?.message || e?.message || 'Lỗi không xác định';

export function CharacterRefSheet({ projectId }: Props) {
  const qc = useQueryClient();
  const { data: chars = [] } = useQuery({
    queryKey: ['characters', projectId],
    queryFn: () => getCharacters(projectId),
  });

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  const add = useMutation({
    mutationFn: () => createCharacter({ projectId, ...form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['characters', projectId] }); setAdding(false); setForm({ name: '', description: '' }); },
  });

  const edit = useMutation({
    mutationFn: (id: string) => updateCharacter(id, editForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['characters', projectId] }); setEditing(null); },
  });

  const del = useMutation({
    mutationFn: deleteCharacter,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['characters', projectId] }),
  });

  const gen = useMutation({
    mutationFn: (id: string) => generateCharacterImage(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['characters', projectId] }); toast.success('Đã tạo ảnh nhân vật'); },
    onError: (e: any) => toast.error('Tạo ảnh thất bại', { description: errMsg(e) }),
  });

  return (
    <div className="card p-5 space-y-3">
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Nhân vật (Character Consistency)</div>
      <p className="text-xs text-zinc-600">DNA tự động inject vào mọi scene prompt khi tạo video.</p>

      {chars.map((c: any) => (
        <div key={c.id} className="flex items-start gap-3 bg-zinc-800/50 rounded-lg p-3">
          {c.imageUrl ? (
            <img src={c.imageUrl} alt={c.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-zinc-700 flex items-center justify-center text-lg shrink-0">
              {c.name.charAt(0).toUpperCase()}
            </div>
          )}
          {editing === c.id ? (
            <div className="flex-1 space-y-2">
              <input
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-zinc-800 rounded px-2 py-1 text-xs outline-none border border-zinc-600 focus:border-violet-500"
              />
              <textarea
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full bg-zinc-800 rounded px-2 py-1 text-xs outline-none border border-zinc-600 focus:border-violet-500 font-mono resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => edit.mutate(c.id)} className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>
                <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-white"><X size={14} /></button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-xs text-zinc-500 font-mono mt-0.5 line-clamp-2">{c.description}</div>
            </div>
          )}
          {editing !== c.id && (
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => gen.mutate(c.id)}
                disabled={gen.isPending && gen.variables === c.id}
                className="p-1.5 text-violet-300 hover:text-violet-200 rounded hover:bg-violet-500/15 disabled:opacity-50"
                title={c.imageUrl ? 'Tạo lại ảnh' : 'Generate ảnh'}
              >
                {gen.isPending && gen.variables === c.id
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Sparkles size={14} />}
              </button>
              <button onClick={() => { setEditing(c.id); setEditForm({ name: c.name, description: c.description }); }}
                className="p-1.5 text-zinc-300 hover:text-white rounded hover:bg-zinc-800" title="Sửa">
                <Pencil size={14} />
              </button>
              <button onClick={() => del.mutate(c.id)}
                className="p-1.5 text-rose-300 hover:text-rose-200 rounded hover:bg-rose-500/15" title="Xoá">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Tên nhân vật (VD: MAN)"
            className="w-full bg-zinc-800 rounded px-2 py-1.5 text-sm outline-none border border-zinc-600 focus:border-violet-500"
          />
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="DNA prompt: Caucasian male, 30s, dark beard, blue eyes..."
            rows={2}
            className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs font-mono outline-none border border-zinc-600 focus:border-violet-500 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={() => add.mutate()} disabled={!form.name || !form.description}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg">
              Thêm
            </button>
            <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white text-xs px-3 py-1.5">Huỷ</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white px-3 py-2 rounded-lg hover:bg-zinc-800 w-full">
          <Plus size={14} /> Thêm nhân vật
        </button>
      )}
    </div>
  );
}
