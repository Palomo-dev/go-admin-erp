'use client';

/**
 * Tareas del cliente en la columna derecha de la ficha (Figma 06 Clientes,
 * «Barra lateral» 331:113188; vacío 772:21523):
 *
 * - «Tareas pendientes» con su conteo y «+ Nueva» (tarea rápida del CRM);
 * - cada tarea con prioridad, estado y vencimiento («Vence mañana», «En 3
 *   días»), contado en días calendario de la zona de la organización;
 * - «Tareas finalizadas» con su conteo;
 * - «Ver todas las tareas del cliente» despliega aquí mismo las pendientes que
 *   no caben y las finalizadas (Proyectos y tareas no filtra por cliente).
 *
 * Lee las tareas del cliente y las de sus oportunidades.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListPlus, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { TonoBadge } from '@/components/kit';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { diasParaVencer } from './fichaLogica';
import { mensajeError, useFechasFicha } from './useFechasFicha';

interface Tarea {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
}

interface PerfilUsuario {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
}

interface TareasSidebarProps {
  clienteId: string;
  organizationId: number;
  /** CRM ola 3A (Figma 772:21523): «+ Nueva» y «Crear la primera tarea» (`POST /api/crm/tasks`). */
  onNuevaTarea?: () => void;
  /** Cambia tras crear una tarea: se vuelve a leer. */
  recarga?: number;
}

/** Pendientes que se ven sin desplegar (Figma: dos o tres tarjetas). */
const VISIBLES = 3;

const PRIORIDAD: Record<string, { clave: string; tono: TonoBadge }> = {
  high: { clave: 'alta', tono: 'peligro' },
  medium: { clave: 'media', tono: 'advertencia' },
  low: { clave: 'baja', tono: 'informacion' },
};

const ESTADO: Record<string, string> = {
  pending: 'pendiente',
  in_progress: 'enProgreso',
  completed: 'completada',
  canceled: 'cancelada',
  cancelled: 'cancelada',
};

