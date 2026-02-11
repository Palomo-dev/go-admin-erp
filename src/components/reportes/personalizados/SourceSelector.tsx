'use client';

import { Database, ShoppingCart, Package, ArrowRightLeft, Hotel, Clock, Banknote, Shield, FileText } from 'lucide-react';
import { REPORT_SOURCES, type ReportSource } from './reportBuilderService';

interface SourceSelectorProps {
  selectedSourceId: string | null;
  onSelect: (sourceId: string) => void;
}

const sourceIcons: Record<string, any> = {
  ventas: ShoppingCart,
  productos: Package,
  movimientos: ArrowRightLeft,
  reservas: Hotel,
  asistencia: Clock,
  nomina: Banknote,
  auditoria: Shield,
  facturas: FileText,
};

const sourceColors: Record<string, string> = {
  ventas: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  productos: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  movimientos: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
  reservas: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  asistencia: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
  nomina: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  auditoria: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
  facturas: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
};

export function SourceSelector({ selectedSourceId, onSelect }: SourceSelectorProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Database className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">1. Selecciona la fuente de datos</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {REPORT_SOURCES.map((source) => {
          const Icon = sourceIcons[source.id] || Database;
          const isSelected = selectedSourceId === source.id;
          const colors = sourceColors[source.id] || sourceColors.ventas;
          return (
            <button
              key={source.id}
              onClick={() => onSelect(source.id)}
              className={`p-3 rounded-lg border text-center transition-all ${
                isSelected
                  ? `${colors} ring-2 ring-blue-500 dark:ring-blue-400`
                  : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600'
              }`}
            >
              <Icon className="h-5 w-5 mx-auto mb-1" />
              <span className="text-[11px] font-medium block">{source.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
