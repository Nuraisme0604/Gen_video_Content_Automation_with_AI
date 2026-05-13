'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Video, FolderOpen, Plug, Bell, Image, Settings, Key, ScrollText, LayoutDashboard, Loader2, AlertTriangle, X } from 'lucide-react';
import { getSources } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSelectedProject } from '@/hooks/useSelectedProject';

const ACTIVE_STATUSES = ['pending', 'queued', 'fetching', 'fetched', 'sent_to_n8n', 'rendering'];

type Props = {
  /** When true, render as an overlay drawer (mobile). */
  mobileOpen?: boolean;
  onClose?: () => void;
};

export function Sidebar({ mobileOpen = false, onClose }: Props) {
  const path = usePathname();
  const { projectId } = useSelectedProject();

  // Poll active sources for current project — show count badge on "Quản lý video"
  const { data: sources = [] } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => projectId ? getSources(projectId) : Promise.resolve([]),
    enabled: !!projectId,
    refetchInterval: 5000,
  });
  const runningCount = (sources as any[]).filter(s => ACTIVE_STATUSES.includes(s.status)).length;

  const NAV = [
    { href: '/projects',                                            icon: LayoutDashboard, label: 'Dự án',         exact: true,  requiresProject: false },
    { href: projectId ? `/projects/${projectId}/create`  : '/projects', icon: Video,        label: 'Tạo video',     requiresProject: true },
    { href: projectId ? `/projects/${projectId}/videos`  : '/projects', icon: FolderOpen,   label: 'Quản lý video', requiresProject: true, badge: runningCount },
    { href: '/api-sources',                                         icon: Plug,            label: 'Nguồn API',     requiresProject: false },
    { href: '/notifications',                                       icon: Bell,            label: 'Thông báo',     requiresProject: false },
    { href: projectId ? `/projects/${projectId}/frames`  : '/projects', icon: Image,        label: 'Quản lý frame', requiresProject: true },
  ];

  const BOTTOM = [
    { href: '/settings',    icon: Settings,    label: 'Cài đặt',  requiresProject: false },
    { href: '/api-sources', icon: Key,         label: 'API Keys', requiresProject: false },
    { href: '/jobs',        icon: ScrollText,  label: 'Logs',     requiresProject: true },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return path === href || path === '/';
    return path.startsWith(href) && href !== '/projects';
  };

  const renderItem = (item: any) => {
    const { href, icon: Icon, label, exact, requiresProject, badge } = item;
    const blocked = requiresProject && !projectId;
    const finalHref = blocked ? href : href; // gate handles the empty case inline now

    return (
      <Link key={`${href}-${label}`} href={finalHref}
        onClick={onClose}
        title={blocked ? 'Chọn dự án trước khi vào' : label}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
          blocked
            ? 'text-zinc-500 hover:text-amber-300'
            : isActive(href, exact)
              ? 'bg-violet-600/20 text-violet-300'
              : 'text-zinc-300 hover:text-white hover:bg-white/5',
        )}
      >
        <Icon size={16} className="shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {badge > 0 && !blocked && (
          <span className="flex items-center gap-1 text-[10px] bg-violet-600/30 text-violet-300 px-1.5 py-0.5 rounded-full">
            <Loader2 size={9} className="animate-spin" />
            {badge}
          </span>
        )}
        {blocked && <AlertTriangle size={12} className="text-amber-400/80" />}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'lg:hidden fixed inset-0 z-30 bg-black/60 transition-opacity',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden
      />

      <aside
        className={cn(
          'sidebar shrink-0 flex flex-col py-4 overflow-y-auto z-40',
          // Desktop: in-flow sidebar
          'lg:static lg:translate-x-0 lg:w-[240px]',
          // Mobile: slide-in drawer
          'fixed inset-y-0 left-0 w-[260px] transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Mobile close button */}
        <div className="lg:hidden flex justify-end px-2 mb-2">
          <button onClick={onClose} className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-2 space-y-0.5">
          {NAV.map(renderItem)}
        </nav>

        <div className="px-2 pt-2 border-t border-[--border] space-y-0.5 mt-2">
          {BOTTOM.map(renderItem)}
        </div>
      </aside>
    </>
  );
}
