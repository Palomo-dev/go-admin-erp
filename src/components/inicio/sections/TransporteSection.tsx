'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  DashboardStats,
  DashboardQuickActions,
  DashboardRecentEvents,
} from '@/components/transporte/dashboard';
import {
  transportService,
  type TransportStats,
} from '@/lib/services/transportService';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const CURRENCY_CODE = 'COP';

interface TransportEvent {
  id: string;
  reference_type: string;
  reference_id: string;
  event_type: string;
  event_time: string;
  latitude?: number;
  longitude?: number;
  location_text?: string;
  description?: string;
}

function buildExportData(
  stats: TransportStats | null,
  events: TransportEvent[],
): SectionExportData | null {
  if (!stats) return null;

  const totalTrips =
    stats.trips.scheduled +
    stats.trips.in_transit +
    stats.trips.completed +
    stats.trips.cancelled;
  const totalShipments =
    stats.shipments.ready +
    stats.shipments.in_transit +
    stats.shipments.delivered +
    stats.shipments.failed;

  const kpiList: SectionKPI[] = [
    { label: 'Viajes hoy', value: String(totalTrips), kind: 'neutro' },
    { label: 'Boletos vendidos', value: String(stats.tickets.sold_today), kind: 'ingreso' },
    {
      label: 'Ingresos boletos',
      value: formatCurrency(stats.tickets.revenue_today, CURRENCY_CODE),
      kind: 'ingreso',
    },
    { label: 'Ocupación media', value: `${stats.tickets.occupancy_avg}%`, kind: 'neutro' },
    { label: 'Envíos activos', value: String(totalShipments), kind: 'neutro' },
    { label: 'Envíos entregados', value: String(stats.shipments.delivered), kind: 'ingreso' },
    { label: 'Incidentes abiertos', value: String(stats.incidents.open), kind: 'egreso' },
    { label: 'Incidentes críticos', value: String(stats.incidents.critical), kind: 'egreso' },
  ];

  const filas: SectionDataRow[] = events.map((ev) => ({
    fecha: ev.event_time ? new Date(ev.event_time).toLocaleString('es-CO') : '',
    tipo: ev.event_type,
    descripcion: ev.description || '',
  }));

  return {
    titulo: 'Dashboard Transporte',
    periodo: 'Estado actual',
    kpis: kpiList,
    columnas: [
      { key: 'fecha', label: 'Fecha' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'descripcion', label: 'Descripción' },
    ],
    filas,
  };
}

export default function TransporteSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<TransportStats | null>(null);
  const [events, setEvents] = useState<TransportEvent[]>([]);
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
        const [statsData, eventsData, orgData] = await Promise.all([
          transportService.getStats(organizationId),
          transportService.getRecentEvents(organizationId, 10),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setStats(statsData);
        setEvents(eventsData as TransportEvent[]);

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
        console.error('Error cargando dashboard de transporte:', err);
        toastError('Error', 'No se pudo cargar el dashboard de transporte');
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
    () => buildExportData(stats, events),
    [stats, events],
  );

  return (
    <ModuloSection
      moduleCode="transport"
      moduleName="Transporte"
      icon={Truck}
      accentColor="text-amber-600 dark:text-amber-400"
      accentBg="bg-amber-100 dark:bg-amber-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <DashboardStats stats={stats} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DashboardQuickActions />
          <DashboardRecentEvents events={events} isLoading={isLoading} />
        </div>
      </div>
    </ModuloSection>
  );
}
