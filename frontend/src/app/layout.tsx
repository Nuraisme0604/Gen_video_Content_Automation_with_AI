import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Shell } from '@/components/layout/Shell';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'AI Video Tool',
  description: 'AI Video Content Automation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="flex flex-col h-screen overflow-hidden">
        <Providers>
          <Shell>{children}</Shell>
          <Toaster theme="dark" position="top-right" richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
