'use client';

import { FC, useState } from 'react';
import KPICard from '@/components/inventario/KPICard';
import RotacionProductosChart from '@/components/inventario/RotacionProductosChart';
import TopSKUTable from '@/components/inventario/TopSKUTable';
import FiltrosInventario from '@/components/inventario/FiltrosInventario';

// Iconos para los KPIs - estos deberían reemplazarse por componentes de iconos reales
const StockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
  </svg>
);

const ValorizadoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

interface InventarioPageProps {}

const InventarioPage: FC<InventarioPageProps> = () => {
  // No utilizamos la desestructuración completa porque por ahora no necesitamos el valor
  // Solo nos interesa el setter para actualizarlo desde los componentes hijo
  const setFiltros = useState({
    sucursal: '',
    categoria: '',
  })[1];

  // Estos datos vendrían de la API de Supabase en una implementación real
  const [dashboardData, setDashboardData] = useState({
    kpis: {
      stockTotal: 2450,
      valorizado: 145000000,
      alertas: 12,
    },
    rotacion: [
      { mes: 'Ene', rotacion: 65 },
      { mes: 'Feb', rotacion: 59 },
      { mes: 'Mar', rotacion: 80 },
      { mes: 'Abr', rotacion: 81 },
      { mes: 'May', rotacion: 76 },
      { mes: 'Jun', rotacion: 85 },
    ],
    topSKUs: [
      { id: 'SKU001', nombre: 'Laptop Dell XPS 13', stock: 24, valorUnitario: 1200000, rotacion: 85 },
      { id: 'SKU002', nombre: 'Monitor Samsung 27"', stock: 45, valorUnitario: 450000, rotacion: 76 },
      { id: 'SKU003', nombre: 'Teclado Mecánico Logitech', stock: 36, valorUnitario: 120000, rotacion: 68 },
      { id: 'SKU004', nombre: 'Mouse Inalámbrico Microsoft', stock: 58, valorUnitario: 65000, rotacion: 92 },
      { id: 'SKU005', nombre: 'Audífonos Sony WH-1000XM4', stock: 19, valorUnitario: 850000, rotacion: 71 },
    ],
  });

  const handleFilterChange = (nuevosFiltros: { sucursal: string; categoria: string }) => {
    setFiltros(nuevosFiltros);
    
    // En una implementación real, aquí llamaríamos a la API para obtener los datos filtrados
    console.log('Aplicando filtros:', nuevosFiltros);
    
    // Simulación de actualización de datos (esto sería reemplazado por la llamada a la API)
    // Por ahora solo mantenemos los mismos datos
    setDashboardData({ ...dashboardData });
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard de Inventario</h1>
      </div>
      
      <FiltrosInventario onFilterChange={handleFilterChange} />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <KPICard 
          title="Stock Total" 
          value={dashboardData.kpis.stockTotal.toLocaleString()} 
          icon={<StockIcon />}
          trend={{ value: 5.2, isPositive: true }}
          variant="blue"
        />
        <KPICard 
          title="Valor Total" 
          value={formatCurrency(dashboardData.kpis.valorizado)} 
          icon={<ValorizadoIcon />}
          trend={{ value: 3.8, isPositive: true }}
          variant="green"
        />
        <KPICard 
          title="Alertas de Stock" 
          value={dashboardData.kpis.alertas} 
          icon={<AlertIcon />}
          trend={{ value: 2.1, isPositive: false }}
          variant="red"
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <RotacionProductosChart data={dashboardData.rotacion} />
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Distribución por Categoría</h3>
          <div className="flex justify-center items-center h-64">
            <p className="text-gray-500">Gráfico de distribución por categoría</p>
            {/* Aquí iría un componente de gráfico circular o de barras */}
          </div>
        </div>
      </div>
      
      <TopSKUTable skus={dashboardData.topSKUs} />
    </div>
  );
};

export default InventarioPage;
