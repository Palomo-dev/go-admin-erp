'use client';

/**
 * Wrapper reutilizable para una sección de módulo dentro del dashboard
 * unificado de /app/inicio.
 *
 * Funciones:
 *  - Ancla navegable (#crm, #finanzas, ...) para deep-linking
 *  - Header con icono + nombre del módulo + acciones de export (CSV/PDF)
 *  - Sub-tabs "Dashboard" | "Reportes" (si el módulo tiene reportes)
 *  - Render del contenido (componentes del dashboard del módulo)
 *  - Estado vacío si el módulo no tiene dashboard migrado aún
 *
 * El contenido real de cada módulo se inyecta via `children` o `content`.
 * La Fase 0 renderiza un placeholder; las Fases 1-15 inyectan el dashboard
 * real de cada módulo.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  dashboardSectionExport,
  type SectionExportData,
  type ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { ModoCompactoContext } from './DashboardModulos';

export interface ModuloSectionProps {
  /** Código del módulo (ej: 'crm', 'finance') */
  moduleCode: string;
  /** Nombre display del módulo (ej: "CRM") */
  moduleName: string;
  /** Icono Lucide del módulo */
  icon: React.ComponentType<{ className?: string }>;
  /** Color de acento tailwind para el icono (ej: 'text-blue-600') */
  accentColor?: string;
  /** Color de fondo del badge tailwind (ej: 'bg-blue-100') */
  accentBg?: string;
  /** Si el módulo tiene página de reportes (muestra sub-tab) */
  hasReportes?: boolean;
  /** Datos consolidados para export (lo provee cada módulo en su fase) */
  exportData?: SectionExportData | null;
  /** Info de la organización para el PDF */
  orgInfo?: ExportOrganizationInfo | null;
  /** Contenido del dashboard del módulo */
  children?: React.ReactNode;
  /** Contenido del sub-tab "Reportes" (si no se pasa, se muestra placeholder) */
  reportesContent?: React.ReactNode;
  /** Contenido del sub-tab "Métricas" (opcional, si el módulo tiene métricas avanzadas) */
  metricasContent?: React.ReactNode;
  /** Si la sección está cargando */
  isLoading?: boolean;
  /** Modo compacto: muestra solo header inline sin contenido expandido */
  compacto?: boolean;
}

