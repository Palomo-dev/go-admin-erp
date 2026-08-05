'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { NuevaReservaWizard } from '@/components/pms/reservas/nueva';

export default function NuevaReservaPage() {
  const searchParams = useSearchParams();

  const urlSpaceId = searchParams.get('space_id');
  const urlCheckin = searchParams.get('checkin');
  const urlCheckout = searchParams.get('checkout');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <NuevaReservaWizard
        preselectedSpaceId={urlSpaceId}
        preselectedCheckin={urlCheckin}
        preselectedCheckout={urlCheckout}
        showHeader
      />
    </div>
  );
}
