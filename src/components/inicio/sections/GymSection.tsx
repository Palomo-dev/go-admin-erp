'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  GymStats,
  QuickActions,
  ExpiringMemberships,
} from '@/components/gym/dashboard';
import {
  getGymStats,
  getMemberships,
  getTodayCheckins,
  getDaysRemaining,
  type GymStats as GymStatsType,
  type Membership,
  type MemberCheckin,
} from '@/lib/services/gymService';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const CURRENCY_CODE = 'COP';
const PERIODO_LABEL = 'Estado actual';

const emptyStats: GymStatsType = {
  activeMemberships: 0,
  expiringIn7Days: 0,
  expiredMemberships: 0,
  todayCheckins: 0,
  todayRevenue: 0,
  weekRevenue: 0,
};

function buildExportData(
  stats: GymStatsType | null,
  memberships: Membership[],
): SectionExportData | null {
  if (!stats) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Membresías activas', value: String(stats.activeMemberships), kind: 'neutro' },
    { label: 'Vencen en 7 días', value: String(stats.expiringIn7Days), kind: 'neutro' },
    { label: 'Vencidas', value: String(stats.expiredMemberships), kind: 'neutro' },
    { label: 'Check-ins hoy', value: String(stats.todayCheckins), kind: 'neutro' },
    { label: 'Ingresos hoy', value: formatCurrency(stats.todayRevenue, CURRENCY_CODE), kind: 'ingreso' },
    { label: 'Ingresos semana', value: formatCurrency(stats.weekRevenue, CURRENCY_CODE), kind: 'ingreso' },
  ];

  const filas: SectionDataRow[] = memberships.map((m) => ({
    miembro: m.customers
      ? `${m.customers.first_name} ${m.customers.last_name}`.trim()
      : '—',
    plan: m.membership_plans?.name ?? '—',
    vence: formatDate(m.end_date),
    estado: m.status,
  }));

  return {
    titulo: 'Dashboard Gym',
    periodo: PERIODO_LABEL,
    kpis: kpiList,
    columnas: [
      { key: 'miembro', label: 'Miembro' },
      { key: 'plan', label: 'Plan' },
      { key: 'vence', label: 'Vence' },
      { key: 'estado', label: 'Estado' },
    ],
    filas,
  };
}

export default function GymSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<GymStatsType | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [, setTodayCheckins] = useState<MemberCheckin[]>([]);
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
        const [
          statsData,
          membershipsData,
          checkinsData,
          orgData,
        ] = await Promise.all([
          getGymStats(organizationId),
          getMemberships(organizationId),
          getTodayCheckins(organizationId),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setStats(statsData);
        setMemberships(membershipsData);
        setTodayCheckins(checkinsData);

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
        console.error('Error cargando dashboard de gym:', err);
        toastError('Error', 'No se pudo cargar el dashboard de gym');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  const expiringMemberships = useMemo(
    () => memberships.filter((m) => {
      const days = getDaysRemaining(m.end_date);
      return days <= 7 && m.status === 'active';
    }),
    [memberships],
  );

  const exportData = useMemo(
    () => buildExportData(stats, memberships),
    [stats, memberships],
  );

  return (
    <ModuloSection
      moduleCode="gym"
      moduleName="Gym"
      icon={Dumbbell}
      accentColor="text-orange-600 dark:text-orange-400"
      accentBg="bg-orange-100 dark:bg-orange-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <GymStats stats={stats ?? emptyStats} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ExpiringMemberships
            memberships={expiringMemberships}
            isLoading={isLoading}
          />
          <QuickActions />
        </div>
      </div>
    </ModuloSection>
  );
}
