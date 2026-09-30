/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Salida standalone para la app de escritorio (fase 3 del desktop): además
  // del build normal, `next build` deja en `.next/standalone/` un `server.js`
  // autosuficiente con solo las dependencias que usa el servidor. Electron lo
  // empaqueta como extraResource y lo arranca en 127.0.0.1 para que la app
  // abra y navegue sin internet (ver docs/desktop/FASE-3-NEXT-EMBEBIDO.md).
  // Solo en el build del desktop (NEXT_DIST_DIR definido por
  // electron/scripts/build-web.js): el despliegue de Vercel no cambia de forma.
  ...(process.env.NEXT_DIST_DIR ? { output: 'standalone' } : {}),
  // Directorio de salida configurable para que el build del desktop
  // (electron/scripts/build-web.js → NEXT_DIST_DIR=.next-desktop) no comparta
  // `.next` con un `next dev` o `next build` que corra a la vez en el mismo
  // árbol: el segundo borra `.next/server` y el primero muere con
  // "Cannot find module webpack-runtime.js". Sin la variable, `.next` de siempre.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  eslint: {
    // DEUDA (auditoría desktop §4.6, 2026-09-21): sigue en true porque
    // `npm run lint` no está verde: miles de `@typescript-eslint/no-explicit-any`
    // preexistentes en todo src/. Activarlo hoy rompería el despliegue sin
    // corregir nada. Cuando el lint quede en 0, pasar a false. Mientras tanto,
    // cada archivo que se toque debe quedar limpio (regla de CLAUDE.md).
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Auditoría desktop §4.6 [CERRADO 2026-09-21]: la compuerta de tipos es
    // el job `typecheck` de .github/workflows/ci-web.yml (`tsc --noEmit` con
    // 8 GB de heap en un runner de 16 GB), NO el chequeo dentro de `next build`:
    // el repo necesita ~8 GB para tipar y con menos hace thrashing de GC —
    // Vercel (6 GB, 1 CPU) se quedó 45 min en «Checking validity of types»
    // y abortó por tiempo (eaa36422); el runner de Windows del desktop (7 GB)
    // murió por OOM (0.2.2). Por eso Vercel (vercel.json) y el desktop
    // (desktop-release.yml) pasan NEXT_SKIP_TYPECHECK=1. Un `next build` local
    // sin la variable sigue comprobando tipos.
    ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === '1',
  },
  // Limitar workers de webpack para evitar OOM en Vercel (8GB RAM).
  // cpus: 1 = solo 1 worker de webpack (en vez de 4 por defecto).
  // workerThreads: false = usar proceso hijo en vez de thread (menos memoria).
  // Con 1 worker × 6GB + 1GB main = 7GB, cabe en 8GB de Vercel.
  experimental: {
    workerThreads: false,
    cpus: 1,
    // Solo en el build del desktop: el servidor standalone NO precarga todas
    // las rutas al arrancar. Con el default (true) `next-server` evalúa los
    // manifests de las ~cientos de páginas y API routes en el hilo principal
    // nada más arrancar (`unstable_preloadEntries`), y el primer request
    // —la ventana del desktop cargando el login— espera 10-40 s de CPU
    // (perfilado el 2026-09-16: `loadComponentsImpl` 26 s de 28 s). Con
    // false cada ruta se carga en su primer uso (0,2 s) y el servidor
    // embebido responde en <1 s desde el arranque. En Vercel no cambia nada:
    // allí el proceso vive mucho y la precarga amortiza.
    ...(process.env.NEXT_DIST_DIR ? { preloadEntriesOnStart: false } : {}),
  },
  // Desactivar source maps en build para reducir memoria
  productionBrowserSourceMaps: false,
  // Desactivar minificación SWC para reducir memoria del build
  swcMinify: true,
  // Desactivar cache de webpack para reducir memoria
  webpack: (config, { dev }) => {
    if (!dev) {
      config.cache = false;
    }
    return config;
  },
  // Membresías (docs/design/MEMBRESIAS-FASE-1-2.md §2): el módulo «Gimnasio» pasó a
  // /app/membresias. Redirección PERMANENTE (308) aquí y no en el middleware, para que los
  // marcadores viejos sigan funcionando. /app/gym es ahora el Resumen; horarios se fundió con
  // clases; «ajustes» (nunca existió) va a la configuración del módulo.
  async redirects() {
    return [
      { source: '/app/gym', destination: '/app/membresias', permanent: true },
      { source: '/app/gym/membresias', destination: '/app/membresias/membresias', permanent: true },
      { source: '/app/gym/membresias/:id', destination: '/app/membresias/membresias/:id', permanent: true },
      { source: '/app/gym/planes', destination: '/app/membresias/planes', permanent: true },
      { source: '/app/gym/clases', destination: '/app/membresias/clases', permanent: true },
      { source: '/app/gym/horarios', destination: '/app/membresias/clases?vista=calendario', permanent: true },
      { source: '/app/gym/reservaciones', destination: '/app/membresias/reservas', permanent: true },
      { source: '/app/gym/checkin', destination: '/app/membresias/check-in', permanent: true },
      { source: '/app/gym/instructores', destination: '/app/membresias/instructores', permanent: true },
      { source: '/app/gym/dispositivos', destination: '/app/membresias/control-de-acceso', permanent: true },
      { source: '/app/gym/reportes', destination: '/app/membresias', permanent: true },
      { source: '/app/gym/ajustes', destination: '/app/configuracion?modulo=gym', permanent: true },
      { source: '/app/gym/:path*', destination: '/app/membresias', permanent: true },
      { source: '/gym-display/:deviceId', destination: '/membresias-kiosco/:deviceId', permanent: true },
    ];
  },
  // Permitir que Evolution API (en Docker) envie webhooks al ERP local
  allowedDevOrigins: ['http://host.docker.internal:61592', 'http://localhost:8080'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'jgmgphmzusbluqhuqihj.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  // La app móvil (Capacitor) usa server.url remoto (igual que Electron),
  // por lo que NO requiere static export ni cambios en next.config.js.
  // Ver docs/PLAN_CAPACITOR_MOVIL.md para detalles de arquitectura.
  // Fix: multiple lockfiles warning (C:\Users\USUARIO\package-lock.json)
  outputFileTracingRoot: __dirname,
  // PDF en Vercel (motor de documentos, src/lib/documents/server/pdf.ts):
  // `@sparticuz/chromium` busca su Chromium comprimido en `bin/` con una ruta
  // relativa, que el rastreo de archivos no ve. Cada ruta que llama a
  // `generarPdf` lo lleva (~65 MB; la función queda ~150-175 MB de 250).
  // Las claves son globs de picomatch: los corchetes van escapados.
  outputFileTracingIncludes: Object.fromEntries(
    [
      '/api/documentos/\\[tipo\\]/\\[id\\]',
      '/api/facturas-venta/\\[id\\]/pdf',
      '/api/facturas-venta/\\[id\\]/enviar',
      '/api/cotizaciones/\\[id\\]/enviar',
      '/api/cartera/\\[id\\]/recordatorio',
      '/api/clientes/\\[id\\]/estado-cuenta/enviar',
      '/api/reportes/programados/\\[id\\]/prueba',
      '/api/cron/reportes-programados',
    ].map((ruta) => [ruta, ['./node_modules/@sparticuz/chromium/bin/**']]),
  ),
}

// NOTA: withSentryConfig removido del build web para evitar OOM en Vercel.
// El plugin de webpack de Sentry consume ~1GB extra de memoria.
// Sentry sigue funcionando en runtime via instrumentation.ts y sentry.client.config.ts,
// solo sin source maps en producción.
// Para reactivar source maps: setear SENTRY_AUTH_TOKEN en Vercel y descomentar el bloque.
//
// const { withSentryConfig } = require('@sentry/nextjs');
// module.exports = withSentryConfig(nextConfig, {
//   silent: true,
//   hideSourceMaps: true,
//   disableLogger: true,
//   skipAutoUpload: true,
// });

module.exports = nextConfig;
