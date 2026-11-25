'use client';

/**
 * «Formulario del checkout» dentro de «Opciones del checkout» (Figma «16 Sitio web» › Checkout v2,
 * Parte F 3141-93709: F1 lista, F2 cambios sin guardar, F3 error, F4 diálogos, F5–F7 celular y la
 * pieza «Fila campo»). Qué datos pide la tienda, en qué orden y cuáles son obligatorios.
 *
 * - Una lista por bloque (Contacto, Entrega) con asa para arrastrar (ratón, dedo con pulsación
 *   larga, o teclado: Espacio toma, ↑ ↓ mueven, Espacio suelta); las indicaciones no se mueven.
 * - Cada fila: Obligatorio/Opcional, lápiz (etiqueta, ayuda y ejemplo) e interruptor Visible.
 *   Los indispensables (correo, nombre, dirección, municipio; barrio visible; casilla de factura
 *   opcional) salen con candado y su porqué; la regla es la COMPARTIDA con la tienda
 *   (src/lib/website/formularioCheckout.ts) y el servidor la vuelve a exigir.
 * - En el celular la fila es más simple (nombre, «Obligatorio · …», interruptor) y tocarla abre la
 *   hoja de edición con «Mostrar en la tienda» y «Requisito» (F7).
 *
 * No guarda: cada cambio va a `onCambio` y el diálogo guarda todo junto («Guardar cambios»).
 */
import { useId, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle, ClipboardList, Eye, GripVertical, Lock, Pencil, RotateCcw } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ConfirmDialog, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { defCampoFormulario, type ClaveCampoFormulario, type SeccionFormulario } from '@/lib/website/formularioCheckout';
import {
  SECCIONES_FORMULARIO,
  conteoSeccion,
  erroresConfigurador,
  filasDeSeccion,
  moverCampo,
  ponerObligatorio,
  ponerTextos,
  ponerVisible,
  restablecer,
  sePuedeMover,
  type FilaFormulario,
} from './formularioLogica';
import { DialogoCampoFormulario } from './DialogoCampoFormulario';
import { VistaPreviaFormulario } from './VistaPreviaFormulario';
import { ICONO_CAMPO, useTextosFormulario } from './textosFormulario';

/** Detalle de la fila: el candado y su porqué, «Oculto en la tienda» o la descripción del campo. */
function detalleFila(t: ReturnType<typeof useTextosFormulario>, fila: FilaFormulario, conError: boolean): { texto: string; candado: boolean } {
  const def = defCampoFormulario(fila.clave);
  if (conError) return { texto: t('errorFila'), candado: false };
  if (!fila.visible) return { texto: `${t('oculto')} · ${t(`campos.${fila.clave}.detalle`)}`, candado: false };
  if (def.motivo && (def.fijoVisible || def.fijoObligatorio)) return { texto: t(`motivos.${def.motivo}`), candado: true };
  return { texto: t(`campos.${fila.clave}.detalle`), candado: false };
}

function SelectorRequisito({ fila, onCambio, nombre }: { fila: FilaFormulario; onCambio: (obligatorio: boolean) => void; nombre: string }) {
  const t = useTextosFormulario();
  const def = defCampoFormulario(fila.clave);
  if (def.fijoObligatorio) {
    return (
      <span className="inline-flex h-9 w-[132px] shrink-0 items-center gap-1.5 rounded-lg border border-line bg-subtle px-3 text-sm text-fg-secondary" data-requisito-fijo="">
        <Lock aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        {fila.obligatorio ? t('obligatorio') : t('opcional')}
      </span>
    );
  }
  return (
    <select
      aria-label={t('requisitoDe', { nombre })}
      value={fila.obligatorio ? 'obligatorio' : 'opcional'}
      disabled={!fila.visible}
      onChange={(e) => onCambio(e.target.value === 'obligatorio')}
      className="h-9 w-[132px] shrink-0 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-muted"
    >
      <option value="obligatorio">{t('obligatorio')}</option>
      <option value="opcional">{t('opcional')}</option>
    </select>
  );
}

