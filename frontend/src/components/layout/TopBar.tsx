'use client';
import Link from 'next/link';
import { User, Clapperboard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/lib/api';
import { NotificationBell } from './NotificationDrawer';
import { ThemeToggle } from './ThemeToggle';

export function TopBar() {
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

  return (
    <header className="h-12 border-b border-[--border] bg-[--sidebar] flex items-center px-4 gap-4 shrink-0">
      <div className="flex items-center gap-2 font-semibold text-violet-400">
        <Clapperboard size={18} />
        <span>AI Video Tool</span>
      </div>

      <div className="flex items-center gap-1 ml-2 text-sm text-zinc-400">
        <span>Dự án</span>
        <select className="bg-transparent text-white text-sm border-none outline-none cursor-pointer">
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
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
