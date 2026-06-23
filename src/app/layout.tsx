import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import SessionProvider from '@/lib/context/SessionContext';
import { I18nProvider } from '@/i18n/provider';
import { LanguageSync } from '@/i18n/LanguageSync';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

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
        <NextThemesProvider
          attribute="class"
          defaultTheme="system"
          storageKey="theme"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            <SessionProvider>
              <LanguageSync />
              {children}
              <Toaster />
            </SessionProvider>
          </I18nProvider>
        </NextThemesProvider>
      </body>
    </html>
  );
}