export default function TareasSidebar({ clienteId, organizationId, onNuevaTarea, recarga }: TareasSidebarProps) {
  const t = useTranslations('clientes.ficha');
  const tc = useTranslations('crm.fichaCliente.tareas');
  const { timezone } = useFechasFicha();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ mensaje: string | null } | null>(null);
  const [pendientes, setPendientes] = useState<Tarea[]>([]);
  const [finalizadas, setFinalizadas] = useState<Tarea[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [desplegado, setDesplegado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: oppsData } = await supabase.from('opportunities').select('id').eq('customer_id', clienteId).eq('organization_id', organizationId);
        const oppIds = (oppsData || []).map((o) => o.id);

        const { data: delCliente, error: errCliente } = await supabase
          .from('tasks')
          .select('id, title, description, due_date, status, priority, assigned_to')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId)
          .order('due_date', { ascending: true })
          .order('priority', { ascending: false });
        if (errCliente) throw errCliente;

        const mapa = new Map<string, Tarea>();
        for (const tarea of (delCliente ?? []) as Tarea[]) mapa.set(tarea.id, tarea);

        if (oppIds.length > 0) {
          const { data: deOportunidades, error: errOpp } = await supabase
            .from('tasks')
            .select('id, title, description, due_date, status, priority, assigned_to')
            .eq('related_to_type', 'opportunity')
            .in('related_to_id', oppIds)
            .eq('organization_id', organizationId)
            .order('due_date', { ascending: true })
            .order('priority', { ascending: false });
          if (errOpp) throw errOpp;
          for (const tarea of (deOportunidades ?? []) as Tarea[]) mapa.set(tarea.id, tarea);
        }

        const todas = Array.from(mapa.values());
        const ids = Array.from(new Set(todas.map((x) => x.assigned_to).filter((v): v is string => !!v)));
        const nombres: Record<string, string> = {};
        if (ids.length > 0) {
          const { data: perfiles, error: errPerfiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
          if (errPerfiles) throw errPerfiles;
          for (const p of (perfiles ?? []) as PerfilUsuario[]) nombres[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        }

        if (cancelado) return;
        setPendientes(todas.filter((x) => ['pending', 'in_progress'].includes(x.status)));
        setFinalizadas(todas.filter((x) => ['completed', 'canceled', 'cancelled'].includes(x.status)));
        setUsuarios(nombres);
      } catch (err) {
        console.error('Error al cargar tareas:', err);
        if (!cancelado) setError({ mensaje: mensajeError(err) });
      } finally {
        if (!cancelado) setLoading(false);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [clienteId, organizationId, recarga]);

  const vencimiento = (tarea: Tarea): { texto: string; tono: TonoBadge } | null => {
    const dias = diasParaVencer(tarea.due_date, timezone);
    if (dias === null) return null;
    if (dias < 0) return { texto: t('tareas.vence.vencida'), tono: 'peligro' };
    if (dias === 0) return { texto: t('tareas.vence.hoy'), tono: 'advertencia' };
    if (dias === 1) return { texto: t('tareas.vence.manana'), tono: 'advertencia' };
    return { texto: t('tareas.vence.enDias', { count: dias }), tono: 'informacion' };
  };

  const nombreAsignado = (id: string | null) => (id ? usuarios[id] || t('comun.usuario') : t('tareas.sinAsignar'));

  const tarjetaTarea = (tarea: Tarea, finalizada = false) => {
    const prioridad = PRIORIDAD[tarea.priority] ?? { clave: 'normal', tono: 'neutro' as TonoBadge };
    const vence = finalizada ? null : vencimiento(tarea);
    const claveEstado = ESTADO[tarea.status];
    return (
      <li key={tarea.id} className={`flex flex-col gap-1 rounded-lg bg-subtle px-2.5 py-2 ${finalizada ? 'opacity-75' : ''}`}>
        <p className="break-words text-xs font-semibold leading-[17px] text-fg">{tarea.title}</p>
        {tarea.description ? (
          <HtmlContentRenderer html={tarea.description} className="line-clamp-2 break-words text-[11px] leading-4 text-fg-secondary" />
        ) : (
          <p className="text-[11px] leading-4 text-fg-secondary">{nombreAsignado(tarea.assigned_to)}</p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {!finalizada && (
            <Badge tono={prioridad.tono} tamano="sm">
              {t(`tareas.prioridades.${prioridad.clave}`)}
            </Badge>
          )}
          <Badge tono="neutro" apariencia="contorno" tamano="sm" className="bg-surface">
            {claveEstado ? t(`tareas.estados.${claveEstado}`) : tarea.status}
          </Badge>
          {vence && (
            <Badge tono={vence.tono} apariencia="contorno" tamano="sm" className="bg-surface">
              {vence.texto}
            </Badge>
          )}
        </div>
      </li>
    );
  };

  const cabecera = (
    <div className="flex items-center gap-1.5">
      <h3 className="text-[13px] font-semibold leading-[19px] text-fg">{t('tareas.pendientes')}</h3>
      {!loading && !error && (
        <Badge tono="marca" apariencia="solido" tamano="sm">
          {pendientes.length}
        </Badge>
      )}
      <span className="flex-1" />
      {onNuevaTarea && (
        <button
          type="button"
          onClick={onNuevaTarea}
          className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {tc('nueva')}
        </button>
      )}
    </div>
  );

  const contenedor = 'flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3';

  if (loading) {
    return (
      <section aria-label={t('tareas.titulo')} aria-busy="true" className={contenedor}>
        {cabecera}
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
        ))}
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label={t('tareas.titulo')} className={contenedor}>
        {cabecera}
        <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-xs text-danger-text">
          {error.mensaje || t('tareas.errorCarga')}
        </p>
      </section>
    );
  }

  const visibles = desplegado ? pendientes : pendientes.slice(0, VISIBLES);
  const hayMas = pendientes.length > VISIBLES || finalizadas.length > 0;

  return (
    <section aria-label={t('tareas.titulo')} className={contenedor}>
      {cabecera}

      {pendientes.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[11px] leading-4 text-fg-muted">{t('tareas.sinPendientes')}</p>
          {onNuevaTarea && (
            <button
              type="button"
              onClick={onNuevaTarea}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ListPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {tc('primera')}
            </button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visibles.map((tarea) => tarjetaTarea(tarea))}
        </ul>
      )}

      <div className="flex items-center gap-1.5">
        <h4 className="text-xs font-medium leading-[17px] text-fg-secondary">{t('tareas.finalizadas')}</h4>
        <Badge tono="neutro" tamano="sm">
          {finalizadas.length}
        </Badge>
      </div>

      {desplegado && finalizadas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {finalizadas.map((tarea) => tarjetaTarea(tarea, true))}
        </ul>
      )}

      {hayMas && (
        <button
          type="button"
          onClick={() => setDesplegado((v) => !v)}
          aria-expanded={desplegado}
          className="self-start rounded text-xs font-medium leading-[17px] text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {desplegado ? t('tareas.verMenos') : t('tareas.verTodasCliente')}
        </button>
      )}
    </section>
  );
}
