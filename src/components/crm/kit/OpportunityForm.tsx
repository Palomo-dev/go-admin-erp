'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Lock, MessageSquare, Receipt, Trash2, UserCheck, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { parsearMonto, type OpcionUsuario } from './camposCrm';
import { CamposOportunidad, LineasCopiadas, type PipelineOpcion } from './OpportunityFormCampos';
import {
  cuerpoAlta,
  cuerpoEdicion,
  ponderado,
  estaBloqueado,
  probabilidadDeEtapa,
  validarOportunidad,
  valoresIniciales,
  type EtapaFormulario,
  type LayoutFormulario,
  type ModoFormulario,
  type OrigenFormulario,
  type ValoresOportunidad,
} from './opportunityFormLogica';

/**
 * Formulario ÚNICO de oportunidad (Figma `OpportunityForm` 766:448739): la
 * misma instancia en página, diálogo y panel lateral, desde Pipeline,
 * Oportunidades, la ficha del cliente, Finanzas, el chat y Leads › Calificar.
 * `origen` prellena y bloquea; `layout` solo cambia la presentación.
 *
 * Moneda por defecto = base de la organización; cierre esperado es `date`
 * y próximo contacto un instante en la hora de la organización. `onEnviar`
 * recibe el cuerpo de `POST` (crear) o `PATCH` (editar)
 * `/api/crm/opportunities`; la escritura es de la pantalla. En la página, las
 * líneas (productos, espacios, conceptos) y «Origen y comisión» llegan como
 * `seccionesPagina` (hoy `oportunidades/OpportunityForm.tsx`).
 */
export interface OpportunityFormProps {
  layout: LayoutFormulario;
  modo?: ModoFormulario;
  origen?: OrigenFormulario;
  /** dialog/sheet: abierto y cierre. */
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  /** Datos del origen o de la oportunidad a editar. */
  prefill?: Partial<ValoresOportunidad>;
  /** Contexto del origen («Desde la ficha de Ana Gómez» + detalle). */
  contextoOrigen?: { titulo: string; detalle?: string } | null;
  /** Ids del origen para `origen_ref` (factura, conversación, lead). */
  origenRef?: Record<string, unknown>;
  pipelines: readonly PipelineOpcion[];
  etapas: readonly EtapaFormulario[];
  usuarios: readonly OpcionUsuario[];
  usuarioActualId?: string | null;
  monedaBase: ContextoMoneda;
  monedas?: readonly string[];
  clienteNombre?: string | null;
  /** Ola 3B: cliente elegido fuera del formulario (`CustomerLinkPicker`): se copia a `customer_id`. */
  clienteId?: string | null;
  onElegirCliente?: () => void;
  /** Ola 3B (página): suma de las líneas; si hay líneas, es el monto. */
  montoCalculado?: number | null;
  onAgregarLineas?: () => void;
  lineasFactura?: { numero: string; lineas: readonly { concepto: string; cantidad: number; total: number }[] } | null;
  seccionesPagina?: ReactNode;
  /** Bloqueo optimista al editar. */
  updatedAt?: string | null;
  onEnviar: (cuerpo: ReturnType<typeof cuerpoAlta> | ReturnType<typeof cuerpoEdicion>) => void;
  onCancelar?: () => void;
  /** Solo al editar y con permiso. */
  onEliminar?: () => void;
  ocupado?: boolean;
  error?: string | null;
  /** Opción extra del responsable (Leads › Calificar en lote: «El de cada lead»). */
  opcionResponsable?: { valor: string; etiqueta: string };
}

const ICONO_ORIGEN: Record<OrigenFormulario, LucideIcon> = { general: Lock, cliente: UserCheck, lead: UserCheck, factura: Receipt, conversacion: MessageSquare };

