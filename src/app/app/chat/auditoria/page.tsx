'use client';

/**
 * Auditoría del chat (Figma 91-chat-41): quién cambió qué en conversaciones,
 * canales y conocimiento. Cifras, buscador, filtros (acción, sobre qué,
 * persona, fecha), tabla paginada en el servidor y detalle en hoja lateral.
 * Los nombres de las personas salen de `GET /api/chat/agentes` (organización
 * de la sesión).
 */
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Shield } from 'lucide-react';
import { AvatarIniciales, DataTable, FilaDato, KpiStrip, ListaDatos, PageHeader, Pagination, SearchInput, StatCard, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import ChatAuditService, { type AuditFilters, type AuditLog, type AuditStats } from '@/lib/services/chatAuditService';
import type { AgenteChat } from '@/lib/services/chat/agentesChat';
import {
  ACCIONES_AUDITORIA,
  ENTIDADES_AUDITORIA,
  celdaCsv,
  diasDeRangoAuditoria,
  humanizarAccion,
  iconoAccion,
  type RangoAuditoria,
} from '@/components/chat/audit/auditoriaLogica';

const TODAS = '__todas__';

export default function ChatAuditPage() {
  const t = useTranslations('chatModulo.auditoria');
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { getToday, toInstant, formatDateTime } = useFormatDate();

  const [registros, setRegistros] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [personas, setPersonas] = useState<AgenteChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [accion, setAccion] = useState(TODAS);
  const [entidad, setEntidad] = useState(TODAS);
  const [persona, setPersona] = useState(TODAS);
  const [rango, setRango] = useState<RangoAuditoria>('7d');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [abierto, setAbierto] = useState<AuditLog | null>(null);

  const hoy = getToday();
  const filtros = useMemo<AuditFilters>(() => {
    const dias = diasDeRangoAuditoria(rango);
    return {
      action: accion === TODAS ? undefined : accion,
      entityType: entidad === TODAS ? undefined : entidad,
      dateFrom: dias === null ? undefined : toInstant(addPlainDays(hoy, -dias)),
      search: busqueda || undefined,
    };
  }, [accion, entidad, rango, busqueda, hoy, toInstant]);

  useEffect(() => setPagina(1), [filtros, persona]);

  useEffect(() => {
    // Nombres de quien hizo cada cambio; si falla, se muestra el tipo de actor.
    fetch('/api/chat/agentes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j: { data?: AgenteChat[] }) => setPersonas(j.data ?? []))
      .catch(() => setPersonas([]));
  }, [organizationId]);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    setFallo(false);
    try {
      const s = new ChatAuditService(organizationId);
      const [r, st] = await Promise.all([
        // `persona` filtra en el cliente: el servicio no filtra por actor_id.
        s.getLogs(filtros, persona === TODAS ? tamano : 1000, persona === TODAS ? (pagina - 1) * tamano : 0),
        s.getStats({ hoy: toInstant(hoy), semana: toInstant(addPlainDays(hoy, -6)) }),
      ]);
      const filtrados = persona === TODAS ? r.logs : r.logs.filter((l) => l.actor_id === persona);
      setRegistros(persona === TODAS ? filtrados : filtrados.slice((pagina - 1) * tamano, pagina * tamano));
      setTotal(persona === TODAS ? r.total : filtrados.length);
      setStats(st);
    } catch (e) {
      console.error('Error cargando la auditoría:', e);
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId, filtros, persona, pagina, tamano, hoy, toInstant]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombrePersona = useCallback(
    (l: AuditLog) => personas.find((p) => p.userId === l.actor_id)?.nombre ?? (t.has(`actores.${l.actor_type}`) ? t(`actores.${l.actor_type}`) : l.actor_type),
    [personas, t],
  );
  const textoAccion = (a: string) => (t.has(`acciones.${a}`) ? t(`acciones.${a}`) : humanizarAccion(a));
  const textoEntidad = (e: string) => (t.has(`entidades.${e}`) ? t(`entidades.${e}`) : e);
  const detalleSobre = (l: AuditLog) => {
    const c = (l.changes ?? {}) as Record<string, unknown>;
    const nombre = c.channel_name ?? c.name ?? c.title ?? (l.metadata as Record<string, unknown> | null)?.name;
    return typeof nombre === 'string' && nombre ? `${textoEntidad(l.entity_type)} · ${nombre}` : textoEntidad(l.entity_type);
  };

  const exportar = async () => {
    if (!organizationId) return;
    setExportando(true);
    try {
      const datos = await new ChatAuditService(organizationId).exportLogs(filtros);
      const filas = (persona === TODAS ? datos : datos.filter((l) => l.actor_id === persona)).map((l) =>
        [l.id, formatDateTime(l.created_at), textoAccion(l.action), detalleSobre(l), nombrePersona(l), l.ip_address ?? '', l.changes ? JSON.stringify(l.changes) : ''].map(celdaCsv).join(','),
      );
      const cabecera = [t('csv.id'), t('csv.fecha'), t('csv.accion'), t('csv.sobre'), t('csv.quien'), t('csv.ip'), t('csv.cambios')].map(celdaCsv).join(',');
      const blob = new Blob(['﻿' + [cabecera, ...filas].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auditoria-chat-${hoy}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: t('toasts.exportado', { n: filas.length }) });
    } catch (e) {
      console.error('Error exportando la auditoría:', e);
      toast({ title: t('toasts.error'), variant: 'destructive' });
    } finally {
      setExportando(false);
    }
  };

  const columnas: ColumnaTabla<AuditLog>[] = [
    {
      id: 'que',
      encabezado: t('tabla.que'),
      celda: (l) => {
        const Icono = iconoAccion(l.action, l.entity_type);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
              <Icono className="size-4" strokeWidth={1.5} />
            </span>
            <span className="truncate text-sm text-fg">{textoAccion(l.action)}</span>
          </div>
        );
      },
    },
    { id: 'sobre', encabezado: t('tabla.sobre'), ancho: 260, ocultarDebajo: 'md', celda: (l) => <span className="truncate text-sm text-fg-secondary">{detalleSobre(l)}</span> },
    {
      id: 'quien',
      encabezado: t('tabla.quien'),
      ancho: 200,
      ocultarDebajo: 'sm',
      celda: (l) => (
        <div className="flex min-w-0 items-center gap-2">
          <AvatarIniciales nombre={nombrePersona(l)} tamano="sm" />
          <span className="truncate text-sm text-fg">{nombrePersona(l)}</span>
        </div>
      ),
    },
    { id: 'cuando', encabezado: t('tabla.cuando'), ancho: 170, celda: (l) => <span className="text-sm tabular-nums text-fg-secondary">{formatDateTime(l.created_at)}</span> },
  ];

  const canales = stats?.byEntity?.channel ?? 0;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Shield}
        cargando={cargando}
        acciones={
          <button type="button" onClick={exportar} disabled={exportando || total === 0} className={clasesBoton({ variante: 'secundario' })}>
            <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('exportar')}
          </button>
        }
        movil={{ accionesEnFila: true }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard etiqueta={t('kpis.registros')} valor={(stats?.total ?? 0).toLocaleString()} cargando={!stats && !fallo} />
        <StatCard etiqueta={t('kpis.hoy')} valor={(stats?.today ?? 0).toLocaleString()} cargando={!stats && !fallo} onClick={() => setRango('hoy')} />
        <StatCard etiqueta={t('kpis.semana')} valor={(stats?.thisWeek ?? 0).toLocaleString()} cargando={!stats && !fallo} onClick={() => setRango('7d')} />
        <StatCard etiqueta={t('kpis.canales')} valor={canales.toLocaleString()} cargando={!stats && !fallo} onClick={() => setEntidad('channel')} />
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} className="w-full sm:max-w-xs" />
        <Select value={accion} onValueChange={setAccion}>
          <SelectTrigger className="w-full sm:w-52" aria-label={t('filtros.accion')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>{t('filtros.accionTodas')}</SelectItem>
            {ACCIONES_AUDITORIA.map((a) => (
              <SelectItem key={a} value={a}>
                {textoAccion(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entidad} onValueChange={setEntidad}>
          <SelectTrigger className="w-full sm:w-48" aria-label={t('filtros.sobre')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>{t('filtros.sobreTodo')}</SelectItem>
            {ENTIDADES_AUDITORIA.map((e) => (
              <SelectItem key={e} value={e}>
                {textoEntidad(e)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={persona} onValueChange={setPersona}>
          <SelectTrigger className="w-full sm:w-48" aria-label={t('filtros.persona')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>{t('filtros.personaTodas')}</SelectItem>
            {personas.map((p) => (
              <SelectItem key={p.userId} value={p.userId}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rango} onValueChange={(v) => setRango(v as RangoAuditoria)}>
          <SelectTrigger className="w-full sm:w-40" aria-label={t('filtros.fecha')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['hoy', '7d', '30d', 'todo'] as const).map((r) => (
              <SelectItem key={r} value={r}>
                {t(`filtros.rangos.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<AuditLog>
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={registros}
        obtenerId={(l) => l.id}
        estado={fallo ? 'error' : cargando && registros.length === 0 ? 'cargando' : registros.length === 0 && (busqueda || accion !== TODAS || entidad !== TODAS || persona !== TODAS) ? 'sinResultados' : 'listo'}
        termino={busqueda}
        onReintentar={cargar}
        onLimpiarFiltros={() => {
          setBusqueda('');
          setAccion(TODAS);
          setEntidad(TODAS);
          setPersona(TODAS);
        }}
        onFilaClick={setAbierto}
        etiquetaFila={(l) => textoAccion(l.action)}
        vacio={{ titulo: t('vacioTitulo'), descripcion: t('vacioDescripcion') }}
        tarjetaMovil={(l) => (
          <button type="button" onClick={() => setAbierto(l)} className="flex w-full flex-col gap-1 rounded-xl border border-line bg-surface p-3 text-left">
            <span className="text-sm font-medium text-fg">{textoAccion(l.action)}</span>
            <span className="text-xs text-fg-muted">
              {detalleSobre(l)} · {nombrePersona(l)} · {formatDateTime(l.created_at)}
            </span>
          </button>
        )}
        pie={
          total > 0 ? (
            <Pagination
              pagina={pagina}
              tamano={tamano}
              total={total}
              sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.varios') }}
              onPaginaChange={setPagina}
              onTamanoChange={(n) => {
                setTamano(n);
                setPagina(1);
              }}
              cargando={cargando}
            />
          ) : undefined
        }
      />

      {abierto && (
        <HojaDetalle abierto onAbiertoChange={(a) => !a && setAbierto(null)} titulo={textoAccion(abierto.action)} subtitulo={formatDateTime(abierto.created_at)}>
          <div className="flex flex-col gap-4">
            <ListaDatos etiqueta={t('detalle.titulo')}>
              <FilaDato etiqueta={t('tabla.sobre')} valor={detalleSobre(abierto)} />
              <FilaDato etiqueta={t('tabla.quien')} valor={nombrePersona(abierto)} />
              <FilaDato etiqueta={t('detalle.tipoActor')} valor={t.has(`actores.${abierto.actor_type}`) ? t(`actores.${abierto.actor_type}`) : abierto.actor_type} />
              {abierto.ip_address && <FilaDato etiqueta={t('detalle.ip')} valor={abierto.ip_address} />}
            </ListaDatos>
            {abierto.changes && Object.keys(abierto.changes).length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-semibold text-fg">{t('detalle.cambios')}</p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-subtle p-3 font-mono text-xs text-fg-secondary">{JSON.stringify(abierto.changes, null, 2)}</pre>
              </div>
            )}
          </div>
        </HojaDetalle>
      )}
    </div>
  );
}
