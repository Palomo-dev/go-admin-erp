'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Check, CheckCircle2, ClipboardCheck, ListPlus, Pencil, Plus, RotateCcw, Settings2, Trash2, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { EmptyState } from '@/components/kit/EmptyState';
import { Dialogo } from '@/components/kit/Dialogo';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { clasesBoton } from '@/components/kit/botonClases';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CampoFechaHora } from '@/components/crm/kit/CampoFechaHora';
import { aFechaHoraLocal, deFechaHoraLocal } from '@/components/crm/kit/fechasCrm';
import { TaskDialog } from '@/components/crm/shared/TaskDialog';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { crmTaskService } from '@/lib/services/crm/taskService';
import type { PMTask } from '@/lib/services/pmService';
import type { TareaOportunidad } from '@/lib/services/crm/tareasOportunidadService';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { lineaTarea, lineaTareaDetalle, separarTareas } from './pestanasLogica';

/**
 * Pestaña «Tareas» de la oportunidad (Figma 822:235333 drawer, 775:473990
 * detalle, vacío 823:245617, móvil 824:171483): «Nueva tarea… (Enter para
 * crear)» + «Avanzado», «Pendientes · N» y «Hechas · N», vencida en rojo y
 * menú «⋯» (Editar, Marcar como hecha, Cambiar responsable, Cambiar
 * vencimiento, Eliminar…). Lee `GET /api/crm/tasks?opportunity_id=`; escribe
 * por el servicio único de tareas (`crmTaskService`, CLAUDE.md regla 7).
 */
export interface PestanaTareasProps {
  oportunidadId: string;
  clienteId?: string | null;
  usuarios: readonly OpcionUsuario[];
  usuarioId: string | null;
  onConteo?: (pendientes: number) => void;
  /** `detalle` = tarjeta «Tareas de la oportunidad» con estado por fila (Figma 775:473990). */
  variante?: 'drawer' | 'detalle';
}

const TONO_ESTADO: Record<'pendiente' | 'vencida' | 'completada', TonoBadge> = { pendiente: 'neutro', vencida: 'peligro', completada: 'exito' };

type DialogoTarea = { tipo: 'responsable' | 'vencimiento' | 'eliminar'; tarea: TareaOportunidad } | null;

