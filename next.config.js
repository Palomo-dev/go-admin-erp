const { withSentryConfig } = require('@sentry/nextjs');

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

module.exports = withSentryConfig(nextConfig, {
  // Silence Sentry SDK compiler warnings
  silent: true,
  // No upload source maps in local dev builds
  hideSourceMaps: true,
  // Tree-shake Sentry SDK in production
  disableLogger: true,
  // Skip source map upload (requires auth token, only in CI)
  skipAutoUpload: true,
});
