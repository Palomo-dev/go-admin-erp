'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Banknote } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  KPICards,
  VentasComprasChart,
  AgingChart,
  FlujoProyectadoChart,
  AlertasCard,
  TopClientesProveedores,
  finanzasDashboardService,
  type KPIData,
  type TopClienteProveedor,
  type VentasComprasData,
  type AgingData,
  type FlujoProyectado,
  type Alerta,
  type DashboardFilters,
} from '@/components/finanzas/dashboard';
import { ReportesPage } from '@/components/finanzas/reportes';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';


function getDefaultFilters(): DashboardFilters {
  // Usar fecha local (no UTC) para que fechaFin sea el día actual en la
  // zona horaria del usuario, no el día siguiente/m anterior en UTC.
  const hoy = new Date();
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return {
    fechaInicio: fmt(hace30),
    fechaFin: fmt(hoy),
  };
}

function buildExportData(
  kpis: KPIData | null,
  clientes: TopClienteProveedor[],
  proveedores: TopClienteProveedor[],
  periodo: string,
  moneda: ContextoMoneda,
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Ingresos', value: formatMoneda(kpis.ingresos, moneda), kind: 'ingreso' },
    { label: 'Egresos', value: formatMoneda(kpis.egresos, moneda), kind: 'egreso' },
    { label: 'Utilidad bruta', value: formatMoneda(kpis.utilidadBruta, moneda), kind: 'ingreso' },
    { label: 'Cartera vencida', value: formatMoneda(kpis.carteraVencida, moneda), kind: 'neutro' },
    { label: 'Caja', value: formatMoneda(kpis.caja, moneda), kind: 'ingreso' },
    { label: 'Bancos', value: formatMoneda(kpis.bancos, moneda), kind: 'ingreso' },
    { label: 'Cuentas por cobrar', value: formatMoneda(kpis.cuentasPorCobrar, moneda), kind: 'neutro' },
    { label: 'Cuentas por pagar', value: formatMoneda(kpis.cuentasPorPagar, moneda), kind: 'egreso' },
  ];

  const filas: SectionDataRow[] = [
    ...clientes.map((c) => ({
      tipo: 'Cliente',
      nombre: c.nombre,
      monto: formatMoneda(c.monto, moneda),
    })),
    ...proveedores.map((p) => ({
      tipo: 'Proveedor',
      nombre: p.nombre,
      monto: formatMoneda(p.monto, moneda),
    })),
  ];

  return {
    titulo: 'Dashboard Finanzas',
    periodo,
    kpis: kpiList,
    columnas: [
      { key: 'tipo', label: 'Tipo' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'monto', label: 'Monto', align: 'right' },
    ],
    filas,
  };
}

export default function FinanzasSection() {
  // Montos en la moneda base de la organización (nunca pesos fijos).
  const moneda = useMonedaOrganizacion();
  const { branchFilter } = useBranch();
  const { timezone } = useOrgTimezone();
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [clientes, setClientes] = useState<TopClienteProveedor[]>([]);
  const [proveedores, setProveedores] = useState<TopClienteProveedor[]>([]);
  const [ventasCompras, setVentasCompras] = useState<VentasComprasData[]>([]);
  const [aging, setAging] = useState<AgingData[]>([]);
  const [flujo, setFlujo] = useState<FlujoProyectado[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [orgInfo, setOrgInfo] = useState<ExportOrganizationInfo | null>(null);

  const filters = useMemo(() => getDefaultFilters(), []);
  const periodoLabel = 'Últimos 30 días';

  useEffect(() => {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAll() {
      setIsLoading(true);
      try {
        const [
          kpisData,
          clientesData,
          proveedoresData,
          ventasComprasData,
          agingData,
          flujoData,
          alertasData,
          orgData,
        ] = await Promise.all([
          finanzasDashboardService.getKPIs(organizationId, filters, branchFilter, timezone),
          finanzasDashboardService.getTopClientes(organizationId, filters, 5, branchFilter),
          finanzasDashboardService.getTopProveedores(organizationId, filters, 5, branchFilter),
          finanzasDashboardService.getVentasVsCompras(organizationId, filters, branchFilter),
          finanzasDashboardService.getAgingCuentasPorCobrar(organizationId, branchFilter, timezone),
          finanzasDashboardService.getFlujoProyectado(organizationId, branchFilter, timezone),
          finanzasDashboardService.getAlertas(organizationId, branchFilter, timezone),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setKpis(kpisData);
        setClientes(clientesData);
        setProveedores(proveedoresData);
        setVentasCompras(ventasComprasData);
        setAging(agingData);
        setFlujo(flujoData);
        setAlertas(alertasData);

        if (orgData.data) {
          setOrgInfo({
            name: orgData.data.name || 'Organización',
            legalName: orgData.data.legal_name || undefined,
            nit: orgData.data.tax_id || undefined,
            city: orgData.data.city || undefined,
            address: orgData.data.address || undefined,
            phone: orgData.data.phone || undefined,
            email: orgData.data.email || undefined,
            logoUrl: orgData.data.logo_url || undefined,
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error cargando dashboard de finanzas:', err);
        toastError('Error', 'No se pudo cargar el dashboard de finanzas');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [filters, branchFilter]);

  const exportData = useMemo(
    () => buildExportData(kpis, clientes, proveedores, periodoLabel, moneda),
    [kpis, clientes, proveedores, moneda],
  );

  return (
    <ModuloSection
      moduleCode="finance"
      moduleName="Finanzas"
      icon={Banknote}
      accentColor="text-emerald-600 dark:text-emerald-400"
      accentBg="bg-emerald-100 dark:bg-emerald-900/30"
      hasReportes
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
      reportesContent={<ReportesPage />}
    >
      <div className="space-y-6">
        <KPICards data={kpis ?? emptyKPIs} isLoading={isLoading} currencyCode={moneda.code} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VentasComprasChart data={ventasCompras} isLoading={isLoading} currencyCode={moneda.code} />
          <AgingChart data={aging} isLoading={isLoading} currencyCode={moneda.code} />
        </div>

        <FlujoProyectadoChart data={flujo} isLoading={isLoading} currencyCode={moneda.code} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopClientesProveedores
            clientes={clientes}
            proveedores={proveedores}
            isLoading={isLoading}
            currencyCode={moneda.code}
          />
          <AlertasCard alertas={alertas} isLoading={isLoading} maxItems={5} />
        </div>
      </div>
    </ModuloSection>
  );
}

const emptyKPIs: KPIData = {
  ingresos: 0,
  egresos: 0,
  utilidadBruta: 0,
  carteraVencida: 0,
  caja: 0,
  bancos: 0,
  cuentasPorCobrar: 0,
  cuentasPorPagar: 0,
};
