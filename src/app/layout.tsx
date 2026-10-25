import React from 'react';
import './globals.css';

export const metadata = {
  title: 'نُخبة (Nukhba) — نظام إدارة الموظفين وتتبع المهام المؤسسي',
  description: 'Secure Enterprise Employee Management & Task Tracking SaaS Platform'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" id="html-root" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdn.tailwindcss.com/3.4.17" async></script>
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased" style={{ fontFamily: "'Cairo', 'Inter', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
