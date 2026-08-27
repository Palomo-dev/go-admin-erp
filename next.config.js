/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Permite que el build en producción complete aunque haya errores de ESLint
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Permite que el build en producción complete aunque haya errores de TypeScript
    ignoreBuildErrors: true,
  },
  // Limitar workers de webpack para evitar OOM en Vercel (8GB RAM).
  // cpus: 1 = solo 1 worker de webpack (en vez de 4 por defecto).
  // workerThreads: false = usar proceso hijo en vez de thread (menos memoria).
  // Con 1 worker × 6GB + 1GB main = 7GB, cabe en 8GB de Vercel.
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  // Desactivar source maps en build para reducir memoria
  productionBrowserSourceMaps: false,
  // Desactivar minificación SWC para reducir memoria del build
  swcMinify: true,
  // Desactivar cache de webpack para reducir memoria
  webpack: (config, { dev, isServer }) => {
    if (!dev) {
      config.cache = false;
    }
    return config;
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
