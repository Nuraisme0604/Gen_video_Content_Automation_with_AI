'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { StatusBar } from './StatusBar';

export function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const path = usePathname();

  // Auto-close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [path]);

  return (
    <>
      <TopBar onMenuClick={() => setMobileOpen(v => !v)} />
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6">{children}</main>
      </div>
      <StatusBar />
    </>
  );
}
