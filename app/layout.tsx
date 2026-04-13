import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OST Hibiki',
  description: 'Prototype-faithful OST showcase MVP'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
