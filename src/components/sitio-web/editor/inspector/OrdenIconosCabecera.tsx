'use client';

/**
 * «Orden en la cabecera» (Figma «16 Sitio web» 3261:99475, aprobado 2026-11-25; A 3263:99475,
 * B 3265:99803): el bloque de arriba de Encabezado › Íconos.
 *
 * Lista de los íconos con asa para arrastrar y flechas ↑/↓ (teclado y dedo), los que no se ven al
 * final y atenuados con su MISMO interruptor de siempre (al prenderlo vuelve a su lugar), vista
 * previa en vivo de la fila, «Restablecer orden» con confirmación y «Computador / Celular» con
 * «Igual que en el computador» prendido por defecto (como el buscador).
 *
 * Claves: computador = `actions_order` (la de siempre); celular = `header_iconos.ordenCelular`.
 * Con zonas del Constructor el orden lo da el Constructor: el bloque avisa y no escribe nada.
 * Lógica pura: `ordenIconosLogica.ts`. No guarda: cada cambio va a `cambiar`.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ChevronRight, Globe, GripVertical, Heart, Menu, Monitor, RotateCcw, Search, ShoppingCart, Smartphone, User, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo, SegmentedControl } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import type { AccionOrden } from '@/lib/website/v2/cabeceraTienda';
import type { AccionEncabezado } from '@/lib/website/v2/iconosEncabezado';
import { FilaInterruptor, InsigniaNuevo } from './PartesZonaGlobal';
import { ICONOS_LUCIDE_ENCABEZADO, iconoAccionEncabezado } from './iconosAccionesLogica';
import {
  cambioCelularIgual,
  cambioOrden,
  cambioPrendido,
  cambioRestablecer,
  celularIgualQueComputador,
  filasOrden,
  moverAccion,
  ordenDe,
  ordenDelConstructor,
  puedeRestablecer,
  type DispositivoOrden,
  type FilaOrden,
} from './ordenIconosLogica';

type Ajustes = Record<string, unknown>;

export interface OrdenIconosProps {
  ajustes: Ajustes;
  cambiar: (c: Ajustes) => void;
  /** Lleva a Diseño › Buscador (el buscador se prende, se apaga y se vuelve barra allí). */
  onIrBuscador?: () => void;
  /** Abre «Selector de moneda» (para traer la moneda a la barra del celular). */
  onAbrirMoneda?: () => void;
  /** Cambia cada vez que el lienzo pide abrir el bloque: se desplaza hasta él y se resalta 1 s. */
  resaltar?: number;
}

function useT() {
  return useTranslations('sitioWeb.editor.cabeceraTienda.orden');
}

const DIBUJO_RESPALDO: Readonly<Record<AccionOrden, LucideIcon>> = { search: Search, currency: Globe, favorites: Heart, cart: ShoppingCart, auth: User };
const ACCION_DIBUJO: Partial<Record<AccionOrden, AccionEncabezado>> = { search: 'search', currency: 'currency', cart: 'cart', auth: 'account' };

/** El dibujo elegido para cada ícono (Encabezado › Íconos › Dibujo), o el de siempre. */
function dibujoDe(a: Ajustes, accion: AccionOrden): LucideIcon {
  const clave = ACCION_DIBUJO[accion];
  if (!clave) return DIBUJO_RESPALDO[accion];
  const nombre = iconoAccionEncabezado(a, clave);
  return Object.prototype.hasOwnProperty.call(ICONOS_LUCIDE_ENCABEZADO, nombre) ? ICONOS_LUCIDE_ENCABEZADO[nombre] : DIBUJO_RESPALDO[accion];
}

const Ayuda = ({ children, id }: { children: ReactNode; id?: string }) => (
  <p id={id} className="text-[11px] leading-[14px] text-fg-muted">
    {children}
  </p>
);

