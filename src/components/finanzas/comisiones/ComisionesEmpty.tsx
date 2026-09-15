'use client';

/** Estado vacío con propósito (brief §3): distingue «sin comisiones» de «el filtro no encuentra». */

import Link from 'next/link';
import { Percent } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function ComisionesEmpty({ filtered }: { filtered: boolean }) {
  return (
    <Card className="border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/40" aria-hidden="true">
          <Percent className="h-6 w-6 text-blue-700 dark:text-blue-300" />
        </span>
        {filtered ? (
          <>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Ninguna comisión coincide con el filtro</p>
            <p className="max-w-sm text-sm text-gray-600 dark:text-gray-400">Prueba a ampliar el periodo, cambiar el miembro o quitar el estado.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Aún no hay comisiones devengadas</p>
            <p className="max-w-sm text-sm text-gray-600 dark:text-gray-400">
              Se generan solas al facturar con vendedor o al ganar una oportunidad, con la tasa configurada en{' '}
              <Link href="/app/configuracion?modulo=crm" className="text-blue-700 underline dark:text-blue-300">
                Configuración › CRM › Vendedores y comisiones
              </Link>
              .
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
