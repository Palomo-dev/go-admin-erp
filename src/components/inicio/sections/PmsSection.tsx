'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Hotel } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  DashboardStats,
  AlertsPanel,
  ArrivalsCard,
  DeparturesCard,
  MiniCalendar,
} from '@/components/pms/dashboard';
import PMSDashboardService, {
  type DashboardStats as PmsStats,
  type TodayArrival,
  type TodayDeparture,
  type Alert as PmsAlert,
  type CalendarEvent,
} from '@/lib/services/pmsDashboardService';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

function buildExportData(
  stats: PmsStats | null,
  arrivals: TodayArrival[],
  departures: TodayDeparture[],
): SectionExportData | null {
  if (!stats) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Ocupación', value: `${stats.occupancy}%`, kind: 'neutro' },
    { label: 'Total espacios', value: String(stats.totalSpaces), kind: 'neutro' },
    { label: 'Disponibles', value: String(stats.available), kind: 'neutro' },
    { label: 'Limpieza', value: String(stats.cleaning), kind: 'neutro' },
    { label: 'Mantenimiento', value: String(stats.maintenance), kind: 'neutro' },
    { label: 'Llegadas hoy', value: String(stats.arrivalsToday), kind: 'neutro' },
    { label: 'Salidas hoy', value: String(stats.departuresToday), kind: 'neutro' },
  ];

  const filas: SectionDataRow[] = [
    ...arrivals.map((a) => ({
      tipo: 'Llegada',
      huesped: a.customerName,
      habitacion: a.spaces.join(', ') || 'Sin asignar',
      fecha: a.checkin || '',
      estado: a.status,
    })),
    ...departures.map((d) => ({
      tipo: 'Salida',
      huesped: d.customerName,
      habitacion: d.spaces.join(', ') || 'Sin asignar',
      fecha: d.checkout || '',
      estado: d.status,
    })),
  ];

  return {
    titulo: 'Dashboard PMS Hotel',
    periodo: 'Hoy',
    kpis: kpiList,
    columnas: [
      { key: 'tipo', label: 'Tipo' },
      { key: 'huesped', label: 'Huésped' },
      { key: 'habitacion', label: 'Hab.' },
      { key: 'fecha', label: 'Fecha' },
      { key: 'estado', label: 'Estado' },
    ],
    filas,
  };
}

export default function PmsSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<PmsStats | null>(null);
  const [arrivals, setArrivals] = useState<TodayArrival[]>([]);
  const [departures, setDepartures] = useState<TodayDeparture[]>([]);
  const [alerts, setAlerts] = useState<PmsAlert[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
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
          arrivalsData,
          departuresData,
          alertsData,
          eventsData,
          orgData,
        ] = await Promise.all([
          PMSDashboardService.getDashboardStats(organizationId),
          PMSDashboardService.getArrivals(organizationId),
          PMSDashboardService.getDepartures(organizationId),
          PMSDashboardService.getAlerts(organizationId),
          PMSDashboardService.getWeekCalendarEvents(organizationId),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setStats(statsData);
        setArrivals(arrivalsData);
        setDepartures(departuresData);
        setAlerts(alertsData);
        setEvents(eventsData);

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
        console.error('Error cargando dashboard de PMS Hotel:', err);
        toastError('Error', 'No se pudo cargar el dashboard de PMS Hotel');
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
    () => buildExportData(stats, arrivals, departures),
    [stats, arrivals, departures],
  );

  return (
    <ModuloSection
      moduleCode="pms_hotel"
      moduleName="PMS Hotel"
      icon={Hotel}
      accentColor="text-indigo-600 dark:text-indigo-400"
      accentBg="bg-indigo-100 dark:bg-indigo-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <DashboardStats
          arrivalsToday={stats?.arrivalsToday ?? 0}
          departuresToday={stats?.departuresToday ?? 0}
          occupancy={stats?.occupancy ?? 0}
          available={stats?.available ?? 0}
          cleaning={stats?.cleaning ?? 0}
          maintenance={stats?.maintenance ?? 0}
          totalSpaces={stats?.totalSpaces ?? 0}
          isLoading={isLoading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ArrivalsCard arrivals={arrivals} isLoading={isLoading} />
          <DeparturesCard departures={departures} isLoading={isLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AlertsPanel alerts={alerts} isLoading={isLoading} />
          <MiniCalendar events={events} isLoading={isLoading} />
        </div>
      </div>
    </ModuloSection>
  );
}
