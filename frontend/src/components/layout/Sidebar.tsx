'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Video, FolderOpen, Plug, Bell, Image, Settings, Key, ScrollText, LayoutDashboard, Loader2 } from 'lucide-react';
import { getSources } from '@/lib/api';
import { cn } from '@/lib/utils';

const ACTIVE_STATUSES = ['pending', 'queued', 'fetching', 'fetched', 'sent_to_n8n', 'rendering'];

function useProjectId() {
  const path = usePathname();
  const m = path.match(/\/projects\/([^/]+)/);
  // Filter out next.js segment paths and known non-id paths
  if (m && m[1] && !['create', 'videos', 'frames', '__next'].includes(m[1])) return m[1];
  if (typeof window !== 'undefined') {
    return localStorage.getItem('vca:lastProjectId') || null;
  }
  return null;
}

export function Sidebar() {
  const path = usePathname();
  const projectId = useProjectId();

  // Save current project to localStorage when on a project page
  if (typeof window !== 'undefined' && projectId) {
    localStorage.setItem('vca:lastProjectId', projectId);
  }

  // Poll active sources for current project — show count badge on "Quản lý video"
  const { data: sources = [] } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => projectId ? getSources(projectId) : Promise.resolve([]),
    enabled: !!projectId,
    refetchInterval: 5000,
  });
  const runningCount = (sources as any[]).filter(s => ACTIVE_STATUSES.includes(s.status)).length;

  const NAV = [
    { href: '/projects', icon: LayoutDashboard, label: 'Dự án', exact: true, requiresProject: false },
    { href: projectId ? `/projects/${projectId}/create` : '/projects', icon: Video, label: 'Tạo video', requiresProject: true },
    { href: projectId ? `/projects/${projectId}/videos` : '/projects', icon: FolderOpen, label: 'Quản lý video', requiresProject: true, badge: runningCount },
    { href: '/api-sources', icon: Plug, label: 'Nguồn API', requiresProject: false },
    { href: '/notifications', icon: Bell, label: 'Thông báo', requiresProject: false },
    { href: projectId ? `/projects/${projectId}/frames` : '/projects', icon: Image, label: 'Quản lý frame', requiresProject: true },
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
        {NAV.map(({ href, icon: Icon, label, exact, requiresProject, badge }: any) => {
          const disabled = requiresProject && !projectId;
          return (
            <Link key={`${href}-${label}`} href={href}
              title={disabled ? 'Chọn dự án trước' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                disabled ? 'text-zinc-600 cursor-not-allowed pointer-events-auto' :
                isActive(href, exact)
                  ? 'bg-violet-600/20 text-violet-300'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5',
              )}>
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {badge > 0 && !disabled && (
                <span className="flex items-center gap-1 text-[10px] bg-violet-600/30 text-violet-300 px-1.5 py-0.5 rounded-full">
                  <Loader2 size={9} className="animate-spin" />
                  {badge}
                </span>
              )}
              {disabled && <span className="text-[10px]">⚠️</span>}
            </Link>
          );
        })}
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
