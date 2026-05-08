'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, createProject } from '@/lib/api';
import { useState } from 'react';
import { Plus, FolderOpen } from 'lucide-react';
import Link from 'next/link';

export default function ProjectsPage() {
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setName(''); setOpen(false); },
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Dự án</h1>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} /> Tạo dự án
        </button>
      </div>

      {isLoading && <p className="text-zinc-500 text-sm">Đang tải...</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p: any) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="card p-4 hover:border-violet-500 transition-colors group">
            <div className="flex items-start gap-3">
              <FolderOpen size={20} className="text-violet-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium group-hover:text-violet-300 transition-colors">{p.name}</div>
                <div className="text-xs text-zinc-500 mt-1">{p.niche} · {p.language}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-sm">
            <h2 className="font-semibold mb-4">Tạo dự án mới</h2>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tên dự án..."
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm outline-none border border-zinc-700 focus:border-violet-500 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="text-sm text-zinc-400 px-3 py-1.5 hover:text-white">Huỷ</button>
              <button
                onClick={() => create.mutate({ name })}
                disabled={!name.trim() || create.isPending}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg"
              >
                {create.isPending ? 'Đang tạo...' : 'Tạo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
