'use client';

import { Suspense } from 'react';
import { PropinasContent } from '@/components/pos/propinas/PropinasContent';

export default function PropinasPage() {
  return (
    <Suspense>
      <PropinasContent />
    </Suspense>
  );
}
