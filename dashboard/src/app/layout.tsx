import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/features/auth/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'MiniGame Studio',
  description: 'Customize, embed and track your mini games.',
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%237c3aed'/%3E%3Ctext x='16' y='23' font-size='20' text-anchor='middle' fill='white'%3E%E2%99%A6%3C/text%3E%3C/svg%3E" },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#7c3aed' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
