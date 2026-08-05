'use client';

import { useState, useMemo, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useActiveModules } from '@/hooks/useActiveModules';
import { useToast } from '@/components/ui/use-toast';
import {
  ReportesHeader,
  ReportesResumenGlobal,
  ModuloSection,
  ReporteSheet,
  ReportesSkeleton,
} from '@/components/reportes';
import { getReportesVisibles } from '@/lib/services/reportes/reportesCatalogo';
import { resolverPeriodo } from '@/lib/services/reportes/periodosService';
import { ejecutarReporte, ejecutarCierre } from '@/lib/services/reportes/reportesEngine';
import { pdfExportService, type OrganizationInfo } from '@/lib/services/reportes/pdfExportService';
import { ReportesChatSheet } from '@/components/reportes/chat/ReportesChatSheet';
import type { PeriodoCierre, ReportDefinition, ReportData } from '@/lib/services/reportes/types';

export default function ReportesPage() {
  const { organization } = useOrganization();
  const { activeModules } = useActiveModules(organization?.id);
  const { toast } = useToast();

  const [periodo, setPeriodo] = useState<PeriodoCierre>(() => resolverPeriodo('mensual'));
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedReporte, setSelectedReporte] = useState<ReportDefinition | null>(null);
  const [globalKPIs, setGlobalKPIs] = useState<ReportData[]>([]);

  const orgId = organization?.id ?? null;
  const moduleCodes = useMemo(
    () => activeModules.map((m) => m.code),
    [activeModules],
  );

  const modulosVisibles = useMemo(
    () => getReportesVisibles(moduleCodes),
    [moduleCodes, refreshKey],
  );

  // Cargar KPIs globales (reportes clave del período)
  const cargarKPIsGlobales = useCallback(async () => {
    if (!orgId) return;
    const idsClave = ['cierre-caja', 'ventas-periodo', 'stock-critico', 'crm-funnel', 'cxc-vencidas', 'clientes-crecimiento'];
    const reportesClave: ReportData[] = [];

    for (const id of idsClave) {
      const def = modulosVisibles
        .flatMap((m) => m.reportes)
        .find((r) => r.id === id);
      if (!def) continue;
      try {
        const data = await ejecutarReporte(def.id, orgId, periodo);
        reportesClave.push(data);
      } catch {
        // silencioso: si falla un KPI global no bloquea la página
      }
    }
    setGlobalKPIs(reportesClave);
  }, [orgId, periodo, modulosVisibles]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    await cargarKPIsGlobales();
    setIsRefreshing(false);
    toast({ title: 'Reportes actualizados' });
  }, [cargarKPIsGlobales, toast]);

  const handleReporteClick = useCallback((reporte: ReportDefinition) => {
    setSelectedReporte(reporte);
    setSheetOpen(true);
  }, []);

  const orgInfo: OrganizationInfo = {
    id: organization?.id ?? 0,
    name: organization?.name ?? 'Organización',
  };

  const handleExportCierre = useCallback(async () => {
    if (!orgId) return;
    setIsExporting(true);
    toast({ title: 'Generando cierre consolidado...', description: 'Ejecutando todos los reportes del período' });

    try {
      const { resultados } = await ejecutarCierre(orgId, periodo, moduleCodes);
      if (!resultados.length) {
        toast({ title: 'No hay reportes para exportar', description: 'No se encontraron datos en este período', variant: 'destructive' });
        return;
      }
      pdfExportService.descargarCierreConsolidado({
        periodo,
        reportes: resultados,
        org: orgInfo,
      });
      toast({ title: 'PDF del cierre generado', description: `${resultados.length} reportes incluidos` });
    } catch (err) {
      toast({ title: 'Error al generar el cierre', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [orgId, periodo, moduleCodes, orgInfo, toast]);

  const handleExportIndividual = useCallback((data: ReportData) => {
    try {
      pdfExportService.descargarReporte(data, orgInfo);
      toast({ title: 'PDF generado', description: data.titulo });
    } catch (err) {
      toast({ title: 'Error al generar PDF', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [orgInfo, toast]);

  if (!orgId) {
    return (
      <div className="p-6">
        <ReportesSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <ReportesHeader
        periodo={periodo}
        onPeriodoChange={setPeriodo}
        onRefresh={handleRefresh}
        onExportCierre={handleExportCierre}
        onOpenChat={() => setChatOpen(true)}
        isRefreshing={isRefreshing}
        isExporting={isExporting}
      />

      {isRefreshing ? (
        <ReportesSkeleton />
      ) : (
        <>
          <ReportesResumenGlobal reportes={globalKPIs} />

          <div className="space-y-6">
            {modulosVisibles.map((modulo) => (
              <ModuloSection
                key={modulo.code}
                modulo={modulo}
                onReporteClick={handleReporteClick}
              />
            ))}
          </div>
        </>
      )}

      <ReporteSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        reporte={selectedReporte}
        periodo={periodo}
        orgId={orgId}
        onExportPDF={handleExportIndividual}
      />

      <ReportesChatSheet
        open={chatOpen}
        onOpenChange={setChatOpen}
        organizationId={orgId}
        organizationName={organization?.name}
        userName="Usuario"
        userRole="admin"
        periodoActual={periodo}
        modulosActivos={moduleCodes}
      />
    </div>
  );
}
