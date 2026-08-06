'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import * as LucideIcons from 'lucide-react';
import type { ReportDefinition, CategoriaReporte } from '@/lib/services/reportes/types';

const CATEGORIA_VARIANT: Record<CategoriaReporte, 'default' | 'secondary' | 'outline' | 'info' | 'warning' | 'success'> = {
  operativo: 'info',
  financiero: 'default',
  contable: 'secondary',
  comercial: 'success',
  personas: 'warning',
  sistema: 'outline',
};

const CATEGORIA_LABEL: Record<CategoriaReporte, string> = {
  operativo: 'Operativo',
  financiero: 'Financiero',
  contable: 'Contable',
  comercial: 'Comercial',
  personas: 'Personas',
  sistema: 'Sistema',
};

interface ReporteCardProps {
  reporte: ReportDefinition;
  onClick: () => void;
}

export function ReporteCard({ reporte, onClick }: ReporteCardProps) {
  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all"
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
              {reporte.titulo}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {reporte.descripcion}
            </p>
          </div>
          <Badge variant={CATEGORIA_VARIANT[reporte.categoria]} className="shrink-0 text-[10px]">
            {CATEGORIA_LABEL[reporte.categoria]}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

/** Renderiza un icono lucide por nombre */
export function ModuloIcon({ name, className }: { name: string; className?: string }) {
  const icons = LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>;
  const Icon = icons[name];
  if (!Icon) return <LucideIcons.FileBarChart className={className} />;
  return <Icon className={className} />;
}
