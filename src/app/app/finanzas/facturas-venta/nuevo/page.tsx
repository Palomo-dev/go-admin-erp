'use client';

import React from 'react';
import { NuevaFacturaForm } from '@/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm';
import { PageBackHeader } from '@/components/finanzas/facturas-venta/nueva-factura/PageBackHeader';
import { Card } from '@/components/ui/card';

export default function NuevaFacturaPage() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageBackHeader />
      <div className="grid gap-6">
        <Card className="p-6 dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
          <NuevaFacturaForm />
        </Card>
      </div>
    </div>
  );
}
