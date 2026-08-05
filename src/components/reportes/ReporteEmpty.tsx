'use client';

import { FileBarChart } from 'lucide-react';

export function ReporteEmpty({ mensaje = 'Sin datos en este período' }: { mensaje?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
      <FileBarChart className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-sm">{mensaje}</p>
    </div>
  );
}
