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
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeader />
      
      {/* Widget de facturas próximas a vencer */}
      <FacturasProximasVencer diasLimite={15} />

      {/* Lista de facturas */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="p-4">
          <FacturasFiltros onFiltrosChange={manejarCambioFiltros} />
          <FacturasTable filtros={filtrosActuales} />
        </div>
      </Card>
    </div>
  );
}
