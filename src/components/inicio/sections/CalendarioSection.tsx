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

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {value}
          </p>
        </div>
        <div className={`p-2 rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ProximosEventosList({ eventos }: { eventos: ProximoEvento[] }) {
  if (eventos.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500 dark:text-gray-400">
        <Calendar className="h-10 w-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No hay eventos próximos</p>
      </div>
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
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Eventos hoy"
            value={String(kpis?.eventosHoy ?? 0)}
            icon={Calendar}
            accent="bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
          />
          <KpiCard
            label="Esta semana"
            value={String(kpis?.eventosEstaSemana ?? 0)}
            icon={CalendarRange}
            accent="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          />
          <KpiCard
            label="Este mes"
            value={String(kpis?.eventosEsteMes ?? 0)}
            icon={CalendarDays}
            accent="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
          />
          <KpiCard
            label="Próximos"
            value={String(kpis?.proximosEventos ?? 0)}
            icon={Clock}
            accent="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Próximos eventos
          </h3>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
                />
              ))}
            </div>
          ) : (
            <ProximosEventosList eventos={eventos} />
          )}
        </div>
      </div>
    </ModuloSection>
  );
}
