'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  AlertasInventario,
  ResumenSucursales,
  MovimientosRecientes,
  ProduccionKPIs,
} from '@/components/inventario/dashboard';
import {
  inventoryDashboardService,
  type InventoryKPIs,
  type StockAlert,
  type RecentMovement,
  type BranchSummary,
} from '@/lib/services/inventoryDashboardService';
import { ReportesPage } from '@/components/inventario/reportes';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const CURRENCY_CODE = 'COP';
const PERIODO_LABEL = 'Estado actual';

function buildExportData(
  kpis: InventoryKPIs | null,
  branchSummaries: BranchSummary[],
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Total productos', value: String(kpis.totalProducts), kind: 'neutro' },
    { label: 'Productos activos', value: String(kpis.activeProducts), kind: 'neutro' },
    { label: 'Stock bajo', value: String(kpis.lowStockProducts), kind: 'neutro' },
    { label: 'Sin stock', value: String(kpis.outOfStockProducts), kind: 'neutro' },
    {
      label: 'Valor inventario',
      value: formatCurrency(kpis.totalInventoryValue, CURRENCY_CODE),
      kind: 'ingreso',
    },
    { label: 'Categorías', value: String(kpis.totalCategories), kind: 'neutro' },
  ];

  const filas: SectionDataRow[] = branchSummaries.map((b) => ({
    sucursal: b.branchName,
    stock: b.totalStock,
    lowStock: b.lowStockCount,
    outOfStock: b.outOfStockCount,
    valor: formatCurrency(b.inventoryValue, CURRENCY_CODE),
  }));

  return {
    titulo: 'Dashboard Inventario',
    periodo: PERIODO_LABEL,
    kpis: kpiList,
    columnas: [
      { key: 'sucursal', label: 'Sucursal' },
      { key: 'stock', label: 'Stock Total', align: 'right' },
      { key: 'lowStock', label: 'Stock Bajo', align: 'right' },
      { key: 'outOfStock', label: 'Sin Stock', align: 'right' },
      { key: 'valor', label: 'Valor Inventario', align: 'right' },
    ],
    filas,
  };
}

export default function InventarioSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<InventoryKPIs | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([]);
  const [branchSummaries, setBranchSummaries] = useState<BranchSummary[]>([]);
  const [orgInfo, setOrgInfo] = useState<ExportOrganizationInfo | null>(null);

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
        const [dashboardData, orgData] = await Promise.all([
          inventoryDashboardService.getDashboardData(organizationId),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setKpis(dashboardData.kpis);
        setAlerts(dashboardData.alerts);
        setRecentMovements(dashboardData.recentMovements);
        setBranchSummaries(dashboardData.branchSummaries);

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
        console.error('Error cargando dashboard de inventario:', err);
        toastError('Error', 'No se pudo cargar el dashboard de inventario');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  const exportData = useMemo(
    () => buildExportData(kpis, branchSummaries),
    [kpis, branchSummaries],
  );

  return (
    <ModuloSection
      moduleCode="inventory"
      moduleName="Inventario"
      icon={Package}
      accentColor="text-green-600 dark:text-green-400"
      accentBg="bg-green-100 dark:bg-green-900/30"
      hasReportes
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
      reportesContent={<ReportesPage />}
    >
      <div className="space-y-6">
        <ProduccionKPIs />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AlertasInventario alerts={alerts} isLoading={isLoading} />
          <ResumenSucursales summaries={branchSummaries} isLoading={isLoading} />
        </div>

        <MovimientosRecientes movements={recentMovements} isLoading={isLoading} />
      </div>
    </ModuloSection>
  );
}