/** Botón de 28 px con área táctil de 40 px (Figma A2 «Pantallas táctiles»). */
function BotonFlecha({ etiqueta, deshabilitado, onClick, children }: { etiqueta: string; deshabilitado: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={onClick}
      className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-fg transition-colors after:absolute after:-inset-1.5 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:border-transparent disabled:text-fg-muted disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Ficha de un ícono: asa, número, dibujo, nombre y detalle; a la derecha, flechas o interruptor. */
function CuerpoFila({
  Icono,
  nombre,
  detalle,
  numero,
  atenuada,
  asa,
  derecha,
}: {
  Icono: LucideIcon;
  nombre: string;
  detalle: string;
  numero: number | null;
  atenuada?: boolean;
  asa?: ReactNode;
  derecha?: ReactNode;
}) {
  return (
    <div className={cn('flex items-center gap-2 rounded-lg px-2 py-2', atenuada ? 'border border-dashed border-line bg-subtle/60' : 'border border-line bg-surface')}>
      {asa ?? <GripVertical aria-hidden="true" className="size-4 shrink-0 text-fg-muted opacity-40" strokeWidth={1.5} />}
      <span
        aria-hidden="true"
        className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold', numero ? 'bg-brand-tint text-brand-deep' : 'bg-subtle text-fg-muted')}
      >
        {numero ?? '–'}
      </span>
      <Icono aria-hidden="true" className={cn('size-4 shrink-0', atenuada ? 'text-fg-muted' : 'text-fg')} strokeWidth={1.5} />
      <span className={cn('flex min-w-0 flex-1 flex-col', atenuada && 'opacity-70')}>
        <span className="text-[13px] font-medium leading-[18px] text-fg">{nombre}</span>
        <span className="text-[11px] leading-[14px] text-fg-muted">{detalle}</span>
      </span>
      {derecha}
    </div>
  );
}

function FilaOrdenable({
  fila,
  indice,
  total,
  Icono,
  nombre,
  detalle,
  onMover,
}: {
  fila: FilaOrden;
  indice: number;
  total: number;
  Icono: LucideIcon;
  nombre: string;
  detalle: string;
  onMover: (destino: number) => void;
}) {
  const t = useT();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: fila.accion });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined }}
      className={cn('list-none rounded-lg', isDragging && 'shadow-md ring-2 ring-brand-action')}
      data-orden-icono={fila.accion}
    >
      <CuerpoFila
        Icono={Icono}
        nombre={nombre}
        detalle={detalle}
        numero={indice + 1}
        asa={
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t('asa', { nombre, n: indice + 1, total })}
            className="relative flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-fg-secondary after:absolute after:-inset-2 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing"
            style={{ touchAction: 'none' }}
          >
            <GripVertical aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        }
        derecha={
          <span className="flex shrink-0 items-center gap-1.5">
            <BotonFlecha etiqueta={t('subir', { nombre })} deshabilitado={indice === 0} onClick={() => onMover(indice - 1)}>
              <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </BotonFlecha>
            <BotonFlecha etiqueta={t('bajar', { nombre })} deshabilitado={indice === total - 1} onClick={() => onMover(indice + 1)}>
              <ArrowDown aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </BotonFlecha>
          </span>
        }
      />
    </li>
  );
}

