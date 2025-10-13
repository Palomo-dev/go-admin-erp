'use client';

import React from 'react';
import { NuevaFacturaForm } from '@/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm';
import { PageBackHeader } from '@/components/finanzas/facturas-venta/nueva-factura/PageBackHeader';
import { Card } from '@/components/ui/card';

export default function NuevaFacturaPage() {
  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      <PageBackHeader />
      <Card className="
        p-3 sm:p-4 lg:p-6
        bg-white dark:bg-gray-800
        border-gray-200 dark:border-gray-700
        shadow-sm
        w-full
        overflow-hidden
      ">
        <NuevaFacturaForm />
      </Card>
    </div>
  );
}
