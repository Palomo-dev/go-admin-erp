'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  PosKPIs,
  TopProductos,
  VentasPorSucursal,
  SesionesCaja,
} from '@/components/pos/dashboard';
import { ReportesPage } from '@/components/pos/reportes';
import {
  posDashboardService,
  type PosKPIs as PosKPIsData,
  type TopProductoPos,
  type VentaSucursalPos,
  type SesionCajaPos,
} from '@/lib/services/posDashboardService';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const CURRENCY_CODE = 'COP';

function buildExportData(
  kpis: PosKPIsData | null,
  productos: TopProductoPos[],
  periodo: string,
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Ventas hoy', value: formatCurrency(kpis.totalVentasHoy, CURRENCY_CODE), kind: 'ingreso' },
    { label: 'Ventas del mes', value: formatCurrency(kpis.totalVentasMes, CURRENCY_CODE), kind: 'ingreso' },
    { label: 'Transacciones hoy', value: String(kpis.numTransaccionesHoy), kind: 'neutro' },
    { label: 'Ticket promedio', value: formatCurrency(kpis.ticketPromedio, CURRENCY_CODE), kind: 'ingreso' },
  ];

  const filas: SectionDataRow[] = productos.map((p) => ({
    producto: p.productName,
    cantidad: p.cantidad,
    total: formatCurrency(p.total, CURRENCY_CODE),
  }));

  return {
    titulo: 'Dashboard POS',
    periodo,
    kpis: kpiList,
    columnas: [
      { key: 'producto', label: 'Producto' },
      { key: 'cantidad', label: 'Cantidad', align: 'right' },
      { key: 'total', label: 'Total', align: 'right' },
    ],
    filas,
  };
}

export default function PosSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<PosKPIsData | null>(null);
  const [topProductos, setTopProductos] = useState<TopProductoPos[]>([]);
  const [ventasSucursal, setVentasSucursal] = useState<VentaSucursalPos[]>([]);
  const [sesionesCaja, setSesionesCaja] = useState<SesionCajaPos[]>([]);
  const [orgInfo, setOrgInfo] = useState<ExportOrganizationInfo | null>(null);

  const periodoLabel = 'Hoy';

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
          productosData,
          sucursalesData,
          sesionesData,
          orgData,
        ] = await Promise.all([
          posDashboardService.getKPIs(organizationId),
          posDashboardService.getTopProductos(organizationId, 5),
          posDashboardService.getVentasPorSucursal(organizationId),
          posDashboardService.getSesionesCaja(organizationId),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setKpis(kpisData);
        setTopProductos(productosData);
        setVentasSucursal(sucursalesData);
        setSesionesCaja(sesionesData);

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
        console.error('Error cargando dashboard de POS:', err);
        toastError('Error', 'No se pudo cargar el dashboard de POS');
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
    () => buildExportData(kpis, topProductos, periodoLabel),
    [kpis, topProductos],
  );

  return (
    <ModuloSection
      moduleCode="pos"
      moduleName="POS"
      icon={ShoppingCart}
      accentColor="text-violet-600 dark:text-violet-400"
      accentBg="bg-violet-100 dark:bg-violet-900/30"
      hasReportes
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
      reportesContent={<ReportesPage />}
    >
      <div className="space-y-6">
        <PosKPIs kpis={kpis} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopProductos productos={topProductos} isLoading={isLoading} />
          <VentasPorSucursal sucursales={ventasSucursal} isLoading={isLoading} />
        </div>

        <SesionesCaja sesiones={sesionesCaja} isLoading={isLoading} />
      </div>
    </ModuloSection>
  );
}
