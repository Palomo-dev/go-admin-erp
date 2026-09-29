'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, MapPin, CalendarDays, CalendarRange } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toastError } from '@/components/ui/use-toast';
import { useLocale, useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, KpiStrip, StatCard, Tarjeta } from '@/components/kit';
import ModuloSection from '../ModuloSection';
import {
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_COLORS,
  type CalendarEvent,
  type EventSourceType,
} from '@/components/calendario';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const PERIODO_LABEL = 'Próximos eventos';

interface CalendarioKPIs {
  eventosHoy: number;
  eventosEstaSemana: number;
  eventosEsteMes: number;
  proximosEventos: number;
}

interface ProximoEvento {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  source_type: EventSourceType;
  location: string | null;
  status: CalendarEvent['status'];
}

function buildExportData(
  kpis: CalendarioKPIs | null,
  eventos: ProximoEvento[],
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Eventos hoy', value: String(kpis.eventosHoy), kind: 'ingreso' },
    { label: 'Esta semana', value: String(kpis.eventosEstaSemana), kind: 'neutro' },
    { label: 'Este mes', value: String(kpis.eventosEsteMes), kind: 'neutro' },
    { label: 'Próximos eventos', value: String(kpis.proximosEventos), kind: 'neutro' },
  ];

  const filas: SectionDataRow[] = eventos.map((e) => ({
    fecha: format(new Date(e.start_at), 'dd/MM/yyyy HH:mm'),
    titulo: e.title,
    tipo: SOURCE_TYPE_LABELS[e.source_type] || e.source_type,
    ubicacion: e.location || '-',
    estado: e.status || '-',
  }));

  return {
    titulo: 'Dashboard Calendario',
    periodo: PERIODO_LABEL,
    kpis: kpiList,
    columnas: [
      { key: 'fecha', label: 'Fecha' },
      { key: 'titulo', label: 'Título' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'ubicacion', label: 'Ubicación' },
      { key: 'estado', label: 'Estado', align: 'center' },
    ],
    filas,
  };
}

function ProximosEventosList({ eventos }: { eventos: ProximoEvento[] }) {
  const t = useTranslations('home.panel.calendario');
  if (eventos.length === 0) {
    return (
      <EmptyState compacto icono={Calendar} titulo={t('sinEventos')} descripcion={t('sinEventosDesc')} />
    );
  }

  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {eventos.map((evento) => {
        const color = SOURCE_TYPE_COLORS[evento.source_type] || '#3B82F6';
        const fecha = new Date(evento.start_at);
        return (
          <li key={evento.id} className="py-3 flex items-start gap-3">
            <div
              className="mt-1 flex-shrink-0 w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {evento.title}
                </p>
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${color}20`,
                    color,
                  }}
                >
                  {SOURCE_TYPE_LABELS[evento.source_type] || evento.source_type}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {evento.all_day
                    ? format(fecha, "dd 'de' MMMM", { locale: es })
                    : format(fecha, "dd/MM/yyyy 'a las' HH:mm", { locale: es })}
                </span>
                {evento.location && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3" />
                    {evento.location}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function CalendarioSection() {
  const t = useTranslations('home.panel.calendario');
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<CalendarioKPIs | null>(null);
  const [eventos, setEventos] = useState<ProximoEvento[]>([]);
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
        const ahora = new Date();
        const hoyStart = startOfDay(ahora).toISOString();
        const hoyEnd = endOfDay(ahora).toISOString();
        const semanaStart = startOfWeek(ahora, { weekStartsOn: 1 }).toISOString();
        const semanaEnd = endOfWeek(ahora, { weekStartsOn: 1 }).toISOString();
        const mesStart = startOfMonth(ahora).toISOString();
        const mesEnd = endOfMonth(ahora).toISOString();

        const baseQuery = (rangeStart: string, rangeEnd: string) =>
          supabase
            .from('calendar_unified')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .gte('start_at', rangeStart)
            .lte('start_at', rangeEnd);

        const [
          hoyRes,
          semanaRes,
          mesRes,
          proximosRes,
          orgData,
        ] = await Promise.all([
          baseQuery(hoyStart, hoyEnd),
          baseQuery(semanaStart, semanaEnd),
          baseQuery(mesStart, mesEnd),
          supabase
            .from('calendar_unified')
            .select(
              'source_id, title, start_at, end_at, all_day, source_type, status',
            )
            .eq('organization_id', organizationId)
            .gte('start_at', ahora.toISOString())
            .order('start_at', { ascending: true })
            .limit(10),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        const eventosProximos: ProximoEvento[] = (proximosRes.data || []).map(
          (row: Record<string, unknown>) => ({
            id: String(row.source_id || ''),
            title: String(row.title || ''),
            start_at: String(row.start_at || ''),
            end_at: (row.end_at as string | null) || null,
            all_day: Boolean(row.all_day),
            source_type: (row.source_type as EventSourceType) || 'calendar_event',
            location: null,
            status: (row.status as CalendarEvent['status']) || null,
          }),
        );

        setKpis({
          eventosHoy: hoyRes.count ?? 0,
          eventosEstaSemana: semanaRes.count ?? 0,
          eventosEsteMes: mesRes.count ?? 0,
          proximosEventos: eventosProximos.length,
        });
        setEventos(eventosProximos);

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
        console.error('Error cargando dashboard de calendario:', err);
        toastError('Error', 'No se pudo cargar el dashboard de calendario');
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
    () => buildExportData(kpis, eventos),
    [kpis, eventos],
  );

  return (
    <ModuloSection
      moduleCode="calendar"
      moduleName="Calendario"
      icon={Calendar}
      accentColor="text-teal-600 dark:text-teal-400"
      accentBg="bg-teal-100 dark:bg-teal-900/30"
      hasReportes={false}
      showBranchBadge={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <KpiStrip>
          <StatCard etiqueta={t('eventosHoy')} valor={(kpis?.eventosHoy ?? 0).toLocaleString(locale)} icono={Calendar} cargando={isLoading} />
          <StatCard etiqueta={t('estaSemana')} valor={(kpis?.eventosEstaSemana ?? 0).toLocaleString(locale)} icono={CalendarRange} cargando={isLoading} />
          <StatCard etiqueta={t('esteMes')} valor={(kpis?.eventosEsteMes ?? 0).toLocaleString(locale)} icono={CalendarDays} cargando={isLoading} />
          <StatCard etiqueta={t('proximos')} valor={(kpis?.proximosEventos ?? 0).toLocaleString(locale)} icono={Clock} cargando={isLoading} />
        </KpiStrip>

        <Tarjeta titulo={t('proximosEventos')}>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <ProximosEventosList eventos={eventos} />
          )}
        </Tarjeta>
      </div>
    </ModuloSection>
  );
}