export default function ModuloSection({
  moduleCode,
  moduleName,
  icon: Icon,
  accentColor = 'text-blue-600 dark:text-blue-400',
  accentBg = 'bg-blue-100 dark:bg-blue-900/30',
  hasReportes = false,
  exportData,
  orgInfo,
  children,
  reportesContent,
  metricasContent,
  isLoading = false,
  compacto: compactoProp = false,
}: ModuloSectionProps) {
  // Consumir modo compacto del context si no se pasa explícitamente
  const compactoContext = React.useContext(ModoCompactoContext);
  const compacto = compactoProp || compactoContext;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reportes' | 'metricas'>('dashboard');
  const [isExporting, setIsExporting] = useState<'csv' | 'pdf' | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Persistir estado de colapso en localStorage
  const STORAGE_KEY = `dashboard:section:${moduleCode}:collapsed`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setIsCollapsed(stored === 'true');
      } else if (compacto) {
        // En modo compacto, colapsar por defecto si no hay preferencia guardada
        setIsCollapsed(true);
      }
    } catch {
      // ignore
    }
  }, [STORAGE_KEY, compacto]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [STORAGE_KEY]);

  const handleExportCSV = useCallback(() => {
    if (!exportData) {
      toastError('Sin datos', 'No hay datos para exportar en esta sección');
      return;
    }
    try {
      setIsExporting('csv');
      dashboardSectionExport.exportToCSV(
        exportData,
        orgInfo?.name || 'Organización',
      );
      toastSuccess('CSV exportado', `${moduleName} — ${exportData.titulo}`);
    } catch (err) {
      console.error('Error exportando CSV:', err);
      toastError('Error', 'No se pudo generar el CSV');
    } finally {
      setIsExporting(null);
    }
  }, [exportData, orgInfo, moduleName]);

  const handleExportPDF = useCallback(async () => {
    if (!exportData) {
      toastError('Sin datos', 'No hay datos para exportar en esta sección');
      return;
    }
    // Fallback: si no hay orgInfo, usar uno minimal para que el PDF se genere
    const org = orgInfo ?? { name: 'Organización' };
    try {
      setIsExporting('pdf');
      await dashboardSectionExport.exportToPDF(exportData, org);
      toastSuccess('PDF exportado', `${moduleName} — ${exportData.titulo}`);
    } catch (err) {
      console.error('Error exportando PDF:', err);
      toastError('Error', 'No se pudo generar el PDF');
    } finally {
      setIsExporting(null);
    }
  }, [exportData, orgInfo, moduleName]);

  return (
    <section
      id={moduleCode}
      className="scroll-mt-20"
      aria-label={`Sección ${moduleName}`}
    >
      {/* Header de la sección */}
      <div className={cn(
        'flex items-center justify-between gap-3',
        compacto ? 'p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700' : 'flex-col sm:flex-row sm:items-center sm:justify-between mb-4',
      )}>
        <button
          type="button"
          onClick={toggleCollapse}
          className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
          aria-expanded={!isCollapsed}
          aria-controls={`${moduleCode}-content`}
        >
          <div className={cn('p-2 rounded-lg', accentBg)}>
            <Icon className={cn(compacto ? 'h-4 w-4' : 'h-5 w-5', accentColor)} />
          </div>
          <div className="flex items-center gap-2">
            <h2 className={cn('font-semibold text-gray-900 dark:text-white', compacto ? 'text-sm' : 'text-lg')}>
              {moduleName}
            </h2>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-gray-400 transition-transform',
                isCollapsed && '-rotate-90'
              )}
            />
          </div>
        </button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!exportData || isExporting !== null}
            className="border-gray-300 dark:border-gray-700"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            disabled={!exportData || isExporting !== null}
            className="border-gray-300 dark:border-gray-700"
          >
            <FileText className="h-4 w-4 mr-1.5" />
            PDF
          </Button>
        </div>
      </div>

      {/* Contenido colapsable */}
      {!isCollapsed && (
        <>
      {/* Sub-tabs Dashboard | Reportes (si aplica) */}
      {hasReportes && (
        <div className="flex items-center gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'dashboard'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
            )}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reportes')}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'reportes'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
            )}
          >
            Reportes
          </button>
          {metricasContent && (
            <button
              type="button"
              onClick={() => setActiveTab('metricas')}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === 'metricas'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              )}
            >
              Métricas
            </button>
          )}
        </div>
      )}

      {/* Contenido */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"
                />
              ))}
            </div>
            <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
        ) : children ? (
          activeTab === 'dashboard' ? (
            children
          ) : activeTab === 'metricas' && metricasContent ? (
            metricasContent
          ) : reportesContent ? (
            reportesContent
          ) : (
            <ReportesPlaceholder moduleName={moduleName} />
          )
        ) : (
          <NotMigratedPlaceholder moduleName={moduleName} moduleCode={moduleCode} />
        )}
      </div>
        </>
      )}
    </section>
  );
}

// ─── Placeholders ────────────────────────────────────────────────────────────

function NotMigratedPlaceholder({
  moduleName,
  moduleCode,
}: {
  moduleName: string;
  moduleCode: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full mb-3">
        <Download className="h-6 w-6 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {moduleName} — Dashboard en migración
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
        El dashboard de este módulo ({moduleCode}) se está consolidando en
        esta página. Mientras tanto, puedes acceder a sus funciones desde el
        menú lateral.
      </p>
    </div>
  );
}

function ReportesPlaceholder({ moduleName }: { moduleName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full mb-3">
        <FileText className="h-6 w-6 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Reportes de {moduleName} — En migración
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
        Los reportes de este módulo se están consolidando en esta página.
        Mientras tanto, accede a ellos desde el menú lateral.
      </p>
    </div>
  );
}
