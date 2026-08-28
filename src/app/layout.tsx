import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import SessionProvider from '@/lib/context/SessionContext';
import { I18nProvider } from '@/i18n/provider';
import { LanguageSync } from '@/i18n/LanguageSync';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { SentryErrorBoundary } from '@/components/SentryErrorBoundary';
import { SentryMobileInit } from '@/components/SentryMobileInit';
import { PWARegister } from '@/components/PWARegister';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { PushNotificationManager } from '@/components/PushNotificationManager';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GO Admin ERP',
  description: 'Sistema de administración ERP - POS, inventario, finanzas, CRM y más',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'GoAdmin ERP',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Meta tags adicionales para iOS PWA standalone
const iosMetaTags = (
  <>
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="GoAdmin ERP" />
    <meta name="format-detection" content="telephone=no" />
  </>
);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>{iosMetaTags}</head>
      <body className={inter.className} suppressHydrationWarning>
        <NextThemesProvider
          attribute="class"
          defaultTheme="system"
          storageKey="theme"
          enableSystem
          disableTransitionOnChange
        >
          <SentryErrorBoundary>
            <SentryMobileInit />
            <PWARegister />
            <PWAInstallPrompt />
            <PushNotificationManager />
            <I18nProvider>
              <SessionProvider>
                <LanguageSync />
                {children}
                <Toaster />
              </SessionProvider>
            </I18nProvider>
          </SentryErrorBoundary>
        </NextThemesProvider>
      </body>
    </html>
  );
}
