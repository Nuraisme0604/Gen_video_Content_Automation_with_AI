'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { User, Clapperboard, Menu, FolderOpen } from 'lucide-react';
import { NotificationBell } from './NotificationDrawer';
import { ThemeToggle } from './ThemeToggle';
import { useSelectedProject } from '@/hooks/useSelectedProject';

type Props = {
  /** Toggle for the mobile sidebar drawer */
  onMenuClick?: () => void;
};

export function TopBar({ onMenuClick }: Props) {
  const router = useRouter();
  const path = usePathname();
  const { projectId, project, projects, setSelected } = useSelectedProject();

  const onSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    if (!newId) {
      setSelected(null);
      return;
    }
    setSelected(newId);
    // If currently on a project sub-page, switch to same sub-page on new project
    const subMatch = path.match(/\/projects\/[^/]+(\/.*)?/);
    const subPath = subMatch?.[1] || '';
    if (subMatch) router.push(`/projects/${newId}${subPath}`);
  };

  return (
    <header className="h-12 border-b border-[--border] bg-[--sidebar] flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shrink-0">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 -ml-1 rounded-md text-zinc-300 hover:text-white hover:bg-white/5"
        aria-label="Mở menu"
      >
        <Menu size={20} />
      </button>

      <Link href="/projects" className="flex items-center gap-2 font-semibold text-violet-400 shrink-0">
        <Clapperboard size={18} />
        <span className="hidden sm:inline">AI Video Tool</span>
      </Link>

      {/* Project selector — visible at all sizes; styled tag-like for visibility */}
      <div className="flex items-center gap-1.5 ml-1 sm:ml-2 min-w-0">
        <span className={`hidden md:inline-flex items-center gap-1 text-xs ${projectId ? 'text-zinc-400' : 'text-amber-400'}`}>
          <FolderOpen size={12} /> Dự án:
        </span>
        <select
          value={projectId || ''}
          onChange={onSwitch}
          title={project ? `Đang làm việc trong: ${project.name}` : 'Chưa chọn dự án'}
          className={`bg-transparent text-sm border rounded-md px-2 py-1 cursor-pointer outline-none transition-colors truncate max-w-[160px] sm:max-w-[220px] ${
            projectId
              ? 'border-violet-500/40 text-violet-300 hover:border-violet-500 focus:border-violet-500'
              : 'border-amber-500/40 text-amber-300 hover:border-amber-500 focus:border-amber-500'
          }`}
        >
          <option value="">— chưa chọn —</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3 text-zinc-400">
        <ThemeToggle />
        <NotificationBell />
        <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center">
          <User size={14} className="text-white" />
        </div>
      </div>
    </header>
  );
}
