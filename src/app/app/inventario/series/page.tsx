'use client';
import React, { useState } from 'react';
import { SerialsTable } from '@/components/inventario/series/SerialsTable';
import { StatusFilter } from '@/components/inventario/series/StatusFilter';
import { SerialStatus } from '@/components/inventario/series/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SeriesPage() {
  const [selectedStatus, setSelectedStatus] = useState<SerialStatus | 'Todos'>('Todos');

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Números de Serie</h1>
          <p className="text-muted-foreground">
            Administre los números de serie de productos como electrónica y joyería
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Filtrar por estado</CardTitle>
          <CardDescription>
            Seleccione un estado para filtrar los números de serie
          </CardDescription>
          <div className="pt-2">
            <StatusFilter 
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
            />
          </div>
        </CardHeader>
        <CardContent>
          <SerialsTable statusFilter={selectedStatus} />
        </CardContent>
      </Card>
    </div>
  );
}
