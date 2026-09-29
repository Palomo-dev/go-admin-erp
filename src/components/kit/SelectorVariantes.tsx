'use client';

import * as React from 'react';
import { AlertCircle, Minus, Plus, ShoppingCart } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { PanelAdaptable } from './PanelAdaptable';
import { MarcadorSinFoto } from './ProductCard';
import { useKitT, useLocaleIntl } from './useIdiomaKit';
import { clasesBoton } from './botonClases';
import { acotarCantidad, atributosEnFrase, CANTIDAD_MAXIMA_SELECTOR, totalSelector } from './selectorVariantesLogica';

/**
 * Selector de variante y modificadores (Figma `02 Componentes` ›
 * `VariantModifierDialog` 155:7980: `Layout=desktop` 155:7746 y
 * `Layout=sheet` 155:7862). Diálogo de 560 en escritorio, hoja inferior con
 * asa por debajo de `lg` (lo decide `PanelAdaptable`).
 *
 * - Cabecera: miniatura 56 · nombre · «Elige talla y color · 6 variantes» · «×».
 * - Un grupo de botones por atributo (radio: uno elegido por atributo). Una
 *   combinación que no existe con lo ya elegido se ve atenuada (Figma) pero
 *   se puede tocar: salta a la primera variante que sí tiene ese valor, para
 *   que ninguna combinación quede inalcanzable. Un valor cuya variante está
 *   agotada va tachado y lo anuncia el lector de pantalla.
 * - Sin atributos agrupables: lista de variantes (fila 198:14715) con precio
 *   o «Sin precio».
 * - Resumen: «40 · Negro · SKU», stock en la sucursal (punto verde/rojo) y
 *   precio vigente.
 * - Grupos de modificadores con casilla por opción, insignia «Obligatorio ·
 *   elige 1» (advertencia) u «Hasta 2» (neutra) y el aviso de validación
 *   (198:14706) sobre el pie.
 * - Pie: cantidad `− n +` (opcional) y «Agregar N · $ total».
 *
 * Componente CONTROLADO y de presentación: la pantalla decide qué variante
 * coincide, qué pide cada grupo y si se puede agregar (en el POS,
 * `src/components/pos/VariantSelectorDialog.tsx` con
 * `src/lib/pos/venta/modificadores.ts`).
 */

export interface ValorAtributoSelector {
  valor: string;
  elegido: boolean;
  /** Existe una variante con este valor y el resto de lo elegido. */
  existe: boolean;
  /** La variante que resultaría está agotada en la sucursal. */
  agotado?: boolean;
}

export interface AtributoSelector {
  nombre: string;
  valores: ValorAtributoSelector[];
}

export interface VarianteListaSelector {
  id: number | string;
  nombre: string;
  sku?: string | null;
  precio: number | null;
  agotado?: boolean;
  elegida: boolean;
}

/**
 * Stock de la variante elegida. `sucursal`: nombre de la sucursal que vende;
 * `null` = todas las sucursales; sin valor = no se conoce el nombre.
 */
export type StockVarianteSelector =
  | { tipo: 'disponible'; cantidad: number; sucursal?: string | null }
  | { tipo: 'agotado'; sucursal?: string | null }
  | { tipo: 'sinControl' };

export interface ResumenVarianteSelector {
  /** «40 · Negro · ZAP-0042-40-NEG». */
  etiqueta: string;
  precio: number | null;
  stock?: StockVarianteSelector | null;
}

export type ReglaGrupoSelector = { tipo: 'uno' } | { tipo: 'hasta'; maximo: number } | { tipo: 'varias' };

export interface OpcionGrupoSelector {
  id: number;
  nombre: string;
  extra: number;
  elegida: boolean;
}

export interface GrupoSelector {
  id: number;
  nombre: string;
  regla: ReglaGrupoSelector;
  obligatorio: boolean;
  /** Mínimo de opciones (para «Obligatorio · mínimo N»). */
  minimo?: number;
  opciones: OpcionGrupoSelector[];
}

