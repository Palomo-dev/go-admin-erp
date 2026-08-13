'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Globe, MessageCircle, Facebook, Instagram, Send, Mail } from 'lucide-react';
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

interface ChatKPIs {
  sesionesActivas: number;
  mensajesHoy: number;
  canalesConectados: number;
  conversacionesPendientes: number;
}

interface CanalResumen {
  id: string;
  type: string;
  name: string;
  status: string;
}

interface SesionReciente {
  id: string;
  anon_id: string;
  device_type: string | null;
  current_page: string | null;
  is_active: boolean;
  last_seen_at: string;
  channel?: { name: string; type: string } | null;
}

const emptyKPIs: ChatKPIs = {
  sesionesActivas: 0,
  mensajesHoy: 0,
  canalesConectados: 0,
  conversacionesPendientes: 0,
};

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  website: Globe,
  whatsapp: MessageCircle,
  facebook: Facebook,
  instagram: Instagram,
  telegram: Send,
  email: Mail,
};

const CHANNEL_LABELS: Record<string, string> = {
  website: 'Sitio Web',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  email: 'Email',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getChannelIcon(type: string): React.ComponentType<{ className?: string }> {
  return CHANNEL_ICONS[type] || MessageSquare;
}

function getChannelLabel(type: string): string {
  return CHANNEL_LABELS[type] || type;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays} d`;
}

function buildExportData(
  kpis: ChatKPIs,
  sesiones: SesionReciente[],
): SectionExportData {
  const kpiList: SectionKPI[] = [
    { label: 'Sesiones activas', value: String(kpis.sesionesActivas), kind: 'ingreso' },
    { label: 'Mensajes hoy', value: String(kpis.mensajesHoy), kind: 'neutro' },
    { label: 'Canales conectados', value: String(kpis.canalesConectados), kind: 'ingreso' },
    { label: 'Conversaciones pendientes', value: String(kpis.conversacionesPendientes), kind: 'egreso' },
  ];

  const filas: SectionDataRow[] = sesiones.map((s) => ({
    canal: s.channel?.name || '—',
    visitante: s.anon_id,
    dispositivo: s.device_type || '—',
    pagina: s.current_page || '—',
    estado: s.is_active ? 'Activa' : 'Inactiva',
    ultima_actividad: formatRelativeTime(s.last_seen_at),
  }));

  if (filas.length === 0) {
    filas.push({
      canal: 'Sin sesiones recientes',
      visitante: '—',
      dispositivo: '—',
      pagina: '—',
      estado: '—',
      ultima_actividad: '—',
    });
  }

  return {
    titulo: 'Dashboard Chat',
    periodo: 'Tiempo real',
    kpis: kpiList,
    columnas: [
      { key: 'canal', label: 'Canal' },
      { key: 'visitante', label: 'Visitante' },
      { key: 'dispositivo', label: 'Dispositivo' },
      { key: 'pagina', label: 'Página' },
      { key: 'estado', label: 'Estado' },
      { key: 'ultima_actividad', label: 'Última actividad' },
    ],
    filas,
  };
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function ChatSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<ChatKPIs>(emptyKPIs);
  const [sesiones, setSesiones] = useState<SesionReciente[]>([]);
  const [canales, setCanales] = useState<CanalResumen[]>([]);
  const [hasData, setHasData] = useState(true);
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
        const inicioHoy = new Date();
        inicioHoy.setHours(0, 0, 0, 0);
        const isoHoy = inicioHoy.toISOString();

        const [
          sesionesActivasRes,
          mensajesHoyRes,
          canalesRes,
          conversacionesPendientesRes,
          sesionesRecientesRes,
          orgData,
        ] = await Promise.all([
          supabase
            .from('widget_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('is_active', true),
          supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .gte('created_at', isoHoy),
          supabase
            .from('channels')
            .select('id, type, name, status')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }),
          supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .in('status', ['open', 'pending']),
          supabase
            .from('widget_sessions')
            .select(`
              id,
              anon_id,
              device_type,
              current_page,
              is_active,
              last_seen_at,
              channel:channels ( name, type )
            `)
            .eq('organization_id', organizationId)
            .order('last_seen_at', { ascending: false, nullsFirst: false })
            .limit(5),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        // Si la tabla channels no existe o no retorna datos, marcar como sin configurar
        const canalesErr = canalesRes as { error?: { code?: string } | null };
        if (canalesErr.error && canalesErr.error.code === '42P01') {
          setHasData(false);
          setKpis(emptyKPIs);
          setCanales([]);
          setSesiones([]);
        } else {
          const canalesData = (canalesRes as { data?: CanalResumen[] }).data || [];
          const canalesConectados = canalesData.filter((c) => c.status === 'active').length;

          setKpis({
            sesionesActivas: sesionesActivasRes.count || 0,
            mensajesHoy: mensajesHoyRes.count || 0,
            canalesConectados,
            conversacionesPendientes: conversacionesPendientesRes.count || 0,
          });
          setCanales(canalesData);

          const sesionesRaw = (sesionesRecientesRes as { data?: Array<Record<string, unknown>> }).data || [];
          const sesionesData: SesionReciente[] = sesionesRaw.map((s) => {
            const channelArr = Array.isArray(s.channel) ? s.channel : null;
            const channel = channelArr && channelArr.length > 0
              ? { name: String(channelArr[0].name ?? ''), type: String(channelArr[0].type ?? '') }
              : null;
            return {
              id: String(s.id ?? ''),
              anon_id: String(s.anon_id ?? ''),
              device_type: (s.device_type as string | null) ?? null,
              current_page: (s.current_page as string | null) ?? null,
              is_active: Boolean(s.is_active),
              last_seen_at: String(s.last_seen_at ?? ''),
              channel,
            };
          });
          setSesiones(sesionesData);

          // Si no hay canales ni sesiones, mostrar mensaje informativo
          if (canalesData.length === 0 && sesionesData.length === 0) {
            setHasData(false);
          } else {
            setHasData(true);
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
        console.error('Error cargando dashboard de chat:', err);
        toastError('Error', 'No se pudo cargar el dashboard de chat');
        setHasData(false);
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
    () => buildExportData(kpis, sesiones),
    [kpis, sesiones],
  );

  return (
    <ModuloSection
      moduleCode="chat"
      moduleName="Chat"
      icon={MessageSquare}
      accentColor="text-pink-600 dark:text-pink-400"
      accentBg="bg-pink-100 dark:bg-pink-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard
            label="Sesiones activas"
            value={kpis.sesionesActivas}
            icon={MessageSquare}
            accent="text-pink-600 dark:text-pink-400"
          />
          <KPICard
            label="Mensajes hoy"
            value={kpis.mensajesHoy}
            icon={MessageCircle}
            accent="text-blue-600 dark:text-blue-400"
          />
          <KPICard
            label="Canales conectados"
            value={kpis.canalesConectados}
            icon={Globe}
            accent="text-emerald-600 dark:text-emerald-400"
          />
          <KPICard
            label="Convers. pendientes"
            value={kpis.conversacionesPendientes}
            icon={MessageSquare}
            accent="text-amber-600 dark:text-amber-400"
          />
        </div>

        {/* Estado vacío: sin canales configurados */}
        {!hasData && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="p-3 bg-pink-100 dark:bg-pink-900/30 rounded-full mb-3">
              <MessageSquare className="h-6 w-6 text-pink-600 dark:text-pink-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Sin canales configurados
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
              Configura tus canales de chat para ver estadísticas.
            </p>
          </div>
        )}

        {/* Sesiones activas recientes */}
        {hasData && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Sesiones activas recientes
            </h3>
            {sesiones.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                No hay sesiones recientes
              </div>
            ) : (
              <div className="space-y-2">
                {sesiones.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 bg-pink-100 dark:bg-pink-900/30 rounded-md shrink-0">
                        <MessageSquare className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {s.channel?.name || 'Canal desconocido'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {s.current_page || 'Sin página'} · {s.device_type || 'Desconocido'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          s.is_active
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-400'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            s.is_active ? 'bg-emerald-500' : 'bg-gray-400'
                          }`}
                        />
                        {s.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {formatRelativeTime(s.last_seen_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Canales disponibles */}
        {hasData && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Canales disponibles
            </h3>
            {canales.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                No hay canales configurados
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {canales.map((c) => {
              const Icon = getChannelIcon(c.type);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-md shrink-0">
                    <Icon className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {c.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {getChannelLabel(c.type)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium shrink-0 ${
                      c.status === 'active'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {c.status === 'active' ? 'Conectado' : 'Inactivo'}
                  </span>
                </div>
              );
            })}
              </div>
            )}
          </div>
        )}
      </div>
    </ModuloSection>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
