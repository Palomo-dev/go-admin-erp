'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useActiveModules } from '@/hooks/useActiveModules';
import { useToast } from '@/components/ui/use-toast';
import {
  ReportesHeader,
  type ReportesTab,
  ReportesResumenGlobal,
  ModuloSection,
  ReporteSheet,
  ReportesSkeleton,
  CierresHistorial,
} from '@/components/reportes';
import { getReportesVisibles, getReporteById } from '@/lib/services/reportes/reportesCatalogo';
import { resolverPeriodo } from '@/lib/services/reportes/periodosService';
import { ejecutarReporte, ejecutarCierre } from '@/lib/services/reportes/reportesEngine';
import { pdfExportService, type OrganizationInfo } from '@/lib/services/reportes/pdfExportService';
import { ReportesChatSheet } from '@/components/reportes/chat/ReportesChatSheet';
import { registrarCierreConsolidado, obtenerHistorialCierres, obtenerDatosOrganizacion, generarNumeroDocumento, type CierreHistorico } from '@/lib/services/reportes/reportExecutionService';
import { supabase } from '@/lib/supabase/config';
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
  const [activeTab, setActiveTab] = useState<ReportesTab>('reportes');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedReporte, setSelectedReporte] = useState<ReportDefinition | null>(null);
  const [globalKPIs, setGlobalKPIs] = useState<ReportData[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [cierresHistorial, setCierresHistorial] = useState<CierreHistorico[]>([]);

  const orgId = organization?.id ?? null;
  const moduleCodes = useMemo(
    () => activeModules.map((m) => m.code),
    [activeModules],
  );

  const modulosVisibles = useMemo(
    () => getReportesVisibles(moduleCodes),
    [moduleCodes, refreshKey],
  );

  // Cargar KPIs globales (reportes clave del período) — en paralelo, filtrado por módulos activos
  const cargarKPIsGlobales = useCallback(async () => {
    if (!orgId) return;
    setKpisLoading(true);
    const idsClave = ['cierre-caja', 'ventas-periodo', 'stock-critico', 'crm-funnel', 'cxc-vencidas', 'clientes-crecimiento'];

    const activeModuleSet = new Set(moduleCodes);
    // Módulos core siempre visibles
    activeModuleSet.add('organizations');
    activeModuleSet.add('clientes');
    activeModuleSet.add('roles');

    const definiciones = idsClave
      .map((id) => getReporteById(id))
      .filter((def): def is ReportDefinition => def !== undefined)
      .filter((def) => activeModuleSet.has(def.modulo));

    const resultados = await Promise.allSettled(
      definiciones.map((def) => ejecutarReporte(def.id, orgId, periodo)),
    );

    const reportesClave: ReportData[] = [];
    for (const result of resultados) {
      if (result.status === 'fulfilled') reportesClave.push(result.value);
    }
    setGlobalKPIs(reportesClave);
    setKpisLoading(false);
  }, [orgId, periodo, moduleCodes]);

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
      // Obtener datos completos de la organización y número de documento
      const [orgData, docNum, { data: { user } }] = await Promise.all([
        obtenerDatosOrganizacion(orgId),
        generarNumeroDocumento(orgId, periodo),
        supabase.auth.getUser(),
      ]);

      const { resultados } = await ejecutarCierre(orgId, periodo, moduleCodes);
      if (!resultados.length) {
        toast({ title: 'No hay reportes para exportar', description: 'No se encontraron datos en este período', variant: 'destructive' });
        return;
      }

      const orgFull: OrganizationInfo = orgData
        ? {
            id: orgData.id,
            name: orgData.name,
            legalName: orgData.legalName,
            nit: orgData.nit,
            city: orgData.city,
            address: orgData.address,
            phone: orgData.phone,
            email: orgData.email,
            logoUrl: orgData.logoUrl,
            state: orgData.state,
            country: orgData.country,
          }
        : orgInfo;

      const usuarioNombre = user?.user_metadata?.full_name
        || user?.user_metadata?.name
        || user?.email
        || 'Sistema';

      await pdfExportService.descargarCierreConsolidado({
        periodo,
        reportes: resultados,
        org: orgFull,
        docNum,
        usuario: usuarioNombre,
      });

      // Fase 7: registrar cierre en report_executions
      const registro = await registrarCierreConsolidado({
        organizationId: orgId,
        periodo,
        modulos: moduleCodes,
        reportes: resultados,
        executedBy: user?.id,
      });
      if (!registro.success) {
        console.warn('No se pudo registrar el cierre en historial:', registro.error);
      } else {
        // Actualizar historial en UI
        const historial = await obtenerHistorialCierres(orgId);
        setCierresHistorial(historial);
      }

      toast({ title: 'PDF del cierre generado', description: `${resultados.length} reportes — Doc: ${docNum}` });
    } catch (err) {
      toast({ title: 'Error al generar el cierre', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [orgId, periodo, moduleCodes, orgInfo, toast]);

  const handleExportIndividual = useCallback((data: ReportData, comparisonData?: ReportData) => {
    try {
      pdfExportService.descargarReporte(data, orgInfo, comparisonData);
      toast({ title: 'PDF generado', description: comparisonData ? `${data.titulo} (con comparación)` : data.titulo });
    } catch (err) {
      toast({ title: 'Error al generar PDF', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [orgInfo, toast]);

  const handleDownloadCierrePDF = useCallback(async (cierre: CierreHistorico) => {
    if (!orgId) return;
    const params = cierre.params as { periodo?: PeriodoCierre; modulos?: string[] };
    const periodoCierre = params?.periodo;
    const modulos = params?.modulos ?? moduleCodes;
    if (!periodoCierre) {
      toast({ title: 'Error', description: 'El cierre no tiene datos de período', variant: 'destructive' });
      return;
    }

    try {
      const [orgData, docNum] = await Promise.all([
        obtenerDatosOrganizacion(orgId),
        generarNumeroDocumento(orgId, periodoCierre),
      ]);

      const { resultados } = await ejecutarCierre(orgId, periodoCierre, modulos);
      if (!resultados.length) {
        toast({ title: 'Sin datos', description: 'No se encontraron datos para este período', variant: 'destructive' });
        return;
      }

      const orgFull: OrganizationInfo = orgData
        ? {
            id: orgData.id,
            name: orgData.name,
            legalName: orgData.legalName,
            nit: orgData.nit,
            city: orgData.city,
            address: orgData.address,
            phone: orgData.phone,
            email: orgData.email,
            logoUrl: orgData.logoUrl,
            state: orgData.state,
            country: orgData.country,
          }
        : orgInfo;

      await pdfExportService.descargarCierreConsolidado({
        periodo: periodoCierre,
        reportes: resultados,
        org: orgFull,
        docNum,
      });

      toast({ title: 'PDF regenerado', description: `${resultados.length} reportes — ${periodoCierre.etiqueta}` });
    } catch (err) {
      toast({ title: 'Error al regenerar PDF', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [orgId, moduleCodes, orgInfo, toast]);

  // Cargar KPIs globales al montar y cuando cambie el período
  useEffect(() => {
    cargarKPIsGlobales();
  }, [cargarKPIsGlobales]);

  // Cargar historial de cierres al montar
  useEffect(() => {
    if (!orgId) return;
    obtenerHistorialCierres(orgId).then(setCierresHistorial);
  }, [orgId]);

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
        activeTab={activeTab}
        onTabChange={setActiveTab}
        historialCount={cierresHistorial.length}
      />

      {isRefreshing && activeTab === 'reportes' ? (
        <ReportesSkeleton />
      ) : activeTab === 'reportes' ? (
        <>
          <ReportesResumenGlobal reportes={globalKPIs} isLoading={kpisLoading} />

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
      ) : (
        <CierresHistorial cierres={cierresHistorial} onDownloadPDF={handleDownloadCierrePDF} />
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