/** Por qué no se puede agregar (el botón queda deshabilitado y lo dice). */
export type BloqueoSelector = 'agotado' | 'sinPrecio' | 'sinVariante' | null;

export interface SelectorVariantesProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  producto: { nombre: string; imagen?: React.ReactNode };
  /** Si no llega, se arma con los atributos y el nº de variantes. */
  subtitulo?: string;
  cargando?: boolean;
  errorCarga?: { mensaje: string; onReintentar?: () => void } | null;
  /** Nº total de variantes (para el subtítulo). */
  totalVariantes?: number;
  atributos: AtributoSelector[];
  onAtributo: (nombre: string, valor: string) => void;
  /** Variantes sin atributos agrupables: lista de filas. */
  lista?: VarianteListaSelector[];
  onElegirVariante?: (id: number | string) => void;
  resumen?: ResumenVarianteSelector | null;
  grupos: GrupoSelector[];
  onOpcion: (grupoId: number, opcionId: number) => void;
  /** Aviso de validación de un grupo (198:14706). */
  errorGrupo?: { grupoId: number; mensaje: string } | null;
  /** Con `onCantidad` se muestra `− n +`; sin él, el botón agrega una unidad. */
  cantidad?: number;
  onCantidad?: (cantidad: number) => void;
  /** Precio de una unidad con sus extras (null = sin precio). */
  precioUnitario: number | null;
  bloqueo?: BloqueoSelector;
  onAgregar: () => void;
  moneda: ContextoMoneda | string;
}

const chipBase =
  'inline-flex min-h-[38px] items-center rounded-lg border px-3.5 py-2 text-sm font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1';

function EtiquetaGrupo({ id, children, insignia }: { id: string; children: React.ReactNode; insignia?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span id={id} className="text-xs font-medium leading-4 text-fg">
        {children}
      </span>
      {insignia}
    </div>
  );
}

function insigniaDeGrupo(g: GrupoSelector, t: ReturnType<typeof useKitT>): { texto: string; tono: 'advertencia' | 'neutro' } {
  if (g.obligatorio) {
    if ((g.minimo ?? 0) > 1) return { texto: t('selectorVariantes.obligatorioMinimo', { n: g.minimo ?? 0 }), tono: 'advertencia' };
    if (g.regla.tipo === 'uno') return { texto: t('selectorVariantes.obligatorioUna'), tono: 'advertencia' };
    if (g.regla.tipo === 'hasta') return { texto: t('selectorVariantes.obligatorioHasta', { n: g.regla.maximo }), tono: 'advertencia' };
    return { texto: t('selectorVariantes.obligatorio'), tono: 'advertencia' };
  }
  if (g.regla.tipo === 'uno') return { texto: t('selectorVariantes.insigniaUna'), tono: 'neutro' };
  if (g.regla.tipo === 'hasta') return { texto: t('selectorVariantes.insigniaHasta', { n: g.regla.maximo }), tono: 'neutro' };
  return { texto: t('selectorVariantes.opcional'), tono: 'neutro' };
}