function FilaCampo({
  fila,
  indice,
  total,
  conError,
  onVisible,
  onObligatorio,
  onEditar,
}: {
  fila: FilaFormulario;
  indice: number;
  total: number;
  conError: boolean;
  onVisible: (v: boolean) => void;
  onObligatorio: (v: boolean) => void;
  onEditar: () => void;
}) {
  const t = useTextosFormulario();
  const def = defCampoFormulario(fila.clave);
  const nombre = t(`campos.${fila.clave}.nombre`);
  const movible = sePuedeMover(fila.clave);
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: fila.clave, disabled: !movible });
  const Icono = ICONO_CAMPO[fila.clave];
  const detalle = detalleFila(t, fila, conError);
  const apagada = !fila.visible && !conError;
  const requisitoCorto = fila.obligatorio ? t('obligatorio') : t('opcional');
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined }}
      className={cn(
        'flex list-none items-center gap-2 rounded-lg border px-2 py-2 sm:gap-3 sm:px-3',
        conError ? 'border-danger bg-danger-subtle' : isDragging ? 'border-brand-action bg-brand-tint shadow-md' : 'border-line bg-surface',
      )}
      data-campo-formulario={fila.clave}
      data-visible={fila.visible ? 'si' : 'no'}
    >
      {movible ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('asa', { nombre, n: indice + 1, total })}
          className="relative flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-fg-muted after:absolute after:-inset-2 hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          <GripVertical aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      ) : (
        <span className="flex size-6 shrink-0 items-center justify-center text-fg-muted opacity-40" title={t('fijoOrden', { nombre })}>
          <GripVertical aria-hidden="true" className="size-4" strokeWidth={1.5} />
          <span className="sr-only">{t('fijoOrden', { nombre })}</span>
        </span>
      )}
      <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle', apagada ? 'text-fg-muted' : 'text-fg-secondary')}>
        <Icono className="size-4" strokeWidth={1.5} />
      </span>
      <button type="button" onClick={onEditar} className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:cursor-default" aria-label={t('editar', { nombre })}>
        <span className={cn('truncate text-sm font-medium', apagada ? 'text-fg-muted' : 'text-fg')}>{nombre}</span>
        <span className={cn('flex min-w-0 items-center gap-1 text-xs', conError ? 'text-danger-text' : 'text-fg-secondary')}>
          {conError ? <AlertCircle aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} /> : detalle.candado ? <Lock aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} /> : null}
          {/* Celular: el requisito va en la línea pequeña (F5). */}
          <span className="truncate">
            <span className="sm:hidden">{fila.visible ? `${requisitoCorto} · ` : ''}</span>
            {detalle.texto}
          </span>
        </span>
      </button>
      <span className="hidden sm:flex sm:items-center sm:gap-3">
        <SelectorRequisito fila={fila} nombre={nombre} onCambio={onObligatorio} />
        <button
          type="button"
          onClick={onEditar}
          aria-label={t('editar', { nombre })}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </span>
      <Switch
        checked={fila.visible}
        disabled={def.fijoVisible}
        onCheckedChange={onVisible}
        aria-label={t('mostrar', { nombre })}
        title={def.fijoVisible && def.motivo ? t('bloqueado', { motivo: t(`motivos.${def.motivo}`) }) : undefined}
      />
    </li>
  );
}

