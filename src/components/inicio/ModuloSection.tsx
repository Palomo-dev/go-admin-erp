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
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { BranchBadgeActiva, EmptyState, RowActionsMenu, TabBar, idPanel, idPestana, type PestanaTab } from '@/components/kit';
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
  /**
   * Mostrar badge de sucursal activa (default: false). La sucursal ya la dice
   * el chip de la cabecera del inicio; repetirlo en cada una de las 15
   * secciones era ruido (Figma lo omite a propósito, patrón 9).
   */
  showBranchBadge?: boolean;
}

export default function ModuloSection({
  moduleCode,
  moduleName,
  icon: Icon,
  accentColor = 'text-brand',
  accentBg = 'bg-brand-tint',
  hasReportes = false,
  exportData,
  orgInfo,
  children,
  reportesContent,
  metricasContent,
  isLoading = false,
  compacto: compactoProp = false,
  showBranchBadge = false,
}: ModuloSectionProps) {
  // Consumir modo compacto del context si no se pasa explícitamente
  const compactoContext = React.useContext(ModoCompactoContext);
  const compacto = compactoProp || compactoContext;
  const t = useTranslations('home');
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
      toastError(t('section.noData'), t('section.noDataExport'));
      return;
    }
    try {
      setIsExporting('csv');
      dashboardSectionExport.exportToCSV(
        exportData,
        orgInfo?.name || t('section.organization'),
      );
      toastSuccess(t('section.csvExported'), `${moduleName} — ${exportData.titulo}`);
    } catch (err) {
      console.error('Error exportando CSV:', err);
      toastError(t('common.error'), t('section.csvError'));
    } finally {
      setIsExporting(null);
    }
  }, [exportData, orgInfo, moduleName, t]);

  const handleExportPDF = useCallback(async () => {
    if (!exportData) {
      toastError(t('section.noData'), t('section.noDataExport'));
      return;
    }
    // Fallback: si no hay orgInfo, usar uno minimal para que el PDF se genere
    const org = orgInfo ?? { name: t('section.organization') };
    try {
      setIsExporting('pdf');
      await dashboardSectionExport.exportToPDF(exportData, org);
      toastSuccess(t('section.pdfExported'), `${moduleName} — ${exportData.titulo}`);
    } catch (err) {
      console.error('Error exportando PDF:', err);
      toastError(t('common.error'), t('section.pdfError'));
    } finally {
      setIsExporting(null);
    }
  }, [exportData, orgInfo, moduleName, t]);

  type TabSeccion = 'dashboard' | 'reportes' | 'metricas';
  const idTabs = `${moduleCode}-tabs`;
  const pestanas: PestanaTab<TabSeccion>[] = [
    { valor: 'dashboard', etiqueta: t('section.dashboard') },
    { valor: 'reportes', etiqueta: t('section.reports') },
    ...(metricasContent ? [{ valor: 'metricas' as const, etiqueta: t('section.metrics') }] : []),
  ];
  const exportBloqueado = !exportData || isExporting !== null;
  const motivoExport = !exportData ? t('section.noDataExport') : undefined;

  return (
    <section
      id={moduleCode}
      className="scroll-mt-20"
      aria-label={t('section.ariaLabel', { name: moduleName })}
    >
      {/* Header de la sección */}
      <div className={cn(
        'flex items-center justify-between gap-3',
        compacto ? 'rounded-xl border border-line bg-surface p-3' : 'mb-4 flex-col sm:flex-row sm:items-center sm:justify-between',
      )}>
        <button
          type="button"
          onClick={toggleCollapse}
          className="flex items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-expanded={!isCollapsed}
          aria-controls={`${moduleCode}-content`}
        >
          <div className={cn('p-2 rounded-lg', accentBg)}>
            <Icon className={cn(compacto ? 'h-4 w-4' : 'h-5 w-5', accentColor)} />
          </div>
          <div className="flex items-center gap-2">
            <h2 className={cn('font-semibold text-fg', compacto ? 'text-sm' : 'text-lg')}>
              {moduleName}
            </h2>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-fg-muted transition-transform',
                isCollapsed && '-rotate-90'
              )}
            />
          </div>
        </button>

        {/* Exportar en «⋯» (Figma `FilaModulo` F.5): el motivo se lee cuando no hay datos */}
        <RowActionsMenu
          orientacion="horizontal"
          titulo={moduleName}
          acciones={[
            {
              id: 'csv',
              etiqueta: 'CSV',
              icono: FileSpreadsheet,
              onSelect: handleExportCSV,
              deshabilitada: exportBloqueado,
              motivo: motivoExport,
            },
            {
              id: 'pdf',
              etiqueta: 'PDF',
              icono: FileText,
              onSelect: handleExportPDF,
              deshabilitada: exportBloqueado,
              motivo: motivoExport,
            },
          ]}
        />
      </div>

      {/* Contenido colapsable */}
      {!isCollapsed && (
        <>
      {/* Sub-tabs Dashboard | Reportes | Métricas (si aplica), con el TabBar del kit */}
      {hasReportes && (
        <TabBar
          id={idTabs}
          etiqueta={moduleName}
          tamano="sm"
          pestanas={pestanas}
          valor={activeTab}
          onValorChange={setActiveTab}
          className="mb-4"
        />
      )}

      {/* Contenido */}
      <div
        className="rounded-xl border border-line bg-surface p-4 sm:p-5"
        {...(hasReportes
          ? { role: 'tabpanel', id: idPanel(idTabs, activeTab), 'aria-labelledby': idPestana(idTabs, activeTab) }
          : {})}
      >
        {showBranchBadge && (
          <div className="mb-4">
            <BranchBadgeActiva />
          </div>
        )}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : children ? (
          activeTab === 'dashboard' ? (
            children
          ) : activeTab === 'metricas' && metricasContent ? (
            metricasContent
          ) : reportesContent ? (
            reportesContent
          ) : (
            <ReportesPlaceholder moduleName={moduleName} t={t} />
          )
        ) : (
          <NotMigratedPlaceholder moduleName={moduleName} moduleCode={moduleCode} t={t} />
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
  t,
}: {
  moduleName: string;
  moduleCode: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <EmptyState
      compacto
      icono={Download}
      titulo={t('section.notMigratedTitle', { name: moduleName })}
      descripcion={t('section.notMigratedDesc', { code: moduleCode })}
    />
  );
}

function ReportesPlaceholder({
  moduleName,
  t,
}: {
  moduleName: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <EmptyState
      compacto
      icono={FileText}
      titulo={t('section.reportsMigratingTitle', { name: moduleName })}
      descripcion={t('section.reportsMigratingDesc')}
    />
  );
}
