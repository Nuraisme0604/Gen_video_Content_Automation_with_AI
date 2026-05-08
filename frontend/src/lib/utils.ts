import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function statusColor(status: string) {
  const map: Record<string, string> = {
    done: 'text-emerald-500',
    completed: 'text-emerald-500',
    rendering: 'text-violet-500',
    queued: 'text-amber-500',
    active: 'text-violet-500',
    failed: 'text-rose-500',
    draft: 'text-zinc-400',
    pending: 'text-zinc-400',
  };
  return map[status] ?? 'text-zinc-400';
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    done: '✅ Xong',
    completed: '✅ Xong',
    rendering: '⏳ Đang dựng',
    queued: '🕐 Xếp hàng',
    active: '⚙️ Đang chạy',
    failed: '❌ Lỗi',
    draft: '📝 Nháp',
    pending: '⏳ Chờ',
  };
  return map[status] ?? status;
}
