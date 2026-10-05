'use client';

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { CallDetailPage } from '@/components/voice/CallDetailPage';
import { parseCallDeepLink } from '@/components/voice/callDeepLink';

function DetalleLlamada({ id }: { id: string }) {
  const query = useSearchParams();
  const link = parseCallDeepLink(id, query?.get('start_ms') ?? null);
  return <CallDetailPage id={id} startMs={link?.startMs ?? null} />;
}

export default function DetalleLlamadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense fallback={<Skeleton className="m-4 h-64" />}><DetalleLlamada id={id} /></Suspense>;
}
