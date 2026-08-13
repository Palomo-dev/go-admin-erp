'use client';

import { Button } from '@/components/ui/button';
import { FileText, Plus, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function PageHeader() {
  const router = useRouter();

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="p-2 h-auto min-w-[36px] sm:min-w-[40px] hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
        </Button>
        <div className="flex-shrink-0 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Cotizaciones
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Gestiona cotizaciones de ventas
          </p>
        </div>
      </div>
      <Button
        onClick={() => router.push('/app/finanzas/cotizaciones/nuevo')}
        className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
      >
        <Plus className="h-4 w-4 mr-2" />
        Nueva Cotización
      </Button>
    </div>
  );
}