function ListaSeccion({
  seccion,
  filas,
  claveConError,
  onFilas,
  onEditar,
}: {
  seccion: SeccionFormulario;
  filas: FilaFormulario[];
  claveConError: ReadonlySet<ClaveCampoFormulario>;
  onFilas: (f: FilaFormulario[]) => void;
  onEditar: (clave: ClaveCampoFormulario) => void;
}) {
  const t = useTextosFormulario();
  const idTitulo = useId();
  const lista = filasDeSeccion(filas, seccion);
  const { campos, visibles } = conteoSeccion(filas, seccion);
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const alSoltar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const movibles = lista.filter((f) => sePuedeMover(f.clave));
    const destino = movibles.findIndex((f) => f.clave === e.over?.id);
    if (destino >= 0) onFilas(moverCampo(filas, e.active.id as ClaveCampoFormulario, destino));
  };
  return (
    <div className="flex flex-col gap-2" data-seccion-formulario={seccion}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p id={idTitulo} className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
          {t(`secciones.${seccion}`)} <span className="font-normal normal-case tracking-normal text-fg-muted">{t('conteo', { campos, visibles })}</span>
        </p>
        <p className="hidden text-xs text-fg-secondary sm:block">{t(`notaSeccion.${seccion}`)}</p>
      </div>
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
        <SortableContext items={lista.map((f) => f.clave)} strategy={verticalListSortingStrategy}>
          <ul aria-labelledby={idTitulo} className="flex flex-col gap-2">
            {lista.map((fila, i) => (
              <FilaCampo
                key={fila.clave}
                fila={fila}
                indice={i}
                total={lista.length}
                conError={claveConError.has(fila.clave)}
                onVisible={(v) => onFilas(ponerVisible(filas, fila.clave, v))}
                onObligatorio={(v) => onFilas(ponerObligatorio(filas, fila.clave, v))}
                onEditar={() => onEditar(fila.clave)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export interface SeccionFormularioCheckoutProps {
  filas: FilaFormulario[];
  /** Lo guardado (la vista previa marca lo que cambió). */
  filasGuardadas: FilaFormulario[];
  onFilas: (filas: FilaFormulario[]) => void;
}

export function SeccionFormularioCheckout({ filas, filasGuardadas, onFilas }: SeccionFormularioCheckoutProps) {
  const t = useTextosFormulario();
  const idTitulo = useId();
  const [editando, setEditando] = useState<ClaveCampoFormulario | null>(null);
  const [confirmarRestablecer, setConfirmarRestablecer] = useState(false);
  const [verPrevia, setVerPrevia] = useState(false);
  const errores = erroresConfigurador(filas);
  const claveConError = new Set(errores.flatMap((e) => e.claves));
  const filaEditando = editando ? filas.find((f) => f.clave === editando) ?? null : null;

  return (
    <section aria-labelledby={idTitulo} className="rounded-xl border border-brand-action bg-surface" data-formulario-checkout="">
      <div className="flex flex-wrap items-start gap-3 border-b border-line p-4 sm:p-5">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <ClipboardList className="size-4" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={idTitulo} className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
            {t('titulo')}
            <Badge tono="marca" tamano="sm">{t('nuevo')}</Badge>
          </h2>
          <p className="mt-0.5 text-[13px] leading-[18px] text-fg-secondary">
            <span className="hidden sm:inline">{t('descripcion')}</span>
            <span className="sm:hidden">{t('descripcionMovil')}</span>
          </p>
        </div>
        <button type="button" onClick={() => setConfirmarRestablecer(true)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('restablecer')}
        </button>
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {errores.length > 0 && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger bg-danger-subtle px-3 py-2.5" data-error-formulario="">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-text" strokeWidth={2} />
            <div className="text-sm">
              <p className="font-semibold text-danger-text">{t('errorContactoTitulo')}</p>
              <p className="text-fg">{t('errorContacto')}</p>
            </div>
          </div>
        )}

        {verPrevia ? (
          <div className="flex flex-col gap-3 lg:hidden">
            <VistaPreviaFormulario filas={filas} filasGuardadas={filasGuardadas} dispositivoInicial="celular" />
            <button type="button" onClick={() => setVerPrevia(false)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
              {t('volverLista')}
            </button>
          </div>
        ) : null}

        <div className={cn('flex flex-col gap-5', verPrevia && 'hidden lg:flex')}>
          {SECCIONES_FORMULARIO.map((s) => (
            <ListaSeccion key={s} seccion={s} filas={filas} claveConError={claveConError} onFilas={onFilas} onEditar={setEditando} />
          ))}
          <button type="button" onClick={() => setVerPrevia(true)} className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'lg:hidden')}>
            <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('verVistaPrevia')}
          </button>
        </div>
      </div>

      {filaEditando && (
        <DialogoCampoFormulario
          fila={filaEditando}
          abierto={!!filaEditando}
          onAbiertoChange={(v) => !v && setEditando(null)}
          onListo={(cambios) => {
            let nuevas = ponerTextos(filas, filaEditando.clave, cambios.textos);
            nuevas = ponerVisible(nuevas, filaEditando.clave, cambios.visible);
            nuevas = ponerObligatorio(nuevas, filaEditando.clave, cambios.obligatorio);
            onFilas(nuevas);
            setEditando(null);
          }}
        />
      )}

      <ConfirmDialog
        abierto={confirmarRestablecer}
        onAbiertoChange={setConfirmarRestablecer}
        titulo={t('restablecerDialogo.titulo')}
        descripcion={t('restablecerDialogo.descripcion')}
        textoConfirmar={t('restablecerDialogo.confirmar')}
        tono="marca"
        icono={RotateCcw}
        onConfirmar={() => {
          onFilas(restablecer());
          setConfirmarRestablecer(false);
        }}
      >
        <ul className="flex flex-col gap-1.5 text-sm text-fg">
          <li>{t('restablecerDialogo.contacto')}</li>
          <li>{t('restablecerDialogo.entrega')}</li>
        </ul>
      </ConfirmDialog>
    </section>
  );
}
