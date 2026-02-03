import React, { Suspense } from 'react';
import { AppLayout } from '@/components/app-layout/AppLayout';

// Force dynamic rendering for all pages in /app/app/*
export const dynamic = 'force-dynamic';

// Componente de layout que envuelve children en Suspense para evitar errores de useSearchParams
export default function AppLayoutPage({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppLayout>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
        {children}
      </Suspense>
    </AppLayout>
  );
}
