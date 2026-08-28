/**
 * Configuración Sentry client-side usando @sentry/react (no @sentry/nextjs).
 *
 * @sentry/nextjs tiene plugins de webpack que consumen ~1GB durante el build
 * y causan OOM en Vercel. @sentry/react hace lo mismo en runtime sin
 * afectar el build.
 */
import * as Sentry from '@sentry/react';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && typeof window !== 'undefined') {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    release: `goadmin-web@${process.env.npm_package_version}`,
  });
}
