import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuracion de Capacitor 8 para Go Admin ERP.
 *
 * Arquitectura: wrapper de URL remota (https://app.goadmin.io) + plugins nativos.
 *
 * Mismo patron que Electron: el WebView carga la web de produccion y Capacitor
 * expone APIs nativas via plugins (camara, push, biometria, Bluetooth, NFC, geo).
 *
 * Justificacion: la auditoria SSR (ver docs/PLAN_CAPACITOR_MOVIL.md seccion 9)
 * demostro que el proyecto NO es viable para static export sin 200-400h de
 * reestructuracion (21 paginas force-dynamic, 50+ cookies(), 100+ API Routes,
 * middleware 763 lineas, next-intl). El patron server.url remoto replica lo que
 * Electron ya hace con exito.
 *
 * Riesgo: Apple Guideline 4.2 (Minimum Functionality) puede rechazar apps que
 * son "thin wrappers". Mitigacion: features nativas significativas (impresion
 * Bluetooth ESC/POS, biometria, push, NFC, camara, geolocalizacion) que elevan
 * la app por encima de un mero wrapper web.
 */
const config: CapacitorConfig = {
  appId: 'io.goadmin.app',
  appName: 'GoAdmin ERP',
  // webDir no se usa con server.url remoto, pero Capacitor requiere un valor.
  webDir: 'www',
  server: {
    url: 'https://app.goadmin.io',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    // Dominios permitidos para navegacion dentro del WebView.
    allowNavigation: ['*.goadmin.io', '*.supabase.co'],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0f172a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      iosSpinnerStyle: 'small',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
      overlaysWebView: true,
    },
    SafeArea: {
      customColorForBackground: '#0f172a',
      customColorForStatusBar: '#0f172a',
      statusBarStyle: 'DARK',
    },
    Keyboard: {
      // 'body' redimensiona el contenido web (CSS) en vez del WebView nativo.
      // 'native' causa un espacio blanco arriba del teclado en apps con
      // server.url remoto porque el WebView no se ajusta correctamente.
      resize: 'body',
      resizeOnFullScreen: true,
      style: 'DARK',
      scroll: true,
    },
    CapacitorUpdater: {
      // Capgo OTA actualiza el bundle nativo (no la web, que se sirve remota).
      // Util para updates de plugins/config nativa sin pasar por store.
      autoUpdate: false, // Deshabilitado: la web se sirve remota, no hay bundle local que actualizar
    },
  },
};

export default config;
