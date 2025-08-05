'use client';

import React, { useState } from 'react';
import { PageHeader } from './PageHeader';
import { FacturasCompraTable, FiltrosFacturasCompra } from './FacturasCompraTable';
import { FacturasCompraFiltros } from './FacturasCompraFiltros';
import { FacturasProximasVencer } from './FacturasProximasVencer';
import { Card } from '@/components/ui/card';

// Utilizamos la interfaz FiltrosFacturasCompra importada desde FacturasCompraTable

export function FacturasCompraPage() {
  // Estado para gestionar los filtros
  const [filtrosActuales, setFiltrosActuales] = useState<FiltrosFacturasCompra>({
    busqueda: '',
    estado: 'todos',
    proveedor: 'todos',
    fechaDesde: '',
    fechaHasta: ''
  });

  // Función que recibe los filtros actualizados del componente FacturasCompraFiltros
  const manejarCambioFiltros = (filtros: FiltrosFacturasCompra) => {
    setFiltrosActuales(filtros);
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader />
      
      {/* Widget de facturas próximas a vencer */}
      <div className="grid gap-6">
        <FacturasProximasVencer diasLimite={15} />
      </div>

      {/* Lista de facturas de compra */}
      <Card className="p-6 dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
        <FacturasCompraFiltros onFiltrosChange={manejarCambioFiltros} />
        <FacturasCompraTable filtros={filtrosActuales} />
      </Card>
    </div>
  );
}
