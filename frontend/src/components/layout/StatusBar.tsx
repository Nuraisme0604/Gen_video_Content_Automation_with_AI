'use client';
import { useQuery } from '@tanstack/react-query';
import { getJobs } from '@/lib/api';

export function StatusBar() {
  const { data } = useQuery({
    queryKey: ['jobs', 'active'],
    queryFn: () => getJobs({ status: 'active' }),
    refetchInterval: 5000,
  });
  const jobs = data?.items || [];

  const running = jobs.filter((j: any) => j.status === 'active' || j.status === 'queued').length;

  return (
    <footer className="h-7 border-t border-[--border] bg-[--sidebar] flex items-center px-4 text-xs text-zinc-500 gap-4 shrink-0">
      <span className={running > 0 ? 'text-violet-400' : ''}>
        ● {running > 0 ? `${running} job đang chạy` : 'Không có job nào'}
      </span>
      <span>Veo queue: {jobs.filter((j: any) => j.queue === 'render').length}</span>
    </footer>
  );
}
