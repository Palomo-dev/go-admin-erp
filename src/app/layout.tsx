import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import SessionProvider from '@/lib/context/SessionContext';
import UniversalTriggerProvider from '@/components/providers/UniversalTriggerProvider';


const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GO Admin ERP',
  description: 'Sistema de administración ERP',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>

        <SessionProvider>
          <UniversalTriggerProvider>
            {children}
            <Toaster />
          </UniversalTriggerProvider>
        </SessionProvider>
      </body>
    </html>
  );
}