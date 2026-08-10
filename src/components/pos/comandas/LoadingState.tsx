'use client';

import { CardListSkeleton } from '@/components/common/PageSkeletons';

export function LoadingState() {
  return <CardListSkeleton cards={6} columns="3" />;
}
