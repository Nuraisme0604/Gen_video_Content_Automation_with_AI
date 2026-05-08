'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { User, Clapperboard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/lib/api';
import { NotificationBell } from './NotificationDrawer';
import { ThemeToggle } from './ThemeToggle';

export function TopBar() {
  const router = useRouter();
  const path = usePathname();
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

  // Detect current project from URL
  const m = path.match(/\/projects\/([^/]+)/);
  const currentId = m ? m[1] : '';

  const onSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    if (!newId) return;
    // If currently on a project sub-page, switch to same sub-page on new project
    const subMatch = path.match(/\/projects\/[^/]+(\/.*)?/);
    const subPath = subMatch?.[1] || '';
    router.push(`/projects/${newId}${subPath}`);
  };

  return (
    <header className="h-12 border-b border-[--border] bg-[--sidebar] flex items-center px-4 gap-4 shrink-0">
      <Link href="/projects" className="flex items-center gap-2 font-semibold text-violet-400">
        <Clapperboard size={18} />
        <span>AI Video Tool</span>
      </Link>

      <div className="flex items-center gap-1 ml-2 text-sm text-zinc-400">
        <span>Dự án</span>
        <select value={currentId} onChange={onSwitch}
          className="bg-transparent text-sm border-none outline-none cursor-pointer hover:text-white">
          <option value="">— chọn —</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="ml-auto flex items-center gap-3 text-zinc-400">
        <ThemeToggle />
        <NotificationBell />
        <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center">
          <User size={14} className="text-white" />
        </div>
      </div>
    </header>
  );
}