export function OpportunityForm(props: OpportunityFormProps) {
  const { layout, modo = 'create', origen = 'general', abierto = true, onAbiertoChange, ocupado, error } = props;
  const t = useTranslations('crm.kit.formulario');
  const { timezone } = useFormatDate();
  const iniciales = () =>
    valoresIniciales({ monedaBase: props.monedaBase.code, usuarioId: props.usuarioActualId, pipelineId: props.pipelines[0]?.id, etapas: props.etapas, prefill: props.prefill });
  const [v, setV] = useState<ValoresOportunidad>(iniciales);
  const [intentado, setIntentado] = useState(false);
  useEffect(() => {
    if (abierto) { setV(iniciales()); setIntentado(false); }
    // Se reinicia al abrir; el prefill puede cambiar de identidad en cada render de la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => {
    if (props.clienteId !== undefined && !estaBloqueado(origen, 'customer_id')) setV((x) => ({ ...x, customer_id: props.clienteId ?? '' }));
  }, [props.clienteId, origen]);
  useEffect(() => {
    if (typeof props.montoCalculado === 'number' && Number.isFinite(props.montoCalculado) && props.montoCalculado >= 0) setV((x) => ({ ...x, amount: String(props.montoCalculado) }));
  }, [props.montoCalculado]);

  const codigos = validarOportunidad(v);
  const errores = Object.fromEntries(Object.entries(codigos).map(([k, c]) => [k, intentado && c ? t(`error.${c}`) : null]));
  const cambiar = (p: Partial<ValoresOportunidad>) => { if (!ocupado) setV((x) => ({ ...x, ...p })); };
  const cerrar = () => (onAbiertoChange ? onAbiertoChange(false) : props.onCancelar?.());
  const enviar = () => {
    if (ocupado) return;
    setIntentado(true);
    if (Object.keys(codigos).length) return;
    props.onEnviar(modo === 'edit' ? cuerpoEdicion(v, { zona: timezone, expectedUpdatedAt: props.updatedAt }) : cuerpoAlta(v, { origen, zona: timezone, origenRef: props.origenRef }));
  };

  const titulo = origen === 'lead' ? t('tituloLead') : modo === 'edit' ? t('tituloEditar') : t('titulo');
  const descripcion = origen === 'lead' ? t('pasoLead') : origen !== 'general' ? t('descOrigen') : undefined;
  const IconoOrigen = ICONO_ORIGEN[origen];
  const prob = probabilidadDeEtapa(props.etapas, v.stage_id);
  const valorPonderado = ponderado(v.amount, prob);
  const montoLeido = parsearMonto(v.amount);
  const montoNumero = montoLeido === null || Number.isNaN(montoLeido) ? 0 : montoLeido;
  const pipeline = props.pipelines.find((x) => x.id === v.pipeline_id)?.name;
  const etapa = props.etapas.find((x) => x.id === v.stage_id)?.name;

  const cuerpo = (
    <fieldset disabled={ocupado} className="contents">
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      {props.contextoOrigen && (
        <div className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2">
          <IconoOrigen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] font-medium text-fg">{props.contextoOrigen.titulo}</span>
            {props.contextoOrigen.detalle && <span className="text-xs text-fg-secondary">{props.contextoOrigen.detalle}</span>}
          </div>
          <Lock aria-label={t('bloqueado')} className="size-3.5 shrink-0 text-fg-muted" />
        </div>
      )}
      <CamposOportunidad
        v={v}
        cambiar={cambiar}
        errores={errores}
        origen={origen}
        layout={layout}
        pipelines={props.pipelines}
        etapas={props.etapas}
        usuarios={props.usuarios}
        monedas={props.monedas ?? []}
        monedaBase={props.monedaBase}
        usuarioActualId={props.usuarioActualId}
        clienteNombre={props.clienteNombre}
        onElegirCliente={props.onElegirCliente}
        onAgregarLineas={props.onAgregarLineas}
        opcionResponsable={props.opcionResponsable}
      />
      {props.lineasFactura && <LineasCopiadas numero={props.lineasFactura.numero} lineas={props.lineasFactura.lineas} moneda={props.monedaBase} />}
      {layout === 'page' && props.seccionesPagina}
    </fieldset>
  );

  const pie = (
    <>
      {modo === 'edit' && props.onEliminar && (
        <button type="button" onClick={props.onEliminar} disabled={ocupado} className={clasesBoton({ variante: 'fantasma', className: 'text-danger-text sm:mr-auto' })}>
          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('eliminar')}
        </button>
      )}
      <button type="button" onClick={cerrar} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>{t('cancelar')}</button>
      <button type="button" onClick={enviar} disabled={ocupado} aria-busy={ocupado || undefined} className={clasesBoton()}>
        {ocupado && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
        {modo === 'edit' ? t('guardar') : t('crear')}
      </button>
    </>
  );

  if (layout === 'dialog') {
    return (
      <PanelAdaptable abierto={abierto} onAbiertoChange={(x) => onAbiertoChange?.(x)} titulo={titulo} descripcion={descripcion} ancho={672} ocupado={ocupado} pie={pie}>
        {cuerpo}
      </PanelAdaptable>
    );
  }
  if (layout === 'sheet') {
    return (
      <Sheet open={abierto} onOpenChange={(x) => !ocupado && onAbiertoChange?.(x)}>
        <SheetContent side="right" hideCloseButton className="flex w-full flex-col gap-0 border-line bg-surface p-0 text-fg sm:max-w-[480px]">
          <div className="flex items-start gap-3 px-5 pb-3 pt-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SheetTitle className="text-lg font-semibold leading-6 text-fg">{titulo}</SheetTitle>
              <SheetDescription className={cn('text-sm text-fg-secondary', !descripcion && 'sr-only')}>{descripcion ?? titulo}</SheetDescription>
            </div>
            <button type="button" aria-label={t('cerrar')} onClick={cerrar} disabled={ocupado} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">{cuerpo}</div>
          <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">{pie}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <form
      aria-label={titulo}
      onSubmit={(e) => { e.preventDefault(); enviar(); }}
      className="grid gap-6 lg:grid-cols-[1fr_320px]"
    >
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-5">{cuerpo}</div>
      <aside aria-label={t('resumen')} className="flex h-fit flex-col gap-3 rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-4">
        <h3 className="text-sm font-semibold text-fg">{t('resumen')}</h3>
        <p className="text-2xl font-semibold tabular-nums text-fg">{formatMoneda(montoNumero, props.monedaBase)}</p>
        <dl className="grid grid-cols-2 gap-2 text-[13px]">
          <dt className="text-fg-secondary">{t('probabilidad')}</dt>
          <dd className="text-right text-fg">{prob === null ? '—' : `${prob} %`}</dd>
          <dt className="text-fg-secondary">{t('ponderado')}</dt>
          <dd className="text-right font-medium text-fg">{valorPonderado === null ? '—' : formatMoneda(valorPonderado, props.monedaBase)}</dd>
        </dl>
        {pipeline && <p className="text-xs text-fg-muted">{[pipeline, etapa].filter(Boolean).join(' › ')}</p>}
        <p className="text-xs text-fg-muted">{modo === 'edit' ? t('ayudaEditar') : t('ayudaCrear')}</p>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-3">{pie}</div>
      </aside>
    </form>
  );
}
