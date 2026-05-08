'use client';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Cài đặt</h1>

      {/* Giao diện */}
      <div className="card p-5 space-y-4">
        <h2 className="font-medium">Giao diện</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-300">Chủ đề</div>
            <div className="text-xs text-zinc-500">Dark hoặc Light mode</div>
          </div>
          <div className="flex items-center gap-2 bg-zinc-800 px-3 py-2 rounded-lg">
            <span className="text-xs text-zinc-400 mr-1">Dark / Light</span>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* API & Tích hợp */}
      <div className="card p-5 space-y-3">
        <h2 className="font-medium">API & Tích hợp</h2>
        <Link href="/api-sources" className="flex items-center justify-between py-2 hover:text-violet-400 transition-colors group">
          <div>
            <div className="text-sm text-zinc-300 group-hover:text-violet-300">Quản lý API Keys</div>
            <div className="text-xs text-zinc-500">OpenAI, Anthropic, ElevenLabs, Veo3...</div>
          </div>
          <ExternalLink size={14} className="text-zinc-500" />
        </Link>
        <Link href="/notifications/settings" className="flex items-center justify-between py-2 hover:text-violet-400 transition-colors group">
          <div>
            <div className="text-sm text-zinc-300 group-hover:text-violet-300">Telegram & Log</div>
            <div className="text-xs text-zinc-500">Cấu hình thông báo và đẩy log</div>
          </div>
          <ExternalLink size={14} className="text-zinc-500" />
        </Link>
      </div>

      {/* Thông tin hệ thống */}
      <div className="card p-5 space-y-2">
        <h2 className="font-medium mb-3">Thông tin hệ thống</h2>
        {[
          { label: 'Backend API', value: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001' },
          { label: 'Swagger Docs', value: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/docs`, href: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/docs` },
          { label: 'MinIO Console', value: 'http://localhost:9001', href: 'http://localhost:9001' },
          { label: 'n8n Workflows', value: 'http://localhost:5678', href: 'http://localhost:5678' },
        ].map(({ label, value, href }) => (
          <div key={label} className="flex items-center justify-between py-1.5 border-b border-[--border] last:border-0">
            <span className="text-sm text-zinc-400">{label}</span>
            {href ? (
              <a href={href} target="_blank" rel="noopener" className="text-xs font-mono text-violet-400 hover:text-violet-300 flex items-center gap-1">
                {value} <ExternalLink size={10} />
              </a>
            ) : (
              <span className="text-xs font-mono text-zinc-300">{value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