/** Vista previa en vivo de la fila (Figma A1: barra oscura con el logo y los íconos numerados). */
function VistaPrevia({ ajustes: a, dispositivo, orden, barra }: { ajustes: Ajustes; dispositivo: DispositivoOrden; orden: readonly AccionOrden[]; barra: boolean }) {
  const t = useT();
  const celular = dispositivo === 'celular';
  const Dispositivo = celular ? Smartphone : Monitor;
  return (
    <figure className="flex flex-col gap-1.5 rounded-lg bg-subtle p-2" data-vista-previa-orden={dispositivo}>
      <figcaption className="flex items-center gap-1.5 text-[11px] leading-[14px] text-fg-secondary">
        <Dispositivo aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        {t(celular ? 'vistaPreviaCelular' : 'vistaPreviaComputador')}
      </figcaption>
      <div className="flex min-h-11 items-center gap-2 overflow-hidden rounded-md bg-[#0B1B46] px-2.5 py-2 text-white" aria-hidden="true">
        {celular && <Menu className="size-4 shrink-0" strokeWidth={2} />}
        <span className="size-3.5 shrink-0 rounded-sm bg-brand-action" />
        <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wide">{t('logo')}</span>
        <span className="flex-1" />
        {barra && (
          <span className="flex h-6 min-w-0 max-w-[40%] items-center gap-1 rounded-full bg-white/15 px-2 text-[9px] text-white/80">
            <Search className="size-3 shrink-0" strokeWidth={2} />
            <span className="truncate">{t('barraMuestra')}</span>
          </span>
        )}
        {orden.map((accion, i) => {
          const Icono = dibujoDe(a, accion);
          return (
            <span key={accion} className="flex shrink-0 flex-col items-center gap-0.5" data-previa-icono={accion}>
              <Icono className="size-4" strokeWidth={2} />
              <span className="text-[8px] leading-none text-white/70">{i + 1}</span>
            </span>
          );
        })}
      </div>
    </figure>
  );
}

