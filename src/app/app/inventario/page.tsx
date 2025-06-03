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

  // Datos simulados para diferentes sucursales
  const datosPorSucursal: Record<string, typeof dashboardData> = {
    'SUC001': {
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
    },
    'SUC002': {
      kpis: {
        stockTotal: 1850,
        valorizado: 98500000,
        alertas: 8,
      },
      rotacion: [
        { mes: 'Ene', rotacion: 58 },
        { mes: 'Feb', rotacion: 62 },
        { mes: 'Mar', rotacion: 75 },
        { mes: 'Abr', rotacion: 78 },
        { mes: 'May', rotacion: 70 },
        { mes: 'Jun', rotacion: 79 },
      ],
      topSKUs: [
        { id: 'SKU002', nombre: 'Monitor Samsung 27"', stock: 32, valorUnitario: 450000, rotacion: 82 },
        { id: 'SKU003', nombre: 'Teclado Mecánico Logitech', stock: 28, valorUnitario: 120000, rotacion: 75 },
        { id: 'SKU004', nombre: 'Mouse Inalámbrico Microsoft', stock: 45, valorUnitario: 65000, rotacion: 89 },
        { id: 'SKU001', nombre: 'Laptop Dell XPS 13', stock: 18, valorUnitario: 1200000, rotacion: 72 },
        { id: 'SKU008', nombre: 'Impresora HP LaserJet', stock: 12, valorUnitario: 520000, rotacion: 65 },
      ],
    },
    'SUC003': {
      kpis: {
        stockTotal: 1250,
        valorizado: 78500000,
        alertas: 15,
      },
      rotacion: [
        { mes: 'Ene', rotacion: 48 },
        { mes: 'Feb', rotacion: 52 },
        { mes: 'Mar', rotacion: 65 },
        { mes: 'Abr', rotacion: 68 },
        { mes: 'May', rotacion: 72 },
        { mes: 'Jun', rotacion: 75 },
      ],
      topSKUs: [
        { id: 'SKU006', nombre: 'Tablet Samsung Galaxy', stock: 22, valorUnitario: 750000, rotacion: 78 },
        { id: 'SKU007', nombre: 'Smart TV LG 50"', stock: 8, valorUnitario: 1800000, rotacion: 62 },
        { id: 'SKU004', nombre: 'Mouse Inalámbrico Microsoft', stock: 35, valorUnitario: 65000, rotacion: 85 },
        { id: 'SKU009', nombre: 'Cámara Sony Alpha', stock: 6, valorUnitario: 2500000, rotacion: 58 },
        { id: 'SKU010', nombre: 'Router TP-Link', stock: 18, valorUnitario: 180000, rotacion: 72 },
      ],
    },
    'SUC004': {
      kpis: {
        stockTotal: 1650,
        valorizado: 112000000,
        alertas: 10,
      },
      rotacion: [
        { mes: 'Ene', rotacion: 55 },
        { mes: 'Feb', rotacion: 58 },
        { mes: 'Mar', rotacion: 68 },
        { mes: 'Abr', rotacion: 72 },
        { mes: 'May', rotacion: 75 },
        { mes: 'Jun', rotacion: 82 },
      ],
      topSKUs: [
        { id: 'SKU001', nombre: 'Laptop Dell XPS 13', stock: 15, valorUnitario: 1200000, rotacion: 80 },
        { id: 'SKU011', nombre: 'Disco Duro Externo 2TB', stock: 28, valorUnitario: 320000, rotacion: 88 },
        { id: 'SKU012', nombre: 'Memoria USB 128GB', stock: 42, valorUnitario: 85000, rotacion: 92 },
        { id: 'SKU013', nombre: 'Monitor Curvo 32"', stock: 10, valorUnitario: 980000, rotacion: 68 },
        { id: 'SKU014', nombre: 'Teclado Inalámbrico Apple', stock: 12, valorUnitario: 420000, rotacion: 75 },
      ],
    },
  };

  // Datos simulados para diferentes categorías
  const datosPorCategoria: Record<string, typeof dashboardData> = {
    'CAT001': {
      kpis: {
        stockTotal: 980,
        valorizado: 95000000,
        alertas: 7,
      },
      rotacion: [
        { mes: 'Ene', rotacion: 68 },
        { mes: 'Feb', rotacion: 72 },
        { mes: 'Mar', rotacion: 78 },
        { mes: 'Abr', rotacion: 82 },
        { mes: 'May', rotacion: 79 },
        { mes: 'Jun', rotacion: 85 },
      ],
      topSKUs: [
        { id: 'SKU001', nombre: 'Laptop Dell XPS 13', stock: 24, valorUnitario: 1200000, rotacion: 85 },
        { id: 'SKU006', nombre: 'Tablet Samsung Galaxy', stock: 22, valorUnitario: 750000, rotacion: 78 },
        { id: 'SKU007', nombre: 'Smart TV LG 50"', stock: 8, valorUnitario: 1800000, rotacion: 62 },
        { id: 'SKU009', nombre: 'Cámara Sony Alpha', stock: 6, valorUnitario: 2500000, rotacion: 58 },
        { id: 'SKU013', nombre: 'Monitor Curvo 32"', stock: 10, valorUnitario: 980000, rotacion: 68 },
      ],
    },
    'CAT002': {
      kpis: {
        stockTotal: 650,
        valorizado: 35000000,
        alertas: 4,
      },
      rotacion: [
        { mes: 'Ene', rotacion: 72 },
        { mes: 'Feb', rotacion: 75 },
        { mes: 'Mar', rotacion: 79 },
        { mes: 'Abr', rotacion: 82 },
        { mes: 'May', rotacion: 86 },
        { mes: 'Jun', rotacion: 89 },
      ],
      topSKUs: [
        { id: 'SKU002', nombre: 'Monitor Samsung 27"', stock: 45, valorUnitario: 450000, rotacion: 76 },
        { id: 'SKU013', nombre: 'Monitor Curvo 32"', stock: 10, valorUnitario: 980000, rotacion: 68 },
        { id: 'SKU015', nombre: 'Monitor LG UltraWide', stock: 8, valorUnitario: 1250000, rotacion: 65 },
        { id: 'SKU016', nombre: 'Proyector Epson', stock: 5, valorUnitario: 1850000, rotacion: 55 },
        { id: 'SKU017', nombre: 'Monitor Tactil Dell', stock: 7, valorUnitario: 1050000, rotacion: 62 },
      ],
    },
    'CAT003': {
      kpis: {
        stockTotal: 820,
        valorizado: 15000000,
        alertas: 3,
      },
      rotacion: [
        { mes: 'Ene', rotacion: 75 },
        { mes: 'Feb', rotacion: 78 },
        { mes: 'Mar', rotacion: 82 },
        { mes: 'Abr', rotacion: 85 },
        { mes: 'May', rotacion: 88 },
        { mes: 'Jun', rotacion: 92 },
      ],
      topSKUs: [
        { id: 'SKU003', nombre: 'Teclado Mecánico Logitech', stock: 36, valorUnitario: 120000, rotacion: 68 },
        { id: 'SKU004', nombre: 'Mouse Inalámbrico Microsoft', stock: 58, valorUnitario: 65000, rotacion: 92 },
        { id: 'SKU014', nombre: 'Teclado Inalámbrico Apple', stock: 12, valorUnitario: 420000, rotacion: 75 },
        { id: 'SKU018', nombre: 'Webcam Logitech HD', stock: 25, valorUnitario: 180000, rotacion: 82 },
        { id: 'SKU019', nombre: 'Audífonos Gamer Razer', stock: 18, valorUnitario: 350000, rotacion: 78 },
      ],
    },
    'CAT004': {
      kpis: {
        stockTotal: 320,
        valorizado: 58000000,
        alertas: 5,
      },
      rotacion: [
        { mes: 'Ene', rotacion: 45 },
        { mes: 'Feb', rotacion: 48 },
        { mes: 'Mar', rotacion: 52 },
        { mes: 'Abr', rotacion: 58 },
        { mes: 'May', rotacion: 62 },
        { mes: 'Jun', rotacion: 65 },
      ],
      topSKUs: [
        { id: 'SKU020', nombre: 'Escritorio Ejecutivo', stock: 8, valorUnitario: 750000, rotacion: 45 },
        { id: 'SKU021', nombre: 'Silla Ergonómica', stock: 15, valorUnitario: 580000, rotacion: 62 },
        { id: 'SKU022', nombre: 'Archivador Metálico', stock: 12, valorUnitario: 420000, rotacion: 38 },
        { id: 'SKU023', nombre: 'Mesa de Juntas', stock: 4, valorUnitario: 1850000, rotacion: 25 },
        { id: 'SKU024', nombre: 'Librero Modular', stock: 10, valorUnitario: 650000, rotacion: 48 },
      ],
    },
  };

  // Datos originales globales para el dashboard
  const datosOriginales = {
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
  };

  const handleFilterChange = (nuevosFiltros: { sucursal: string; categoria: string }) => {
    setFiltros(nuevosFiltros);
    
    // En una implementación real, aquí llamaríamos a la API para obtener los datos filtrados
    console.log('Aplicando filtros:', nuevosFiltros);
    
    // Si ambos filtros están vacíos, restaurar a los datos originales
    if (!nuevosFiltros.sucursal && !nuevosFiltros.categoria) {
      setDashboardData({...datosOriginales});
      return;
    }
    
    // Simulación de actualización de datos según los filtros seleccionados
    let nuevosDatos = {...datosOriginales};
    
    // Si se seleccionó una sucursal específica
    if (nuevosFiltros.sucursal) {
      nuevosDatos = datosPorSucursal[nuevosFiltros.sucursal] || nuevosDatos;
    }
    
    // Si se seleccionó una categoría específica (prioridad sobre la sucursal)
    if (nuevosFiltros.categoria) {
      nuevosDatos = datosPorCategoria[nuevosFiltros.categoria] || nuevosDatos;
    }
    
    // Si se seleccionaron ambos filtros (en un caso real, consultaríamos datos combinados)
    if (nuevosFiltros.sucursal && nuevosFiltros.categoria) {
      // Simulamos combinación de datos (en un caso real, esto vendría de la API)
      // Por ahora, simplemente reducimos un poco los valores para simular el filtrado combinado
      nuevosDatos = {
        ...nuevosDatos,
        kpis: {
          stockTotal: Math.floor(nuevosDatos.kpis.stockTotal * 0.8),
          valorizado: Math.floor(nuevosDatos.kpis.valorizado * 0.8),
          alertas: Math.floor(nuevosDatos.kpis.alertas * 0.8),
        }
      };
    }
    
    setDashboardData(nuevosDatos);
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
