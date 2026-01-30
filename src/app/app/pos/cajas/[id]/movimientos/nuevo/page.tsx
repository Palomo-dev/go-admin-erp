'use client';

import { use } from 'react';
import { NuevoMovimientoPage } from '@/components/pos/cajas/movimientos';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function NuevoMovimiento({ params }: PageProps) {
  const resolvedParams = use(params);
  const sessionUuid = resolvedParams.id;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sessionUuid)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <p className="text-red-500">UUID de sesión inválido</p>
      </div>
    );
  }

  return <NuevoMovimientoPage sessionUuid={sessionUuid} />;
}
