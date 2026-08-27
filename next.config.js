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
}

// Sentry webpack wrapper solo cuando hay SENTRY_AUTH_TOKEN (CI con source maps).
// Sin el token, el SDK de Sentry funciona igual en runtime, solo sin source maps.
// Esto evita OOM en Vercel (el plugin de webpack de Sentry consume ~1GB extra).
const hasSentryToken = !!process.env.SENTRY_AUTH_TOKEN;

let config = nextConfig;

if (hasSentryToken) {
  const { withSentryConfig } = require('@sentry/nextjs');
  config = withSentryConfig(nextConfig, {
    silent: true,
    hideSourceMaps: true,
    disableLogger: true,
    skipAutoUpload: !hasSentryToken,
  });
}

module.exports = config;
