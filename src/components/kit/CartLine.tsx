'use client';

import * as React from 'react';
import { Minus, Package, Plus, ReceiptText, StickyNote, Trash2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import {
  ATAJOS_LINEA,
  cantidadDesdeTexto,
  controlesDeshabilitados,
  hayRenglonEtiquetas,
  mostrarAgregarDescuento,
  textoImpuestoLinea,
  type AccionLinea,
  type ImpuestoLinea,
} from './cartLineLogica';
import { CartTag } from './CartTag';
import { Kbd, useNombresTecla } from './Kbd';
import { ariaAtajo, etiquetaAtajo } from './teclas';
import { useKitT, useLocaleIntl } from './useIdiomaKit';

/**
 * Línea del carrito v2 (Figma `CartLine` 241:9682, POS-UX-V2 D3): dos renglones
 * en escritorio (536 px) y tres en móvil (358 px).
 *
 * - Renglón 1: miniatura 32 · nombre + variante (una línea con «…»; SKU en el
 *   tooltip) · cantidad `− n +` · bloque de importe (total, «{qty} × {unit} /
 *   {unidad}», «+$X impuestos» / «inc. $X impuestos» / «Sin impuesto») ·
 *   acciones siempre visibles: nota (N), excluir impuesto (T), quitar (Supr) y
 *   la ranura `accionExtra` («⋯» de cargos / supervisor, D6: no implementada).
 * - Renglón 2: casilla «Incluido» y las `etiquetas` (la pantalla las arma con
 *   `CartTag`), «Sin impuesto (excluido)» si aplica y «+ Agregar descuento · D»
 *   cuando la línea no tiene descuento. Ranuras `editorDescuento` y `editorNota`.
 * - Móvil: renglón 2 = cantidad · «Incluido» · acciones; las etiquetas van en
 *   un tercer renglón solo si existen.
 *
 * **No calcula**: recibe números ya calculados (servicio / `TaxSummary`) y la
 * `moneda` en la que formatearlos, igual que `ResumenTotales`. No escucha el
 * teclado: los atajos D N T Supr + − los registra la pantalla con `useAtajos`
 * para la línea con foco; aquí solo se anuncian (`aria-keyshortcuts`, tooltip).
 */
export interface LineaCarrito {
  id: string;
  nombre: string;
  /** «Talla 40 · Negro»: va en gris detrás del nombre. */
  variante?: string | null;
  sku?: string | null;
  /** Imagen de 32 px (el POS pasa `CachedProductImage`); sin ella, icono de paquete. */
  miniatura?: React.ReactNode;
  cantidad: number;
  /** `unit_code` («und», «kg»). */
  unidad?: string | null;
  precioUnitario: number;
  total: number;
  impuesto: ImpuestoLinea;
}

export interface CartLineProps {
  linea: LineaCarrito;
  /** Moneda de la organización (`useMonedaOrganizacion()`) o del documento. */
  moneda: ContextoMoneda | string;
  /** Etiquetas del renglón 2, ya armadas con `CartTag` (cocina, modificadores, nota, descuento). */
  etiquetas?: React.ReactNode[];
  /** Casilla «Incluido» (impuesto incluido en el precio de esta línea). */
  incluido: boolean;
  onIncluidoChange: (valor: boolean) => void;
  incluidoDeshabilitado?: boolean;
  /** Pide cambiar la cantidad. Con «−» en 1 llega `0`: la pantalla decide si confirma y quita. */
  onCantidad: (cantidad: number) => void;
  onNota?: () => void;
  /** Resalta el botón de nota (la línea tiene nota). */
  conNota?: boolean;
  onExcluirImpuesto?: () => void;
  onQuitar?: () => void;
  /** Muestra «+ Agregar descuento · D» cuando `conDescuento` es falso. */
  onAgregarDescuento?: () => void;
  conDescuento?: boolean;
  /** El foco entró en la línea (para los atajos de la línea con foco). */
  onFoco?: () => void;
  /** En espera o con deuda: controles deshabilitados. */
  bloqueada?: boolean;
  /** Recién agregada: resaltado verde (la pantalla lo apaga a ~1 s). */
  resaltada?: boolean;
  /** Foco de teclado de la lista: anillo de marca. */
  enfocada?: boolean;
  layout?: 'escritorio' | 'movil';
  /** Ranura del editor de descuento (campo, Aplicar / Cancelar, frecuentes). */
  editorDescuento?: React.ReactNode;
  /** Ranura del editor de nota (`LineNoteEditor`). */
  editorNota?: React.ReactNode;
  /** Ranura para una acción extra al final («⋯», D6). */
  accionExtra?: React.ReactNode;
  /** Atajos distintos a los de POS-UX-V2 §3. */
  atajos?: Partial<Record<AccionLinea, string>>;
  /** Foco itinerante de la lista (lo maneja la pantalla). */
  tabIndex?: number;
  className?: string;
}

const BOTON_ICONO =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

const TONO_IMPUESTO = { exito: 'text-success-text', advertencia: 'text-warning-text', neutro: 'text-fg-muted' } as const;

export const CartLine = React.forwardRef<HTMLDivElement, CartLineProps>(function CartLine(
  {
    linea,
    moneda,
    etiquetas = [],
    incluido,
    onIncluidoChange,
    incluidoDeshabilitado,
    onCantidad,
    onNota,
    conNota,
    onExcluirImpuesto,
    onQuitar,
    onAgregarDescuento,
    conDescuento,
    onFoco,
    bloqueada,
    resaltada,
    enfocada,
    layout = 'escritorio',
    editorDescuento,
    editorNota,
    accionExtra,
    atajos: atajosProp,
    tabIndex,
    className,
  },
  ref,
) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const nombresTecla = useNombresTecla();
  const formatear = React.useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const formatoCantidad = React.useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }), [locale]);
  const idCasilla = React.useId();
  const atajos = { ...ATAJOS_LINEA, ...atajosProp };
  const movil = layout === 'movil';
  const excluido = linea.impuesto.modo === 'excluido';
  const off = controlesDeshabilitados({ bloqueada, modoImpuesto: linea.impuesto.modo, incluidoDeshabilitado });
  const verAgregarDescuento = mostrarAgregarDescuento({
    conDescuento,
    bloqueada,
    editandoDescuento: !!editorDescuento,
    hayAccion: !!onAgregarDescuento,
  });
  const impuesto = textoImpuestoLinea(linea.impuesto);
  const nombre = linea.nombre;

  // Campo de cantidad: texto local mientras se escribe; al salir vuelve al valor real.
  const [textoCantidad, setTextoCantidad] = React.useState(String(linea.cantidad));
  const escribiendo = React.useRef(false);
  React.useEffect(() => {
    if (!escribiendo.current) setTextoCantidad(String(linea.cantidad));
  }, [linea.cantidad]);

  const tooltip = (texto: string, accion: AccionLinea) => `${texto} (${etiquetaAtajo(atajos[accion], nombresTecla)})`;
  const tituloNombre = [nombre, linea.variante, linea.sku ? t('carrito.sku', { sku: linea.sku }) : null].filter(Boolean).join(' · ');

  const miniatura = (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle text-fg-muted">
      {linea.miniatura ?? <Package className="size-4" strokeWidth={1.5} />}
    </span>
  );

  const cantidad = (
    <div className="flex shrink-0 items-center" role="group" aria-label={t('carrito.cantidadDe', { nombre })}>
      <button
        type="button"
        onClick={() => onCantidad(linea.cantidad - 1)}
        disabled={off.cantidad}
        aria-label={t('carrito.disminuir', { nombre })}
        aria-keyshortcuts={ariaAtajo(atajos.menos) || undefined}
        title={tooltip(t('carrito.disminuirCorto'), 'menos')}
        className={cn(BOTON_ICONO, 'border border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg')}
      >
        <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={textoCantidad}
        disabled={off.cantidad}
        aria-label={t('carrito.cantidadDe', { nombre })}
        onFocus={() => {
          escribiendo.current = true;
        }}
        onChange={(e) => {
          const texto = e.target.value;
          if (texto !== '' && !/^\d+$/.test(texto)) return;
          setTextoCantidad(texto);
          const n = cantidadDesdeTexto(texto);
          if (n !== null && n !== linea.cantidad) onCantidad(n);
        }}
        onBlur={() => {
          escribiendo.current = false;
          setTextoCantidad(String(linea.cantidad));
        }}
        className="h-7 w-8 bg-transparent text-center text-[13px] font-medium tabular-nums text-fg outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => onCantidad(linea.cantidad + 1)}
        disabled={off.cantidad}
        aria-label={t('carrito.aumentar', { nombre })}
        aria-keyshortcuts={ariaAtajo(atajos.mas) || undefined}
        title={tooltip(t('carrito.aumentarCorto'), 'mas')}
        className={cn(BOTON_ICONO, 'border border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg')}
      >
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );

  const importe = (
    <div className={cn('flex shrink-0 flex-col items-end whitespace-nowrap text-right', movil ? 'min-w-0' : 'w-[104px]')}>
      <span className="text-sm font-semibold leading-5 tabular-nums text-fg">{formatear(linea.total)}</span>
      <span className="text-[11px] font-medium leading-[14px] tabular-nums text-fg-muted">
        {linea.unidad
          ? t('carrito.precioUnidad', {
              cantidad: formatoCantidad.format(linea.cantidad),
              precio: formatear(linea.precioUnitario),
              unidad: linea.unidad,
            })
          : t('carrito.precioSinUnidad', { cantidad: formatoCantidad.format(linea.cantidad), precio: formatear(linea.precioUnitario) })}
      </span>
      {impuesto && (
        <span className={cn('text-[11px] font-medium leading-[14px] tabular-nums', TONO_IMPUESTO[impuesto.tono])}>
          {impuesto.importe !== undefined
            ? t(`carrito.${impuesto.clave}`, { importe: formatear(impuesto.importe) })
            : t(`carrito.${impuesto.clave}`)}
        </span>
      )}
    </div>
  );

  const acciones = (
    <div className="flex shrink-0 items-center">
      {onNota && (
        <button
          type="button"
          onClick={onNota}
          disabled={off.acciones}
          aria-label={t(conNota ? 'carrito.editarNotaDe' : 'carrito.agregarNotaDe', { nombre })}
          aria-keyshortcuts={ariaAtajo(atajos.nota) || undefined}
          title={tooltip(t(conNota ? 'carrito.editarNota' : 'carrito.agregarNota'), 'nota')}
          className={cn(BOTON_ICONO, conNota ? 'text-brand hover:bg-brand-tint' : 'text-fg-secondary hover:bg-hover hover:text-fg')}
        >
          <StickyNote aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      )}
      {onExcluirImpuesto && (
        <button
          type="button"
          onClick={onExcluirImpuesto}
          disabled={off.acciones}
          aria-label={t('carrito.excluirImpuestoDe', { nombre })}
          aria-pressed={excluido}
          aria-keyshortcuts={ariaAtajo(atajos.excluirImpuesto) || undefined}
          title={tooltip(t(excluido ? 'carrito.impuestoExcluidoTitulo' : 'carrito.excluirImpuesto'), 'excluirImpuesto')}
          className={cn(
            BOTON_ICONO,
            excluido ? 'bg-warning-subtle text-warning-text' : 'text-fg-secondary hover:bg-hover hover:text-fg',
          )}
        >
          <ReceiptText aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      )}
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          disabled={off.acciones}
          aria-label={t('carrito.quitarDe', { nombre })}
          aria-keyshortcuts={ariaAtajo(atajos.quitar) || undefined}
          title={tooltip(t('carrito.quitar'), 'quitar')}
          className={cn(BOTON_ICONO, 'text-danger-text hover:bg-danger-subtle')}
        >
          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      )}
      {accionExtra}
    </div>
  );

  const casilla = (
    <label
      htmlFor={idCasilla}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 text-sm text-fg',
        off.incluido ? 'cursor-not-allowed text-fg-muted' : 'cursor-pointer',
      )}
    >
      <input
        id={idCasilla}
        type="checkbox"
        checked={incluido}
        disabled={off.incluido}
        onChange={(e) => onIncluidoChange(e.target.checked)}
        className="size-4 cursor-pointer rounded accent-brand-action disabled:cursor-not-allowed"
      />
      {t('carrito.incluido')}
    </label>
  );

  const resto = (
    <>
      {etiquetas.map((e, i) => (
        <React.Fragment key={i}>{e}</React.Fragment>
      ))}
      {excluido && <CartTag tono="advertencia">{t('carrito.sinImpuestoExcluido')}</CartTag>}
      {editorDescuento}
      {verAgregarDescuento && (
        <button
          type="button"
          onClick={onAgregarDescuento}
          aria-label={t('carrito.agregarDescuentoDe', { nombre })}
          aria-keyshortcuts={ariaAtajo(atajos.descuento) || undefined}
          className="inline-flex h-5 shrink-0 items-center gap-1 rounded text-[11px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span aria-hidden="true">+</span>
          {t('carrito.agregarDescuento')}
          <Kbd tecla={atajos.descuento} className="hidden lg:inline-flex" />
        </button>
      )}
    </>
  );

  const tercerRenglon =
    movil &&
    hayRenglonEtiquetas({ etiquetas: etiquetas.length, agregarDescuento: verAgregarDescuento, excluido, editor: !!editorDescuento });

  return (
    <div
      ref={ref}
      role="group"
      aria-label={nombre}
      tabIndex={tabIndex}
      onFocus={onFoco}
      data-estado={resaltada ? 'resaltada' : enfocada ? 'foco' : undefined}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg px-3 py-1.5 transition-colors duration-700 focus-visible:outline-none',
        resaltada ? 'bg-success-subtle' : 'bg-surface',
        enfocada && 'ring-2 ring-brand',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {miniatura}
        <p title={tituloNombre} className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[18px] text-fg">
          {nombre}
          {linea.variante && <span className="font-normal text-fg-secondary">{` · ${linea.variante}`}</span>}
        </p>
        {!movil && cantidad}
        {importe}
        {!movil && acciones}
      </div>
      {movil ? (
        <>
          <div className="flex items-center gap-3">
            {cantidad}
            {casilla}
            <span className="flex-1" />
            {acciones}
          </div>
          {tercerRenglon && <div className="flex flex-wrap items-center gap-1.5">{resto}</div>}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {casilla}
          {resto}
        </div>
      )}
      {editorNota && <div className="pt-0.5">{editorNota}</div>}
    </div>
  );
});
