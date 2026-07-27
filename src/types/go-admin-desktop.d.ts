import type { GoAdminDesktopBridge } from '@/lib/utils/desktop';

/**
 * Bridge inyectado por el preload de Go Admin Desktop (Electron).
 * Solo existe cuando la app corre dentro de la aplicación de escritorio;
 * en el navegador es undefined.
 */
declare global {
  interface Window {
    goAdminDesktop?: GoAdminDesktopBridge;
  }
}

export {};
