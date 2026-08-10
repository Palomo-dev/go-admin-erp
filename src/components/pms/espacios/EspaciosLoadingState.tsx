'use client';

import { CardListSkeleton } from '@/components/common/PageSkeletons';

export function EspaciosLoadingState() {
  return <CardListSkeleton cards={8} columns="3" />;
}