export function SelectorVariantes({
  abierto,
  onAbiertoChange,
  producto,
  subtitulo,
  cargando = false,
  errorCarga,
  totalVariantes,
  atributos,
  onAtributo,
  lista,
  onElegirVariante,
  resumen,
  grupos,
  onOpcion,
  errorGrupo,
  cantidad = 1,
  onCantidad,
  precioUnitario,
  bloqueo = null,
  onAgregar,
  moneda,
}: SelectorVariantesProps) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const formatear = React.useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const idBase = React.useId();
  const agregarRef = React.useRef<HTMLButtonElement>(null);
  const gruposRef = React.useRef<Record<number, HTMLDivElement | null>>({});
  const [textoCantidad, setTextoCantidad] = React.useState(String(cantidad));
  const escribiendo = React.useRef(false);

  React.useEffect(() => {
    if (!escribiendo.current) setTextoCantidad(String(cantidad));
  }, [cantidad]);

  // Al terminar de cargar, el foco va a «Agregar» (Enter agrega sin buscar el
  // botón); si no se puede agregar, se queda donde lo dejó el diálogo («×»).
  React.useEffect(() => {
    if (!abierto || cargando) return;
    const id = window.setTimeout(() => {
      const b = agregarRef.current;
      if (b && !b.disabled) b.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [abierto, cargando]);

  // El aviso de un grupo lleva el foco a su primera opción.
  React.useEffect(() => {
    if (!errorGrupo) return;
    const nodo = gruposRef.current[errorGrupo.grupoId];
    nodo?.scrollIntoView?.({ block: 'nearest' });
    nodo?.querySelector<HTMLButtonElement>('button[role="checkbox"]')?.focus();
  }, [errorGrupo]);

  const n = totalVariantes ?? lista?.length ?? 0;
  const subtituloFinal =
    subtitulo ??
    (atributos.length > 0
      ? t('selectorVariantes.subtituloAtributos', { atributos: atributosEnFrase(atributos.map((a) => a.nombre), locale), n })
      : lista && lista.length > 0
        ? t('selectorVariantes.subtituloLista', { n })
        : t('selectorVariantes.subtituloOpciones'));

  const total = totalSelector(precioUnitario, cantidad);
  const conCantidad = typeof onCantidad === 'function';
  const deshabilitado = cargando || !!errorCarga || bloqueo !== null || total === null;
  const motivo =
    cargando || errorCarga
      ? null
      : bloqueo === 'agotado'
        ? t('selectorVariantes.motivoAgotado')
        : bloqueo === 'sinVariante'
          ? t('selectorVariantes.motivoElegir')
          : bloqueo === 'sinPrecio' || total === null
            ? t('selectorVariantes.motivoSinPrecio')
            : null;
  const textoAgregar =
    total === null
      ? t('selectorVariantes.agregar')
      : conCantidad
        ? t('selectorVariantes.agregarN', { n: cantidad, total: formatear(total) })
        : t('selectorVariantes.agregarTotal', { total: formatear(total) });

  const cambiarCantidad = (nueva: number) => onCantidad?.(acotarCantidad(nueva));

  const pie = (
    <div className="flex w-full flex-col gap-3">
      {errorGrupo && (
        <div role="alert" className="flex items-center gap-2 self-start rounded-lg bg-danger-subtle px-4 py-2.5 text-[13px] leading-[18px] text-danger-text">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
          {errorGrupo.mensaje}
        </div>
      )}
      {motivo && !errorGrupo && (
        <p id={`${idBase}-motivo`} className="text-xs leading-4 text-fg-secondary">
          {motivo}
        </p>
      )}
      <div className="flex w-full items-center gap-3">
        {conCantidad && (
          <div role="group" aria-label={t('selectorVariantes.cantidad')} className="flex shrink-0 items-center overflow-hidden rounded-lg border border-line-strong">
            <button
              type="button"
              aria-label={t('selectorVariantes.quitarUna')}
              disabled={cantidad <= 1}
              onClick={() => cambiarCantidad(cantidad - 1)}
              className="flex size-10 items-center justify-center text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:opacity-40"
            >
              <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-label={t('selectorVariantes.cantidad')}
              value={textoCantidad}
              onFocus={() => {
                escribiendo.current = true;
              }}
              onChange={(e) => {
                const limpio = e.target.value.replace(/\D/g, '').slice(0, String(CANTIDAD_MAXIMA_SELECTOR).length);
                setTextoCantidad(limpio);
                const num = Number.parseInt(limpio, 10);
                if (Number.isFinite(num) && num > 0) cambiarCantidad(num);
              }}
              onBlur={() => {
                escribiendo.current = false;
                setTextoCantidad(String(cantidad));
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  cambiarCantidad(cantidad + 1);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  cambiarCantidad(cantidad - 1);
                } else if (e.key === 'Enter' && !deshabilitado) {
                  e.preventDefault();
                  onAgregar();
                }
              }}
              className="h-10 w-12 bg-subtle text-center text-sm font-medium tabular-nums text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            />
            <button
              type="button"
              aria-label={t('selectorVariantes.agregarUna')}
              disabled={cantidad >= CANTIDAD_MAXIMA_SELECTOR}
              onClick={() => cambiarCantidad(cantidad + 1)}
              className="flex size-10 items-center justify-center text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:opacity-40"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        )}
        <button
          ref={agregarRef}
          type="button"
          disabled={deshabilitado}
          aria-describedby={motivo && !errorGrupo ? `${idBase}-motivo` : undefined}
          onClick={onAgregar}
          className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'min-w-0 flex-1 tabular-nums' })}
        >
          <ShoppingCart aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{textoAgregar}</span>
        </button>
      </div>
    </div>
  );

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={producto.nombre}
      descripcion={cargando ? t('selectorVariantes.cargando') : subtituloFinal}
      miniatura={producto.imagen ?? <MarcadorSinFoto conInicial={false} />}
      ancho={560}
      // Se abre encima de otros diálogos (mesas, «Agregar productos»): un
      // toque fuera no debe cerrar ni este ni el de abajo.
      bloquearClicFuera
      pie={pie}
    >
      {cargando ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-4 w-16" />
          <div className="flex gap-2">
            <Skeleton className="h-[38px] w-12" />
            <Skeleton className="h-[38px] w-12" />
            <Skeleton className="h-[38px] w-12" />
          </div>
          <Skeleton className="h-[62px] w-full" />
        </div>
      ) : errorCarga ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-line-danger bg-danger-subtle p-4 text-sm text-danger-text">
          <span className="flex items-center gap-2">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
            {errorCarga.mensaje}
          </span>
          {errorCarga.onReintentar && (
            <button type="button" onClick={errorCarga.onReintentar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('selectorVariantes.reintentar')}
            </button>
          )}
        </div>
      ) : (
        <>
          {atributos.map((a, i) => {
            const idEtiqueta = `${idBase}-atr-${i}`;
            return (
              <div key={a.nombre} className="flex flex-col gap-2">
                <EtiquetaGrupo id={idEtiqueta}>{a.nombre}</EtiquetaGrupo>
                <div role="radiogroup" aria-labelledby={idEtiqueta} className="flex flex-wrap gap-2">
                  {a.valores.map((v) => (
                    <button
                      key={v.valor}
                      type="button"
                      role="radio"
                      aria-checked={v.elegido}
                      title={!v.existe && !v.elegido ? t('selectorVariantes.otraCombinacion') : undefined}
                      onClick={() => onAtributo(a.nombre, v.valor)}
                      className={cn(
                        chipBase,
                        v.elegido
                          ? 'border-brand bg-brand-tint text-brand-deep'
                          : 'border-line-strong bg-surface text-fg hover:bg-hover',
                        !v.existe && !v.elegido && 'opacity-45',
                      )}
                    >
                      <span className={cn(v.agotado && 'line-through decoration-1')}>{v.valor}</span>
                      {v.agotado && <span className="sr-only">{` · ${t('selectorVariantes.agotado')}`}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {atributos.length === 0 && lista && lista.length > 0 && (
            <div role="radiogroup" aria-label={t('selectorVariantes.variantesDe', { producto: producto.nombre })} className="flex flex-col overflow-hidden rounded-lg border border-line">
              {lista.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={v.elegida}
                  onClick={() => onElegirVariante?.(v.id)}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                    i > 0 && 'border-t border-line',
                    v.elegida ? 'bg-brand-tint' : 'bg-surface hover:bg-hover',
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cn('truncate text-sm leading-5 text-fg', v.agotado && 'line-through decoration-1')}>{v.nombre}</span>
                    {v.sku && <span className="text-xs leading-4 text-fg-secondary">{t('selectorVariantes.sku', { sku: v.sku })}</span>}
                  </span>
                  {v.agotado ? (
                    <Badge tono="peligro" tamano="md">{t('selectorVariantes.agotado')}</Badge>
                  ) : v.precio ? (
                    <span className="shrink-0 text-sm tabular-nums text-fg">{formatear(v.precio)}</span>
                  ) : (
                    <Badge tono="peligro" tamano="md">{t('selectorVariantes.sinPrecio')}</Badge>
                  )}
                </button>
              ))}
            </div>
          )}

          {resumen && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle p-3" aria-live="polite">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium leading-5 text-fg">{resumen.etiqueta}</span>
                {resumen.stock && <LineaStock stock={resumen.stock} cantidad={cantidad} conCantidad={conCantidad} />}
              </div>
              {resumen.precio ? (
                <span className="shrink-0 text-base font-semibold leading-[22px] tabular-nums text-fg">{formatear(resumen.precio)}</span>
              ) : (
                <Badge tono="peligro" tamano="md">{t('selectorVariantes.sinPrecio')}</Badge>
              )}
            </div>
          )}

          {grupos.map((g, i) => {
            const idEtiqueta = `${idBase}-grp-${i}`;
            const insignia = insigniaDeGrupo(g, t);
            return (
              <div
                key={g.id}
                ref={(nodo) => {
                  gruposRef.current[g.id] = nodo;
                }}
                role="group"
                aria-labelledby={idEtiqueta}
                aria-invalid={errorGrupo?.grupoId === g.id || undefined}
                className="flex flex-col gap-2"
              >
                <EtiquetaGrupo
                  id={idEtiqueta}
                  insignia={
                    <Badge tono={insignia.tono} tamano="md">
                      {insignia.texto}
                    </Badge>
                  }
                >
                  {g.nombre}
                </EtiquetaGrupo>
                {g.opciones.map((o) => {
                  const idOpcion = `${idBase}-op-${g.id}-${o.id}`;
                  return (
                    <label
                      key={o.id}
                      htmlFor={idOpcion}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                        o.elegida ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                        errorGrupo?.grupoId === g.id && !o.elegida && 'border-line-danger',
                      )}
                    >
                      <Checkbox
                        id={idOpcion}
                        aria-labelledby={`${idOpcion}-nombre`}
                        aria-describedby={`${idOpcion}-extra`}
                        checked={o.elegida}
                        onCheckedChange={() => onOpcion(g.id, o.id)}
                        className="size-[18px] rounded border-line-strong data-[state=checked]:border-brand-action data-[state=checked]:bg-brand-action data-[state=checked]:text-fg-on-brand [&_svg]:size-3"
                      />
                      <span id={`${idOpcion}-nombre`} className="min-w-0 flex-1 text-sm leading-5 text-fg">
                        {o.nombre}
                      </span>
                      <span id={`${idOpcion}-extra`} className="shrink-0 text-[13px] leading-[18px] tabular-nums text-fg-secondary">
                        {t('selectorVariantes.extra', { precio: formatear(o.extra || 0) })}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </>
      )}
    </PanelAdaptable>
  );
}

function LineaStock({ stock, cantidad, conCantidad }: { stock: StockVarianteSelector; cantidad: number; conCantidad: boolean }) {
  const t = useKitT();
  if (stock.tipo === 'sinControl') {
    return <span className="text-xs font-medium leading-4 text-fg-secondary">{t('selectorVariantes.sinControl')}</span>;
  }
  if (stock.tipo === 'agotado') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium leading-4 text-danger-text">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-danger" />
        {stock.sucursal
          ? t('selectorVariantes.agotadoEn', { sucursal: stock.sucursal })
          : stock.sucursal === null
            ? t('selectorVariantes.agotadoTodas')
            : t('selectorVariantes.agotado')}
      </span>
    );
  }
  const corto = conCantidad && cantidad > stock.cantidad;
  const texto = stock.sucursal
    ? t('selectorVariantes.disponiblesEn', { n: stock.cantidad, sucursal: stock.sucursal })
    : stock.sucursal === null
      ? t('selectorVariantes.disponiblesTodas', { n: stock.cantidad })
      : t('selectorVariantes.disponibles', { n: stock.cantidad });
  return (
    <span className={cn('flex items-center gap-1.5 text-xs font-medium leading-4', corto ? 'text-warning-text' : 'text-success-text')}>
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', corto ? 'bg-warning' : 'bg-success')} />
      {corto ? t('selectorVariantes.soloHay', { n: stock.cantidad, cantidad }) : texto}
    </span>
  );
}
