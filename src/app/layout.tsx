import React from 'react';
import './globals.css';

export const metadata = {
  title: 'Nukhba — Employee Management & Task Tracking System',
  description: 'Secure Enterprise Employee Management & Task Tracking SaaS Platform'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
