'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Car } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import { ParkingKPIs, SesionesActivas, PasesPorVencer } from '@/components/parking/dashboard';
import parkingDashboardService, {
  type ParkingDashboardStats,
  type ActiveSession,
  type ExpiringPass,
} from '@/lib/services/parkingDashboardService';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const CURRENCY_CODE = 'COP';
const PERIODO_LABEL = 'Estado actual';

function buildExportData(
  kpis: ParkingDashboardStats | null,
  sessions: ActiveSession[],
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Total espacios', value: String(kpis.totalSpaces), kind: 'neutro' },
    { label: 'Ocupados', value: String(kpis.occupiedSpaces), kind: 'egreso' },
    { label: 'Disponibles', value: String(kpis.freeSpaces), kind: 'ingreso' },
    { label: 'Sesiones activas', value: String(kpis.activeSessions), kind: 'neutro' },
    {
      label: 'Ingresos hoy',
      value: formatCurrency(kpis.revenueToday, CURRENCY_CODE),
      kind: 'ingreso',
    },
    { label: 'Pases activos', value: String(kpis.totalActivePasses), kind: 'neutro' },
    {
      label: 'Pases por vencer (7d)',
      value: String(kpis.expiringIn7Days),
      kind: 'egreso',
    },
    { label: 'Ocupación', value: `${kpis.occupancyRate}%`, kind: 'neutro' },
  ];

  const filas: SectionDataRow[] = sessions.map((s) => ({
    placa: s.vehicle_plate,
    tipo: s.vehicle_type,
    espacio: s.space_label || '-',
    zona: s.zone || '-',
    entrada: new Date(s.entry_at).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    duracion: `${Math.floor(s.duration_minutes / 60)}h ${s.duration_minutes % 60}m`,
    riesgo: s.is_at_risk ? 'Sí' : 'No',
  }));

  return {
    titulo: 'Dashboard Parking',
    periodo: PERIODO_LABEL,
    kpis: kpiList,
    columnas: [
      { key: 'placa', label: 'Placa' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'espacio', label: 'Espacio' },
      { key: 'zona', label: 'Zona' },
      { key: 'entrada', label: 'Entrada' },
      { key: 'duracion', label: 'Duración' },
      { key: 'riesgo', label: 'En riesgo', align: 'center' },
    ],
    filas,
  };
}

export default function ParkingSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<ParkingDashboardStats | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [expiringPasses, setExpiringPasses] = useState<ExpiringPass[]>([]);
  const [orgInfo, setOrgInfo] = useState<ExportOrganizationInfo | null>(null);

  useEffect(() => {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    const branchId = getCurrentBranchId();
    if (!branchId) {
      setIsLoading(false);
      return;
    }

    const resolvedBranchId: number = branchId;
    let cancelled = false;

    async function loadAll() {
      setIsLoading(true);
      try {
        const [statsData, sessionsData, passesData, orgData] = await Promise.all([
          parkingDashboardService.getDashboardStats(resolvedBranchId, organizationId),
          parkingDashboardService.getActiveSessions(resolvedBranchId, 20),
          parkingDashboardService.getExpiringPasses(organizationId, 30),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setKpis(statsData);
        setSessions(sessionsData);
        setExpiringPasses(passesData);

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
        console.error('Error cargando dashboard de parking:', err);
        toastError('Error', 'No se pudo cargar el dashboard de parking');
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
    () => buildExportData(kpis, sessions),
    [kpis, sessions],
  );

  return (
    <ModuloSection
      moduleCode="parking"
      moduleName="Parking"
      icon={Car}
      accentColor="text-cyan-600 dark:text-cyan-400"
      accentBg="bg-cyan-100 dark:bg-cyan-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <ParkingKPIs data={kpis} isLoading={isLoading} currencyCode={CURRENCY_CODE} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SesionesActivas
            sessions={sessions}
            atRiskCount={kpis?.atRiskSessions ?? 0}
            isLoading={isLoading}
          />
          <PasesPorVencer
            passes={expiringPasses}
            expiringIn7Days={kpis?.expiringIn7Days ?? 0}
            expiringIn15Days={kpis?.expiringIn15Days ?? 0}
            expiringIn30Days={kpis?.expiringIn30Days ?? 0}
            isLoading={isLoading}
          />
        </div>
      </div>
    </ModuloSection>
  );
}
