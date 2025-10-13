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
    <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 md:py-6 space-y-4 sm:space-y-6 max-w-7xl">
      <PageHeader />
      
      {/* Widget de facturas próximas a vencer */}
      <div className="grid gap-4 sm:gap-6">
        <FacturasProximasVencer diasLimite={15} />
      </div>

      {/* Lista de facturas de compra */}
      <Card className="p-3 sm:p-4 md:p-6 dark:bg-gray-800/50 dark:border-gray-700 bg-white border-gray-200">
        <FacturasCompraFiltros onFiltrosChange={manejarCambioFiltros} />
        <FacturasCompraTable filtros={filtrosActuales} />
      </Card>
    </div>
  );
}
