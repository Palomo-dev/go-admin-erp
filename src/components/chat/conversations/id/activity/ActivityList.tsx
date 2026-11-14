'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeftRight, Check, Download, History, Sparkles, Tag, User, UserCheck, UserX, type LucideIcon } from 'lucide-react';
import { EmptyState, SearchInput, clasesBoton } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import type { ActivityItem } from '@/lib/services/conversationActivityService';
import type { AgenteChat } from '@/lib/services/chat/agentesChat';
import { humanizarAccion } from '@/components/chat/audit/auditoriaLogica';
import { coincideBusqueda } from '../comunLogica';
import { useMomentoCorto } from '../useMomentoCorto';
import {
  FILTROS_ACTIVIDAD,
  coincideFiltroActividad,
  describirActividad,
  esFiltroActividad,
  type FilaActividad,
  type FiltroActividad,
  type IconoActividad,
  type TonoActividad,
} from './actividadLogica';

interface ActivityListProps {
  activities: ActivityItem[];
  loading: boolean;
  /** Personas del Chat, para poner nombre a quien cambió algo. */
  agentes?: readonly AgenteChat[];
  /** «Exportar CSV» solo si el servidor lo permite (capacidades). */
  canExport?: boolean;
  /** Nombre del archivo CSV, sin extensión. */
  nombreCsv?: string;
}

const ICONOS: Record<IconoActividad, LucideIcon> = {
  estado: Check,
  asignacion: User,
  etiqueta: Tag,
  ia: Sparkles,
  auditoria: ArrowLeftRight,
  bloqueo: UserX,
  desbloqueo: UserCheck,
};

const TONOS: Record<TonoActividad, string> = {
  exito: 'bg-success-subtle text-success-text',
  informacion: 'bg-info-subtle text-info-text',
  advertencia: 'bg-warning-subtle text-warning-text',
  marca: 'bg-brand-tint text-brand',
  neutro: 'bg-subtle text-fg-secondary',
  peligro: 'bg-danger-subtle text-danger-text',
};

/**
 * Lista de la pestaña «Actividad» (Figma 91-chat-11): buscador, filtro por
 * tipo y «Exportar CSV» en una fila; debajo, una tarjeta con una fila por
 * evento (icono con tono, qué pasó, detalle y cuándo).
 */
export default function ActivityList({ activities, loading, agentes = [], canExport = false, nombreCsv = 'actividad' }: ActivityListProps) {
  const t = useTranslations('chatHilo.actividad');
  const tCifras = useTranslations('chatBandeja.actividad');
  const tEstado = useTranslations('chatUi.estado');
  const tTrabajos = useTranslations('chatModulo.ia.trabajos');
  const tAcciones = useTranslations('chatModulo.auditoria.acciones');
  const locale = useLocale();
  const momento = useMomentoCorto();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroActividad>('todas');

  const filas = useMemo(() => {
    const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    const entero = new Intl.NumberFormat(locale);
    const porMiembro = new Map(agentes.map((a) => [a.memberId, a.nombre]));
    const porUsuario = new Map(agentes.map((a) => [a.userId, a.nombre]));
    return activities.map((a) =>
      describirActividad(a, {
        t: (clave, valores) => t(clave, valores),
        nombreMiembro: (id) => porMiembro.get(id) ?? null,
        nombreUsuario: (id) => porUsuario.get(id) ?? null,
        estado: (c) => (tEstado.has(c) ? tEstado(c) : c),
        tipoTrabajo: (c) => (tTrabajos.has(`tipos.${c}`) ? tTrabajos(`tipos.${c}`) : c),
        estadoTrabajo: (c) => (tTrabajos.has(`estados.${c}`) ? tTrabajos(`estados.${c}`) : c),
        accion: (c) => (tAcciones.has(c) ? tAcciones(c) : humanizarAccion(c)),
        decimal: (n) => decimal.format(n),
        entero: (n) => entero.format(n),
      }),
    );
  }, [activities, agentes, locale, t, tEstado, tTrabajos, tAcciones]);

  const visibles = useMemo(
    () => filas.filter((f) => coincideFiltroActividad(f.tipo, filtro) && coincideBusqueda([f.titulo, f.detalle, f.actor], busqueda)),
    [filas, filtro, busqueda],
  );

  const exportar = useCallback(() => {
    const encabezados = [t('csv.fecha'), t('csv.tipo'), t('csv.actor'), t('csv.descripcion'), t('csv.detalle')];
    const cuerpo = visibles.map((f: FilaActividad) => [momento(f.instante).largo, t(`tipos.${f.tipo}`), f.actor, f.titulo, f.detalle ?? '']);
    descargarCsv(`${nombreCsv}.csv`, aCsv([encabezados, ...cuerpo]));
  }, [visibles, momento, nombreCsv, t]);

  const hayFiltros = filtro !== 'todas' || busqueda.trim() !== '';

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-3 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          onValueChange={setBusqueda}
          placeholder={t('buscar')}
          etiqueta={t('buscar')}
          tamano="sm"
          className="w-full sm:max-w-xs"
        />
        <Select value={filtro} onValueChange={(v) => esFiltroActividad(v) && setFiltro(v)}>
          <SelectTrigger className="h-8 w-full sm:w-56" aria-label={t('filtroEtiqueta')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS_ACTIVIDAD.map((f) => (
              <SelectItem key={f} value={f}>
                {t(`filtros.${f}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canExport ? (
          <button
            type="button"
            onClick={exportar}
            disabled={loading || visibles.length === 0}
            className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'sm:ml-auto')}
          >
            <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {tCifras('exportar')}
          </button>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? '' : t('conteo', { visibles: visibles.length, total: filas.length })}
      </p>

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : visibles.length === 0 ? (
        hayFiltros ? (
          <EmptyState
            variante="search"
            titulo={t('sinResultadosTitulo')}
            descripcion={t('sinResultadosDescripcion')}
            termino={busqueda || undefined}
            onLimpiarFiltros={() => {
              setBusqueda('');
              setFiltro('todas');
            }}
          />
        ) : (
          <EmptyState icono={History} titulo={t('vacioTitulo')} descripcion={t('vacioDescripcion')} />
        )
      ) : (
        <ul aria-label={t('lista')} className="overflow-hidden rounded-xl border border-line bg-surface">
          {visibles.map((f) => {
            const Icono = ICONOS[f.icono];
            const cuando = momento(f.instante);
            return (
              <li key={`${f.tipo}-${f.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', TONOS[f.tono])}>
                  <Icono className="size-4" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{f.titulo}</p>
                  {f.detalle ? <p className="truncate text-xs text-fg-muted">{f.detalle}</p> : null}
                </div>
                <time dateTime={f.instante} title={cuando.largo} className="shrink-0 text-xs tabular-nums text-fg-muted">
                  {cuando.corto}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
