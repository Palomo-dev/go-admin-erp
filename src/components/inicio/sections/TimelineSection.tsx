'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface OpsAuditEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  created_at: string;
}

interface TimelineKPIs {
  eventosHoy: number;
  eventosTotal: number;
  usuariosActivos: number;
  modulosMasActivos: number;
}

// ─── Mapeo de entity_type → etiqueta de módulo legible ───────────────────────

const ENTITY_TYPE_LABELS: Record<string, string> = {
  customers: 'CRM',
  accounts_receivable: 'Cuentas por cobrar',
  accounts_payable: 'Cuentas por pagar',
  table_sessions: 'POS / Mesas',
  cash_movements: 'Caja',
  shipments: 'Transporte',
  reservations: 'Reservas',
  rates: 'Tarifas',
  products: 'Inventario',
  sale_items: 'POS / Pedidos',
  sales: 'Ventas',
};

function getModuleLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] || entityType;
}

// ─── Mapeo de acción → etiqueta legible ──────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  create: 'Crear',
  CREATE: 'Crear',
  INSERT: 'Crear',
  update: 'Actualizar',
  UPDATE: 'Actualizar',
  delete: 'Eliminar',
  DELETE: 'Eliminar',
  RELEASE: 'Liberar',
  assign: 'Asignar',
  close: 'Cerrar',
  open: 'Abrir',
  approve: 'Aprobar',
  reject: 'Rechazar',
  void: 'Anular',
  transfer: 'Transferir',
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

// ─── Helpers de fechas ───────────────────────────────────────────────────────

function getDateRange(): { startIso: string; endIso: string; label: string } {
  const hoy = new Date();
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  return {
    startIso: hace30.toISOString(),
    endIso: hoy.toISOString(),
    label: 'Últimos 30 días',
  };
}

function formatEventDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Construcción de datos para export ───────────────────────────────────────

function buildExportData(
  kpis: TimelineKPIs | null,
  eventos: OpsAuditEvent[],
  userNames: Record<string, string>,
  periodo: string,
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Eventos hoy', value: String(kpis.eventosHoy), kind: 'neutro' },
    { label: 'Eventos totales', value: String(kpis.eventosTotal), kind: 'neutro' },
    { label: 'Usuarios activos', value: String(kpis.usuariosActivos), kind: 'neutro' },
    { label: 'Módulos más activos', value: String(kpis.modulosMasActivos), kind: 'neutro' },
  ];

  const filas: SectionDataRow[] = eventos.map((ev) => ({
    fecha: formatEventDate(ev.created_at),
    usuario: ev.user_id ? userNames[ev.user_id] || 'Usuario' : 'Sistema',
    accion: getActionLabel(ev.action),
    modulo: getModuleLabel(ev.entity_type),
  }));

  return {
    titulo: 'Dashboard Timeline',
    periodo,
    kpis: kpiList,
    columnas: [
      { key: 'fecha', label: 'Fecha' },
      { key: 'usuario', label: 'Usuario' },
      { key: 'accion', label: 'Acción' },
      { key: 'modulo', label: 'Módulo' },
    ],
    filas,
  };
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function TimelineSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<TimelineKPIs | null>(null);
  const [eventos, setEventos] = useState<OpsAuditEvent[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [orgInfo, setOrgInfo] = useState<ExportOrganizationInfo | null>(null);

  const { startIso, endIso, label: periodoLabel } = useMemo(() => getDateRange(), []);

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
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayIso = todayStart.toISOString();

        // Eventos recientes (últimos 30 días, top 50)
        const [
          eventosRes,
          totalRes,
          hoyRes,
          distinctRes,
          orgData,
        ] = await Promise.all([
          supabase
            .from('ops_audit_log')
            .select('id, action, entity_type, entity_id, user_id, created_at')
            .eq('organization_id', organizationId)
            .gte('created_at', startIso)
            .lte('created_at', endIso)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('ops_audit_log')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .gte('created_at', startIso)
            .lte('created_at', endIso),
          supabase
            .from('ops_audit_log')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .gte('created_at', todayIso),
          supabase
            .from('ops_audit_log')
            .select('user_id, entity_type')
            .eq('organization_id', organizationId)
            .gte('created_at', startIso)
            .lte('created_at', endIso),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        const eventosData = (eventosRes.data || []) as unknown as OpsAuditEvent[];
        setEventos(eventosData);

        // Calcular usuarios activos y módulos activos (distinct) en una sola pasada
        const uniqueUsers = new Set<string>();
        const entityCounts = new Map<string, number>();
        (distinctRes.data || []).forEach((row: { user_id: string | null; entity_type: string }) => {
          if (row.user_id) uniqueUsers.add(row.user_id);
          entityCounts.set(row.entity_type, (entityCounts.get(row.entity_type) || 0) + 1);
        });

        setKpis({
          eventosHoy: hoyRes.count || 0,
          eventosTotal: totalRes.count || 0,
          usuariosActivos: uniqueUsers.size,
          modulosMasActivos: entityCounts.size,
        });

        // Resolver nombres de usuarios
        const userIds = Array.from(
          new Set(eventosData.map((e) => e.user_id).filter((id): id is string => Boolean(id))),
        );
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', userIds);

          if (!cancelled && profiles) {
            const names: Record<string, string> = {};
            profiles.forEach((p: { id: string; first_name: string | null; last_name: string | null; email: string | null }) => {
              const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
              names[p.id] = fullName || p.email || 'Usuario';
            });
            setUserNames(names);
          }
        }

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
        console.error('Error cargando dashboard de timeline:', err);
        toastError('Error', 'No se pudo cargar el dashboard de timeline');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [startIso, endIso]);

  const exportData = useMemo(
    () => buildExportData(kpis, eventos, userNames, periodoLabel),
    [kpis, eventos, userNames, periodoLabel],
  );

  return (
    <ModuloSection
      moduleCode="operations"
      moduleName="Timeline"
      icon={Activity}
      accentColor="text-slate-600 dark:text-slate-400"
      accentBg="bg-slate-100 dark:bg-slate-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard label="Eventos hoy" value={kpis?.eventosHoy ?? 0} isLoading={isLoading} />
          <KPICard label="Eventos totales" value={kpis?.eventosTotal ?? 0} isLoading={isLoading} />
          <KPICard label="Usuarios activos" value={kpis?.usuariosActivos ?? 0} isLoading={isLoading} />
          <KPICard label="Módulos activos" value={kpis?.modulosMasActivos ?? 0} isLoading={isLoading} />
        </div>

        {/* Eventos recientes */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Eventos recientes
          </h3>
          {eventos.length === 0 && !isLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
              No hay eventos recientes para mostrar.
            </p>
          ) : (
            <div className="space-y-2">
              {eventos.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 p-1.5 rounded-md bg-slate-100 dark:bg-slate-800">
                      <Activity className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {getActionLabel(ev.action)}
                        <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                          {getModuleLabel(ev.entity_type)}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {ev.user_id ? userNames[ev.user_id] || 'Usuario' : 'Sistema'}
                      </p>
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {formatEventDate(ev.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModuloSection>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </p>
      {isLoading ? (
        <div className="h-6 mt-1 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16" />
      ) : (
        <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">
          {value.toLocaleString('es-CO')}
        </p>
      )}
    </div>
  );
}
