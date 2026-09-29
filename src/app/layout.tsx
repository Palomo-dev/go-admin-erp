import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
// Los tokens van antes que globals.css: globals los usa en body.
import '@/styles/tokens.css';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { SonnerToaster } from '@/components/ui/sonner-toaster';
import SessionProvider from '@/lib/context/SessionContext';
import { I18nProvider } from '@/i18n/provider';
import { LanguageSync } from '@/i18n/LanguageSync';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { SentryErrorBoundary } from '@/components/SentryErrorBoundary';
import { SentryMobileInit } from '@/components/SentryMobileInit';
import { PWARegister } from '@/components/PWARegister';
import { PushNotificationManager } from '@/components/PushNotificationManager';
import { DesktopThemeSync } from '@/components/app-layout/DesktopThemeSync';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GO Admin ERP',
  description: 'Sistema de administración ERP - POS, inventario, finanzas, CRM y más',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'GO Admin',
    statusBarStyle: 'default',
  },
  // Íconos del manual de marca v2.0 (isotipo «GO» sobre Azul GO). Se generan con
  // `node scripts/brand/generar-iconos.mjs`; no se editan a mano.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  // Azul GO, igual que theme_color de public/manifest.json.
  themeColor: '#4361EE',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

// Meta tags adicionales para iOS PWA standalone
const iosMetaTags = (
  <>
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="GO Admin" />
    <meta name="format-detection" content="telephone=no" />
    {/* iOS: prevenir que enlaces internos abran Safari externo */}
    <meta name="apple-touch-fullscreen" content="yes" />
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
            {/* Solo en Go Admin Desktop: la barra, el fondo y el splash siguen al interruptor claro/oscuro del header. */}
            <DesktopThemeSync />
            <PWARegister />
            {/* Se retira solo en /pos-display (pantalla del cliente del POS): ver src/lib/pos/display/route.ts. */}
            <PushNotificationManager />
            <I18nProvider>
              <SessionProvider>
                <LanguageSync />
                {children}
                {/* Se queda también en /pos-display: solo emite avisos de sesión y de acciones bajo /app; la pantalla del cliente no dispara toasts. */}
                <Toaster />
                {/* 95 archivos avisan con `toast` de sonner; sin este contenedor ninguno se veía. */}
                <SonnerToaster />
              </SessionProvider>
            </I18nProvider>
          </SentryErrorBoundary>
        </NextThemesProvider>
      </body>
    </html>
  );
}
