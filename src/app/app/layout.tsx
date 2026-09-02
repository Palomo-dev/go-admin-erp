import React, { Suspense } from 'react';
import { AppLayout } from '@/components/app-layout/AppLayout';
import { AuthGuard } from '@/components/app-layout/AuthGuard';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { MotionProvider } from '@/components/shared/MotionProvider';

// Force dynamic rendering for all pages in /app/app/*
export const dynamic = 'force-dynamic';

// Componente de layout que envuelve children en AuthGuard + Suspense + MotionProvider
export default function AppLayoutPage({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <MotionProvider>
        <AppLayout>
          <Suspense fallback={
            <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
              <PageHeaderSkeleton />
              <StatsSkeleton count={4} />
              <CardListSkeleton cards={3} columns="1" />
            </div>
          }>
            {children}
          </Suspense>
        </AppLayout>
      </MotionProvider>
    </AuthGuard>
  );
}
