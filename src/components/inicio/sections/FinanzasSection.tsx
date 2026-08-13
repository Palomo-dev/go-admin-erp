'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Banknote } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
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

const CURRENCY_CODE = 'COP';

function getDefaultFilters(): DashboardFilters {
  const hoy = new Date();
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
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
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Ingresos', value: formatCurrency(kpis.ingresos, CURRENCY_CODE), kind: 'ingreso' },
    { label: 'Egresos', value: formatCurrency(kpis.egresos, CURRENCY_CODE), kind: 'egreso' },
    { label: 'Utilidad bruta', value: formatCurrency(kpis.utilidadBruta, CURRENCY_CODE), kind: 'ingreso' },
    { label: 'Cartera vencida', value: formatCurrency(kpis.carteraVencida, CURRENCY_CODE), kind: 'neutro' },
    { label: 'Caja', value: formatCurrency(kpis.caja, CURRENCY_CODE), kind: 'ingreso' },
    { label: 'Bancos', value: formatCurrency(kpis.bancos, CURRENCY_CODE), kind: 'ingreso' },
    { label: 'Cuentas por cobrar', value: formatCurrency(kpis.cuentasPorCobrar, CURRENCY_CODE), kind: 'neutro' },
    { label: 'Cuentas por pagar', value: formatCurrency(kpis.cuentasPorPagar, CURRENCY_CODE), kind: 'egreso' },
  ];

  const filas: SectionDataRow[] = [
    ...clientes.map((c) => ({
      tipo: 'Cliente',
      nombre: c.nombre,
      monto: formatCurrency(c.monto, CURRENCY_CODE),
    })),
    ...proveedores.map((p) => ({
      tipo: 'Proveedor',
      nombre: p.nombre,
      monto: formatCurrency(p.monto, CURRENCY_CODE),
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
          finanzasDashboardService.getKPIs(organizationId, filters),
          finanzasDashboardService.getTopClientes(organizationId, filters, 5),
          finanzasDashboardService.getTopProveedores(organizationId, filters, 5),
          finanzasDashboardService.getVentasVsCompras(organizationId, filters),
          finanzasDashboardService.getAgingCuentasPorCobrar(organizationId),
          finanzasDashboardService.getFlujoProyectado(organizationId),
          finanzasDashboardService.getAlertas(organizationId),
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
  }, [filters]);

  const exportData = useMemo(
    () => buildExportData(kpis, clientes, proveedores, periodoLabel),
    [kpis, clientes, proveedores],
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
        <KPICards data={kpis ?? emptyKPIs} isLoading={isLoading} currencyCode={CURRENCY_CODE} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VentasComprasChart data={ventasCompras} isLoading={isLoading} currencyCode={CURRENCY_CODE} />
          <AgingChart data={aging} isLoading={isLoading} currencyCode={CURRENCY_CODE} />
        </div>

        <FlujoProyectadoChart data={flujo} isLoading={isLoading} currencyCode={CURRENCY_CODE} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopClientesProveedores
            clientes={clientes}
            proveedores={proveedores}
            isLoading={isLoading}
            currencyCode={CURRENCY_CODE}
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