export function PestanaTareas({ oportunidadId, clienteId, usuarios, usuarioId, onConteo, variante = 'drawer' }: PestanaTareasProps) {
  const t = useTranslations('crm.oportunidad.pestanas.tareas');
  const td = useTranslations('crm.oportunidad.pestanas.tareas.detalle');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const [tareas, setTareas] = useState<TareaOportunidad[] | null>(null);
  const [error, setError] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [creando, setCreando] = useState(false);
  const [formulario, setFormulario] = useState<{ modo: 'full'; tarea: TareaOportunidad | null } | null>(null);
  const [dialogo, setDialogo] = useState<DialogoTarea>(null);
  const [valor, setValor] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const conteoRef = useRef(onConteo);
  conteoRef.current = onConteo;

  const cargar = useCallback(async () => {
    try {
      const { data } = await pedirCrm<TareaOportunidad[]>(`/api/crm/tasks?opportunity_id=${encodeURIComponent(oportunidadId)}`);
      setTareas(data ?? []);
      setError(false);
      conteoRef.current?.(separarTareas(data ?? []).pendientes.length);
    } catch {
      setError(true);
    }
  }, [oportunidadId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hacer = async (accion: () => Promise<void>, ok: string) => {
    setOcupado(true);
    try {
      await accion();
      toast({ title: ok });
      setDialogo(null);
      await cargar();
    } catch (e) {
      toast({ title: t('error'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };
  const crear = async () => {
    if (!titulo.trim()) return;
    setCreando(true);
    try {
      await crmTaskService.createTask({ title: titulo, related_to_type: 'opportunity', related_to_id: oportunidadId, customer_id: clienteId ?? null, assigned_to: usuarioId, type: 'crm' });
      setTitulo('');
      toast({ title: t('creada') });
      await cargar();
    } catch (e) {
      toast({ title: t('errorCrear'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setCreando(false);
    }
  };
  const alternar = (x: TareaOportunidad) => void hacer(() => crmTaskService.setTaskStatus(x.id, x.status === 'done' ? 'open' : 'done'), t(x.status === 'done' ? 'reabiertaToast' : 'hechaToast'));
  const abrir = (tipo: 'responsable' | 'vencimiento' | 'eliminar', x: TareaOportunidad) => {
    setValor(tipo === 'responsable' ? x.assigned_to ?? '' : tipo === 'vencimiento' ? aFechaHoraLocal(x.due_date, timezone) : '');
    setDialogo({ tipo, tarea: x });
  };

  if (error && !tareas) {
    return <div className="rounded-xl border border-line bg-surface"><EmptyState variante="error" compacto titulo={t('errorCarga')} onReintentar={() => void cargar()} /></div>;
  }
  if (!tareas) return <div aria-busy="true" className="flex flex-col gap-2">{[40, 56, 56].map((h, i) => <div key={i} className="animate-pulse rounded-xl bg-subtle" style={{ height: h }} />)}</div>;

  const { pendientes, hechas } = separarTareas(tareas);
  const ahora = new Date();
  const fila = (x: TareaOportunidad) => {
    const hecha = x.status === 'done';
    const linea = lineaTarea(x, ahora, timezone, idioma, t);
    return (
      <li key={x.id} className={cn('flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5', linea.vencida ? 'border-line-danger' : 'border-line')}>
        <button type="button" onClick={() => alternar(x)} disabled={ocupado} aria-pressed={hecha} aria-label={t(hecha ? 'reabrirAria' : 'marcarAria', { titulo: x.title })} className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', hecha ? 'border-success bg-success text-fg-on-brand' : 'border-line-strong bg-surface hover:border-brand')}>
          {hecha && <Check aria-hidden="true" className="size-3" strokeWidth={3} />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={cn('truncate text-sm font-medium', hecha ? 'text-fg-muted line-through' : 'text-fg')}>{x.title}</span>
          <span className={cn('inline-flex items-center gap-1 text-xs', linea.vencida ? 'text-danger-text' : 'text-fg-secondary')}>
            <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{linea.texto}</span>
          </span>
        </div>
        {!hecha && x.responsable && <span title={x.responsable}><AvatarIniciales nombre={x.responsable} tamano="sm" className="size-7 text-[11px]" /></span>}
        {menu(x)}
      </li>
    );
  };
  const menu = (x: TareaOportunidad) => {
    const hecha = x.status === 'done';
    return (
        <RowActionsMenu
          titulo={x.title}
          tamano="sm"
          acciones={[
            { id: 'editar', etiqueta: t('editar'), icono: Pencil, onSelect: () => setFormulario({ modo: 'full', tarea: x }) },
            hecha
              ? { id: 'reabrir', etiqueta: t('reabrir'), icono: RotateCcw, onSelect: () => alternar(x) }
              : { id: 'hecha', etiqueta: t('marcar'), icono: CheckCircle2, onSelect: () => alternar(x) },
            { id: 'responsable', etiqueta: t('cambiarResponsable'), icono: UserRound, onSelect: () => abrir('responsable', x), oculta: hecha },
            { id: 'vencimiento', etiqueta: t('cambiarVencimiento'), icono: CalendarClock, onSelect: () => abrir('vencimiento', x), oculta: hecha },
            { id: 'eliminar', etiqueta: t('eliminar'), icono: Trash2, destructiva: true, onSelect: () => abrir('eliminar', x) },
          ]}
        />
    );
  };
  // Detalle (Figma 775:473990): casilla cuadrada, «mañana 10:00 · Carlos Ruiz» y estado a la derecha.
  const filaDetalle = (x: TareaOportunidad) => {
    const hecha = x.status === 'done';
    const linea = lineaTareaDetalle(x, ahora, timezone, idioma, td);
    return (
      <li key={x.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
        <button type="button" onClick={() => alternar(x)} disabled={ocupado} aria-pressed={hecha} aria-label={t(hecha ? 'reabrirAria' : 'marcarAria', { titulo: x.title })} className={cn('flex size-5 shrink-0 items-center justify-center rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', hecha ? 'border-brand-action bg-brand-action text-fg-on-brand' : 'border-line-strong bg-surface hover:border-brand')}>
          {hecha && <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={cn('truncate text-sm font-medium', hecha ? 'text-fg-muted line-through' : 'text-fg')}>{x.title}</span>
          <span className={cn('truncate text-xs', linea.estado === 'vencida' ? 'text-danger-text' : 'text-fg-secondary')}>{linea.texto}</span>
        </div>
        <Badge tono={TONO_ESTADO[linea.estado]} apariencia="contorno" tamano="sm">{td(`estados.${linea.estado}`)}</Badge>
        {menu(x)}
      </li>
    );
  };

  const nueva = () => setFormulario({ modo: 'full', tarea: null });
  const vacio = <EmptyState variante="empty" compacto icono={ClipboardCheck} titulo={t('vacioTitulo')} descripcion={t('vacioDetalle')} accion={{ etiqueta: t('vacioAccion'), icono: Plus, onClick: nueva }} />;

  return (
    <section aria-label={t('aria')} className="flex flex-col gap-3">
      {variante === 'detalle' ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-fg">{td('titulo')}</h3>
            <button type="button" onClick={nueva} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <ListPlus aria-hidden="true" className="size-4" />
              {td('nueva')}
            </button>
          </div>
          {tareas.length === 0 ? vacio : <ul className="flex flex-col gap-2">{[...pendientes, ...hechas].map(filaDetalle)}</ul>}
        </>
      ) : (
      <>
      <div className="flex items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:ring-2 focus-within:ring-brand">
          <Plus aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crear(); } }} disabled={creando} placeholder={t('nueva')} aria-label={t('nuevaAria')} maxLength={300} className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none" />
        </label>
        <button type="button" onClick={nueva} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          <Settings2 aria-hidden="true" className="size-4" />
          {t('avanzado')}
        </button>
      </div>

      {tareas.length === 0 ? (
        vacio
      ) : (
        <>
          {pendientes.length > 0 && <h4 className="hidden text-[13px] font-medium text-fg-secondary sm:block">{t('pendientes', { n: pendientes.length })}</h4>}
          {pendientes.length > 0 && <ul className="flex flex-col gap-2">{pendientes.map(fila)}</ul>}
          {hechas.length > 0 && <h4 className="hidden text-[13px] font-medium text-fg-secondary sm:block">{t('hechas', { n: hechas.length })}</h4>}
          {hechas.length > 0 && <ul className="flex flex-col gap-2">{hechas.map(fila)}</ul>}
        </>
      )}
      </>
      )}

      {formulario && (
        <TaskDialog
          open
          onOpenChange={(a) => !a && setFormulario(null)}
          mode="full"
          relatedType="opportunity"
          relatedId={oportunidadId}
          customerId={clienteId ?? undefined}
          editTask={formulario.tarea ? (formulario.tarea as unknown as PMTask) : null}
          siblingTasks={tareas.map((x) => ({ id: x.id, title: x.title, status: x.status }))}
          onSaved={() => { setFormulario(null); void cargar(); }}
          onCreated={() => { setFormulario(null); void cargar(); }}
        />
      )}
      <Dialogo
        abierto={dialogo?.tipo === 'responsable'}
        onAbiertoChange={(a) => !a && setDialogo(null)}
        titulo={t('cambiarResponsable')}
        descripcion={dialogo?.tarea.title}
        ancho={440}
        textoCancelar={t('cancelar')}
        primario={{ etiqueta: t('guardar'), cargando: ocupado, onClick: () => dialogo && void hacer(() => crmTaskService.updateTaskFields(dialogo.tarea.id, { assigned_to: valor || null }), t('guardadaToast')) }}
      >
        <SelectCrm valor={valor} onValorChange={setValor} aria-label={t('responsable')} opcionVacia={t('sinAsignar')} opciones={usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre }))} />
      </Dialogo>
      <Dialogo
        abierto={dialogo?.tipo === 'vencimiento'}
        onAbiertoChange={(a) => !a && setDialogo(null)}
        titulo={t('cambiarVencimiento')}
        descripcion={t('vencimientoZona')}
        ancho={440}
        textoCancelar={t('cancelar')}
        primario={{ etiqueta: t('guardar'), cargando: ocupado, onClick: () => dialogo && void hacer(() => crmTaskService.updateTaskFields(dialogo.tarea.id, { due_date: deFechaHoraLocal(valor, timezone) }), t('guardadaToast')) }}
      >
        <CampoFechaHora valor={valor} onValorChange={setValor} />
      </Dialogo>
      <Dialogo
        abierto={dialogo?.tipo === 'eliminar'}
        onAbiertoChange={(a) => !a && setDialogo(null)}
        titulo={t('confirmarEliminar', { titulo: dialogo?.tarea.title ?? '' })}
        descripcion={t('confirmarEliminarDetalle')}
        ancho={440}
        textoCancelar={t('cancelar')}
        primario={{ etiqueta: t('eliminarBoton'), destructiva: true, cargando: ocupado, onClick: () => dialogo && void hacer(() => crmTaskService.deleteTask(dialogo.tarea.id), t('eliminadaToast')) }}
      />
    </section>
  );
}
