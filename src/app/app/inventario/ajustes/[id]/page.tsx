'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { AjusteDetalle } from '@/components/inventario/ajustes/detalle';

export default function AjusteDetallePage() {
  const { theme } = useTheme();
  const params = useParams();
  const adjustmentId = parseInt(params.id as string);

  return (
    <div className={`p-6 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} min-h-screen`}>
      <AjusteDetalle adjustmentId={adjustmentId} />
    </div>
  );
}
