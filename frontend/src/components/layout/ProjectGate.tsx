'use client';
import Link from 'next/link';
import { FolderOpen, Plus, ChevronRight } from 'lucide-react';
import { useSelectedProject } from '@/hooks/useSelectedProject';

type Props = {
  children: React.ReactNode;
  /** Optional message tailored to the page asking for project selection */
  message?: string;
};

/** Wrap pages that need a project context. If none selected, shows a picker. */
export function ProjectGate({ children, message }: Props) {
  const { projectId, projects, isLoading, setSelected } = useSelectedProject();

  if (projectId) return <>{children}</>;
  if (isLoading) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-sm text-zinc-500">
        Đang tải dự án...
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12 sm:mt-16">
      <div className="card p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-500/15 text-violet-300 flex items-center justify-center">
            <FolderOpen size={22} />
          </div>
          <div>
            <h2 className="font-semibold text-base">Chọn một dự án</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {message || 'Tính năng này gắn theo dự án. Chọn 1 cái để tiếp tục.'}
            </p>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="text-sm text-zinc-400 space-y-3">
            <p>Chưa có dự án nào. Tạo mới trước.</p>
            <Link href="/projects"
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-4 py-2 rounded-lg">
              <Plus size={14} /> Tạo dự án
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Dự án sẵn có</div>
            <div className="space-y-1.5 max-h-80 overflow-y-auto -mx-1 px-1">
              {projects.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left bg-zinc-800/60 hover:bg-violet-600/20 hover:text-violet-200 border border-transparent hover:border-violet-500/40 transition-colors group"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      {p.niche} · {p.language}
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-zinc-500 group-hover:text-violet-300 shrink-0" />
                </button>
              ))}
            </div>
            <div className="pt-3 border-t border-[--border] flex items-center justify-between text-xs">
              <Link href="/projects" className="text-violet-400 hover:underline">
                Xem tất cả dự án →
              </Link>
              <Link href="/projects" className="text-zinc-500 hover:text-white inline-flex items-center gap-1">
                <Plus size={12} /> Tạo mới
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
