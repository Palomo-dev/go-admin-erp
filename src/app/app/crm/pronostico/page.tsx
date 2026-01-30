'use client';

import { ForecastDashboard } from '@/components/crm/pronostico';

export default function PronosticoPage() {
  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pronóstico de Ventas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Visualiza proyecciones y metas de ventas
        </p>
      </div>

      {/* Dashboard */}
      <ForecastDashboard />
    </div>
  );
}
