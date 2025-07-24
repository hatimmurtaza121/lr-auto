import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LR Automation',
  description: 'Manage your game automation scripts with ease',
  icons: {
    icon: [
      {
        url: '/favicon/favicon.ico',
        sizes: 'any',
      },
      {
        url: '/favicon/favicon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/favicon/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/favicon/favicon.svg',
      },
    ],
  },
  manifest: '/favicon/site.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}