export function OrdenIconosCabecera({ ajustes: a, cambiar, onIrBuscador, onAbrirMoneda, resaltar }: OrdenIconosProps) {
  const t = useT();
  const idTitulo = useId();
  const [dispositivo, setDispositivo] = useState<DispositivoOrden>('computador');
  const [confirmar, setConfirmar] = useState(false);
  // Orden mientras se arrastra: mueve la vista previa; se guarda al soltar.
  const [arrastre, setArrastre] = useState<AccionOrden[] | null>(null);
  const [resaltado, setResaltado] = useState(false);
  const bloque = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!resaltar) return;
    bloque.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    setResaltado(true);
    const id = window.setTimeout(() => setResaltado(false), 1000);
    return () => window.clearTimeout(id);
  }, [resaltar]);

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // En pantallas táctiles: mantener el dedo 0,3 s sobre el asa (así no se confunde con desplazar el panel).
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nombre = (x: AccionOrden) => t(`nombre.${x}`);

  const encabezado = (
    <div className="flex flex-col gap-1">
      <h3 id={idTitulo} className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
        {t('titulo')}
        <InsigniaNuevo />
      </h3>
      <Ayuda>{t('ayuda')}</Ayuda>
    </div>
  );

  // Zonas del Constructor: el orden lo da el Constructor; aquí no se escribe nada.
  if (ordenDelConstructor(a)) {
    return (
      <section ref={bloque} aria-labelledby={idTitulo} className="flex flex-col gap-3" data-orden-cabecera="constructor">
        {encabezado}
        <p role="note" className="rounded-md border border-line bg-subtle px-3 py-2 text-[12px] leading-4 text-fg-secondary">
          <span className="block font-medium text-fg">{t('constructor')}</span>
          {t('constructorAyuda')}
        </p>
      </section>
    );
  }

  const celular = dispositivo === 'celular';
  const igual = celularIgualQueComputador(a);
  const filas = filasOrden(a, dispositivo);
  const ordenGuardado = ordenDe(a, dispositivo);
  const enOrden = filas.filter((f) => f.estado === 'orden');
  const movibles = new Set(enOrden.map((f) => f.accion));
  const barra = filas.find((f) => f.estado === 'barra');
  const fuera = filas.filter((f) => f.estado === 'fuera');
  const ocultos = filas.filter((f) => f.estado === 'oculto');
  // Con «Igual que en el computador» el celular muestra el orden, pero no se edita aquí.
  const editable = !celular || !igual;
  const previa = (arrastre ?? ordenGuardado).filter((x) => movibles.has(x));
  const restablecible = puedeRestablecer(a, dispositivo);

  const mover = (accion: AccionOrden, destino: number) => {
    const nuevo = moverAccion(ordenGuardado, movibles, accion, destino);
    if (nuevo.some((x, i) => x !== ordenGuardado[i])) cambiar(cambioOrden(a, dispositivo, nuevo));
  };

  const ids = enOrden.map((f) => f.accion);
  const puesto = (id: unknown) => ids.indexOf(id as AccionOrden) + 1;
  const anuncios: Announcements = {
    onDragStart: ({ active }) => t('arrastre.tomado', { nombre: nombre(active.id as AccionOrden), n: puesto(active.id), total: ids.length }),
    onDragOver: ({ active, over }) => (over ? t('arrastre.movido', { nombre: nombre(active.id as AccionOrden), n: puesto(over.id), total: ids.length }) : undefined),
    onDragEnd: ({ active, over }) =>
      over ? t('arrastre.soltado', { nombre: nombre(active.id as AccionOrden), n: puesto(over.id), total: ids.length }) : t('arrastre.cancelado', { nombre: nombre(active.id as AccionOrden) }),
    onDragCancel: ({ active }) => t('arrastre.cancelado', { nombre: nombre(active.id as AccionOrden) }),
  };
  const alPasar = (e: DragOverEvent) => {
    if (!e.over) return;
    setArrastre(moverAccion(ordenGuardado, movibles, e.active.id as AccionOrden, ids.indexOf(e.over.id as AccionOrden)));
  };
  const alSoltar = (e: DragEndEvent) => {
    setArrastre(null);
    if (!e.over || e.active.id === e.over.id) return;
    mover(e.active.id as AccionOrden, ids.indexOf(e.over.id as AccionOrden));
  };

  const detalleOculto = (f: FilaOrden) => (f.accion === 'search' ? t('buscadorApagado') : t('ocultoAyuda'));

  return (
    <section
      ref={bloque}
      aria-labelledby={idTitulo}
      className={cn('-mx-1 flex scroll-mt-2 flex-col gap-3 rounded-lg px-1 transition-shadow', resaltado && 'ring-2 ring-brand-action ring-offset-2')}
      data-orden-cabecera={dispositivo}
      data-resaltado={resaltado ? '' : undefined}
    >
      {encabezado}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold leading-4 text-fg-secondary">{t('editando')}</span>
        <SegmentedControl
          etiqueta={t('editando')}
          tamano="sm"
          tonoActivo="marca"
          opciones={[
            { valor: 'computador', etiqueta: t('computador'), icono: Monitor },
            { valor: 'celular', etiqueta: t('celular'), icono: Smartphone },
          ]}
          valor={dispositivo}
          onValorChange={(v) => {
            setArrastre(null);
            setDispositivo(v);
          }}
        />
      </div>

      {celular && (
        <FilaInterruptor
          titulo={t('igualComputador')}
          ayuda={igual ? t('igualAyudaSi') : t('igualAyudaNo')}
          valor={igual}
          onCambiar={(v) => cambiar(cambioCelularIgual(a, v))}
        />
      )}

      <VistaPrevia ajustes={a} dispositivo={dispositivo} orden={previa} barra={!!barra && !celular} />

      {barra && (
        <CuerpoFila
          Icono={Search}
          nombre={t('barra')}
          detalle={t('barraAyuda')}
          numero={null}
          derecha={
            onIrBuscador ? (
              <button type="button" onClick={onIrBuscador} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-brand-deep hover:underline">
                {t('barraIr')}
                <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              </button>
            ) : undefined
          }
        />
      )}

      {enOrden.length > 0 &&
        (editable ? (
          <DndContext
            sensors={sensores}
            collisionDetection={closestCenter}
            accessibility={{ announcements: anuncios, screenReaderInstructions: { draggable: t('arrastre.instrucciones') } }}
            onDragOver={alPasar}
            onDragEnd={alSoltar}
            onDragCancel={() => setArrastre(null)}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ol aria-label={t('lista')} className="flex flex-col gap-1.5">
                {enOrden.map((f, i) => (
                  <FilaOrdenable
                    key={f.accion}
                    fila={f}
                    indice={i}
                    total={enOrden.length}
                    Icono={dibujoDe(a, f.accion)}
                    nombre={nombre(f.accion)}
                    detalle={t(`detalle.${f.accion}`)}
                    onMover={(destino) => mover(f.accion, destino)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        ) : (
          <ol aria-label={t('lista')} className="flex flex-col gap-1.5" data-orden-solo-lectura="">
            {enOrden.map((f, i) => (
              <li key={f.accion} className="list-none" data-orden-icono={f.accion}>
                <CuerpoFila Icono={dibujoDe(a, f.accion)} nombre={nombre(f.accion)} detalle={t(`detalle.${f.accion}`)} numero={i + 1} />
              </li>
            ))}
          </ol>
        ))}

      {celular && fuera.length > 0 && (
        <div className="flex flex-col gap-1.5" data-orden-fuera="">
          <p className="text-[11px] leading-[14px] text-fg-muted">{t('fuera')}</p>
          {fuera.map((f) => (
            <CuerpoFila
              key={f.accion}
              Icono={dibujoDe(a, f.accion)}
              nombre={nombre(f.accion)}
              detalle={t(`motivo.${f.motivo ?? 'apagadoCelular'}`)}
              numero={null}
              atenuada
              derecha={
                f.motivo === 'monedaMenu' && onAbrirMoneda ? (
                  <button type="button" onClick={onAbrirMoneda} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-brand-deep hover:underline">
                    {t('monedaIr')}
                    <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {ocultos.length > 0 && (
        <div className="flex flex-col gap-1.5" data-orden-ocultos="">
          <p className="text-[11px] leading-[14px] text-fg-muted">{t('ocultos')}</p>
          {ocultos.map((f) => (
            <CuerpoFila
              key={f.accion}
              Icono={dibujoDe(a, f.accion)}
              nombre={nombre(f.accion)}
              detalle={detalleOculto(f)}
              numero={null}
              atenuada
              derecha={
                f.accion === 'search' ? (
                  onIrBuscador ? (
                    <button type="button" onClick={onIrBuscador} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-brand-deep hover:underline">
                      {t('barraIr')}
                      <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                    </button>
                  ) : undefined
                ) : (
                  // El MISMO interruptor de la tarjeta de abajo: prenderlo lo devuelve a su lugar.
                  <Switch aria-label={t('mostrar', { nombre: nombre(f.accion) })} checked={false} onCheckedChange={(v) => cambiar(cambioPrendido(a, f.accion, v))} className="shrink-0" />
                )
              }
            />
          ))}
        </div>
      )}

      <details className="group rounded-lg border border-line bg-surface px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-medium text-fg">
          <ChevronRight aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-90" strokeWidth={1.5} />
          {celular ? t('menuLogo') : t('botonesSede')}
        </summary>
        <p className="mt-1.5 text-[11px] leading-[14px] text-fg-secondary">{celular ? t('menuLogoAyuda') : t('botonesSedeAyuda')}</p>
      </details>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          disabled={!restablecible}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {celular ? t('restablecerCelular') : t('restablecer')}
        </button>
        {!restablecible && <span className="text-[11px] text-fg-muted">{t('igualSiempre')}</span>}
      </div>
      <Ayuda>{celular ? t('restablecerAyudaCelular') : t('restablecerAyuda')}</Ayuda>

      <Dialogo
        abierto={confirmar}
        onAbiertoChange={setConfirmar}
        ancho={440}
        titulo={t('confirmarTitulo')}
        descripcion={celular ? t('confirmarCelular') : t('confirmarComputador')}
        pie={<span className="text-[11px] text-fg-muted">{t('confirmarDeshacer')}</span>}
        primario={{
          etiqueta: t('confirmar'),
          onClick: () => {
            cambiar(cambioRestablecer(a, dispositivo));
            setConfirmar(false);
          },
        }}
      />
    </section>
  );
}
