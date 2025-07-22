'use client';

import React, { useState } from 'react';
import { PageHeader } from './PageHeader';
import { FacturasTable, FiltrosFacturas } from './FacturasTable';
import { FacturasFiltros } from './FacturasFiltros';
import { FacturasProximasVencer } from './FacturasProximasVencer';
import { Card } from '@/components/ui/card';


// Utilizamos la interfaz FiltrosFacturas importada desde FacturasTable

export function FacturasVentaPage() {
  // Estado para gestionar los filtros
  const [filtrosActuales, setFiltrosActuales] = useState<FiltrosFacturas>({
    busqueda: '',
    estado: 'todos',
    payment_method: 'todos'
  });

  // Función que recibe los filtros actualizados del componente FacturasFiltros
  const manejarCambioFiltros = (filtros: FiltrosFacturas) => {
    setFiltrosActuales(filtros);
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader />
      
      {/* Widget de facturas próximas a vencer */}
      <div className="grid gap-6">
        <FacturasProximasVencer diasLimite={15} />
      </div>

      {/* Lista de facturas */}
      <Card className="p-6 dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
        <FacturasFiltros onFiltrosChange={manejarCambioFiltros} />
        <FacturasTable filtros={filtrosActuales} />
      </Card>
    </div>
  );
}
