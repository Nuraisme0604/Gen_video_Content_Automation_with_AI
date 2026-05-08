'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Video, FolderOpen, Plug, Bell, Image, Settings, Key, ScrollText, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';

function useProjectId() {
  const path = usePathname();
  const m = path.match(/\/projects\/([^/]+)/);
  return m ? m[1] : null;
}

export function Sidebar() {
  const path = usePathname();
  const projectId = useProjectId();

  const projectBase = projectId ? `/projects/${projectId}` : '/projects';

  const NAV = [
    { href: '/projects', icon: LayoutDashboard, label: 'Dự án', exact: true },
    { href: `${projectBase}/create`, icon: Video, label: 'Tạo video' },
    { href: `${projectBase}/videos`, icon: FolderOpen, label: 'Quản lý video' },
    { href: '/api-sources', icon: Plug, label: 'Nguồn API' },
    { href: '/notifications', icon: Bell, label: 'Thông báo' },
    { href: `${projectBase}/frames`, icon: Image, label: 'Quản lý frame' },
  ];

  const BOTTOM = [
    { href: '/settings', icon: Settings, label: 'Cài đặt' },
    { href: '/api-sources', icon: Key, label: 'API Keys' },
    { href: '/jobs', icon: ScrollText, label: 'Logs' },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return path === href || path === '/';
    return path.startsWith(href) && href !== '/projects';
  };

  return (
    <aside className="sidebar w-[240px] shrink-0 flex flex-col py-4 overflow-y-auto">
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label, exact }) => (
          <Link key={`${href}-${label}`} href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              isActive(href, exact)
                ? 'bg-violet-600/20 text-violet-300'
                : 'text-zinc-400 hover:text-white hover:bg-white/5',
            )}>
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-2 pt-2 border-t border-[--border] space-y-0.5 mt-2">
        {BOTTOM.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-white/5 transition-colors">
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
