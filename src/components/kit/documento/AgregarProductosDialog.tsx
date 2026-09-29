'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, CircleAlert, ImageIcon, Loader2, Package, PackageSearch, Plus, ScanBarcode } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { PanelAdaptable } from '../PanelAdaptable';
import { SearchInput } from '../SearchInput';
import { ViewToggle } from '../ViewToggle';
import { useFormatoEntero, useKitT, useLocaleIntl } from '../useIdiomaKit';
import { ChipAlternable } from './ChipAlternable';
import {
  coincidenciaExacta,
  contarAgregados,
  estadoStock,
  textoSinHtml,
  type ProductoDocumento,
  type VarianteDocumento,
} from './edicionDocumentoLogica';

/**
 * «Agregar productos» (Figma `Diálogo · Agregar productos` 1042:34652,
 * Documento=Compra · Venta × Estado): el mismo diálogo en la factura de venta,
 * la factura de compra y la orden de compra. Sustituye al viejo
 * `ProductSearchDialog` (`shared/product-search`) en finanzas y compras.
 *
 * - Buscador con escáner: si lo leído coincide exacto con un SKU o código de
 *   barras, Enter lo agrega directo; si no, **Enter agrega el primero** (o el
 *   enfocado con ↑/↓). Esc cierra.
 * - Chips: «Con stock» (venta y compra) y «Solo del proveedor» (compra).
 * - Lista o cuadrícula (`ViewToggle`); en móvil es una hoja inferior
 *   (`PanelAdaptable`).
 * - Venta: precio de la lista y stock de la sucursal; un producto sin stock
 *   se agrega igual con aviso (el bloqueo real es al emitir, decisión 7).
 *   Compra: costo del proveedor, stock y días de entrega.
 * - Pie: «N agregados», «+ Crear producto» y «Listo (N agregados)».
 *
 * Los productos llegan de `buscar` (servicio de la pantalla, con la sesión:
 * RLS). Las descripciones se muestran como texto plano, nunca como HTML.
 */
export interface FiltrosProductos {
  conStock: boolean;
  soloProveedor: boolean;
}

export interface AgregarProductosDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  variante: VarianteDocumento;
  /** «Agregar productos a la factura» / «… a la orden». */
  titulo?: string;
  /** «Precio de venta · stock de Sucursal Principal». */
  descripcion?: ReactNode;
  moneda: ContextoMoneda | string;
  buscar: (texto: string, filtros: FiltrosProductos, senal: AbortSignal) => Promise<readonly ProductoDocumento[]>;
  onAgregar: (producto: ProductoDocumento) => void;
  /** Compra: hay proveedor elegido (habilita «Solo del proveedor»). */
  hayProveedor?: boolean;
  /**
   * «+ Crear producto»: el formulario rápido (`FormularioRapidoProducto`) que
   * pinta la pantalla dentro del diálogo; `onCreado` lo agrega como línea.
   */
  formularioCrear?: (ctx: { texto: string; onCreado: (p: ProductoDocumento) => void; onCancelar: () => void }) => ReactNode;
  /** «a la factura» / «a la orden» en el pie. */
  destino?: 'factura' | 'orden';
}

export function AgregarProductosDialog({
  abierto,
  onAbiertoChange,
  variante,
  titulo,
  descripcion,
  moneda,
  buscar,
  onAgregar,
  hayProveedor,
  formularioCrear,
  destino = 'factura',
}: AgregarProductosDialogProps) {
  const t = useKitT();
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [filtros, setFiltros] = useState<FiltrosProductos>({ conStock: false, soloProveedor: false });
  const [vista, setVista] = useState<'lista' | 'tarjetas'>('lista');
  const [items, setItems] = useState<readonly ProductoDocumento[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [activo, setActivo] = useState(0);
  const [agregados, setAgregados] = useState<number[]>([]);
  const [creando, setCreando] = useState(false);
  const controlador = useRef<AbortController | null>(null);
  const idLista = useId();
  const refBuscador = useRef<HTMLInputElement | null>(null);

  // Al abrir: limpio, foco en el buscador y «Solo del proveedor» encendido si hay proveedor.
  useEffect(() => {
    if (!abierto) {
      controlador.current?.abort();
      return;
    }
    setTexto('');
    setConsulta('');
    setAgregados([]);
    setCreando(false);
    setActivo(0);
    setFiltros({ conStock: false, soloProveedor: variante === 'compra' && !!hayProveedor });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [abierto]);

  const ejecutar = useCallback(
    (q: string, f: FiltrosProductos) => {
      controlador.current?.abort();
      const c = new AbortController();
      controlador.current = c;
      setCargando(true);
      setError(false);
      buscar(q, f, c.signal)
        .then((r) => {
          if (c.signal.aborted) return;
          setItems(r);
          setActivo(0);
        })
        .catch(() => {
          if (!c.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!c.signal.aborted) setCargando(false);
        });
    },
    [buscar],
  );

  useEffect(() => {
    if (abierto && !creando) ejecutar(consulta, filtros);
  }, [abierto, creando, consulta, filtros, ejecutar]);

  const conteo = useMemo(() => contarAgregados(agregados), [agregados]);
  const agregar = (p: ProductoDocumento) => {
    onAgregar(p);
    setAgregados((prev) => [...prev, p.id]);
  };

  const alPulsar = (e: KeyboardEvent) => {
    // Solo desde el buscador: Enter sobre un chip o el conmutador hace lo suyo.
    if (creando || e.target !== refBuscador.current) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (items.length === 0) return;
      e.preventDefault();
      setActivo((a) => (e.key === 'ArrowDown' ? Math.min(items.length - 1, a + 1) : Math.max(0, a - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // El escáner termina con Enter antes del debounce: se busca lo tecleado.
      const exacto = coincidenciaExacta(texto, items);
      if (exacto) {
        agregar(exacto);
        setTexto('');
        setConsulta('');
        return;
      }
      const elegido = items[Math.min(activo, items.length - 1)];
      if (elegido && texto.trim() === consulta.trim()) agregar(elegido);
      else if (texto.trim() !== consulta.trim()) setConsulta(texto);
    }
  };

  // Aria del combobox sobre el buscador (patrón `aria-activedescendant`).
  useEffect(() => {
    const el = refBuscador.current;
    if (!el) return;
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-expanded', 'true');
    el.setAttribute('aria-controls', idLista);
    el.setAttribute('aria-autocomplete', 'list');
    if (items.length > 0) el.setAttribute('aria-activedescendant', `${idLista}-p-${Math.min(activo, items.length - 1)}`);
    else el.removeAttribute('aria-activedescendant');
  });

  const n = agregados.length;
  const tituloFinal = titulo ?? (destino === 'orden' ? t('documentoEdicion.productos.tituloOrden') : t('documentoEdicion.productos.titulo'));

  /** Stock en la unidad del producto («12,400 kg»); por unidad, entero como siempre. */
  const cantidadStock = (p: ProductoDocumento) => {
    const n = Number(p.stock) || 0;
    const u = p.unidadVenta?.trim();
    if (!u) return entero(n);
    const d = Math.max(0, Math.min(3, Math.trunc(Number(p.decimalesCantidad ?? 3))));
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)} ${u}`;
  };
  /** «$ 18.900 / kg» en productos por peso o medida. */
  const precioTexto = (p: ProductoDocumento) => {
    const u = p.unidadVenta?.trim();
    return u ? t('documento.lineas.precioPor', { precio: formatear(p.precio), unidad: u }) : formatear(p.precio);
  };

  const stockTexto = (p: ProductoDocumento) => {
    const e = estadoStock(p);
    if (e === 'noControla' || e === 'desconocido') return null;
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs font-medium tabular-nums', e === 'disponible' ? 'text-success-text' : 'text-danger-text')}>
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', e === 'disponible' ? 'bg-success' : 'bg-danger')} />
        {t('documentoEdicion.productos.stock', { n: cantidadStock(p) })}
      </span>
    );
  };

  const meta = (p: ProductoDocumento) =>
    [
      p.sku,
      p.unidadVenta?.trim() ? t('producto.porUnidadVenta', { unidad: p.unidadVenta.trim() }) : null,
      variante === 'venta' && p.lotes ? t('documentoEdicion.productos.lotes', { n: p.lotes }) : null,
      p.serial ? t('documentoEdicion.productos.serial') : null,
      variante === 'compra' && p.referenciaProveedor ? t('documentoEdicion.productos.referencia', { ref: p.referenciaProveedor }) : null,
      variante === 'compra' && p.minimoPedido ? t('documentoEdicion.productos.minimo', { n: p.minimoPedido }) : null,
      variante === 'compra' && p.tiempoEntregaDias ? t('documentoEdicion.productos.entrega', { n: p.tiempoEntregaDias }) : null,
      variante === 'compra' && hayProveedor && p.delProveedor === false ? t('documentoEdicion.productos.otroProveedor') : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const fila = (p: ProductoDocumento, i: number) => {
    const sinStock = estadoStock(p) === 'sinStock';
    const veces = conteo.get(p.id) ?? 0;
    const descripcionPlana = textoSinHtml(p.descripcion);
    return (
      <li
        key={p.id}
        id={`${idLista}-p-${i}`}
        role="option"
        aria-selected={i === activo}
        onMouseEnter={() => setActivo(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => agregar(p)}
        className={cn(
          'flex cursor-pointer gap-3 rounded-lg border p-2.5',
          // Móvil (hoja): el nombre ocupa su renglón completo; stock, precio y «Agregar» van debajo.
          vista === 'tarjetas' ? 'flex-col' : 'flex-wrap items-center sm:flex-nowrap',
          i === activo ? 'border-line-brand bg-hover' : 'border-line bg-surface',
        )}
      >
        <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle text-fg-muted', vista === 'tarjetas' ? 'h-24 w-full' : 'size-10')}>
          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de 40 px ya servida por el almacenamiento */}
          {p.imagen ? <img src={p.imagen} alt="" className="size-full object-cover" /> : <ImageIcon className="size-4" strokeWidth={1.5} />}
        </span>
        <span className="flex min-w-0 flex-1 basis-[calc(100%-52px)] flex-col sm:basis-auto">
          <span className={cn('line-clamp-2 text-sm font-medium sm:truncate', sinStock ? 'text-fg-secondary' : 'text-fg')}>{p.nombre}</span>
          {meta(p) && <span className="truncate text-xs text-fg-secondary">{meta(p)}</span>}
          {descripcionPlana && <span className="truncate text-xs text-fg-muted">{descripcionPlana}</span>}
        </span>
        <span className={cn('flex shrink-0 items-center gap-3', vista === 'tarjetas' ? 'justify-between' : 'w-full justify-end sm:w-auto')}>
          {stockTexto(p)}
          <span className={cn('text-sm font-semibold tabular-nums', sinStock ? 'text-fg-secondary' : 'text-fg')}>{precioTexto(p)}</span>
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-md px-3 text-[13px] font-medium',
              sinStock && variante === 'venta' ? 'border border-line-warning bg-warning-subtle text-warning-text' : 'bg-brand-action text-fg-on-brand',
            )}
          >
            {veces > 0 ? <Check className="size-3.5" strokeWidth={2} /> : null}
            {veces > 0 ? t('documentoEdicion.productos.agregadoVeces', { n: veces }) : t('documentoEdicion.productos.agregar')}
          </span>
        </span>
      </li>
    );
  };

  const cuerpo = creando && formularioCrear ? (
    formularioCrear({
      texto,
      onCreado: (p) => {
        agregar(p);
        setCreando(false);
        setTexto('');
        setConsulta('');
      },
      onCancelar: () => setCreando(false),
    })
  ) : (
    <div className="flex min-h-0 flex-col gap-2">
      {error ? (
        <p role="alert" className="flex items-center gap-2 py-6 text-sm text-danger-text">
          <CircleAlert aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('documentoEdicion.productos.error')}
        </p>
      ) : items.length === 0 && !cargando ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <PackageSearch aria-hidden="true" className="size-8 text-fg-muted" strokeWidth={1.5} />
          <p className="text-sm font-medium text-fg">{consulta.trim() ? t('documentoEdicion.productos.sinResultados') : t('documentoEdicion.productos.vacio')}</p>
          {formularioCrear && consulta.trim() && (
            <button
              type="button"
              onClick={() => setCreando(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('documentoEdicion.productos.crearTexto', { texto: consulta.trim() })}
            </button>
          )}
        </div>
      ) : (
        <ul
          id={idLista}
          role="listbox"
          aria-label={tituloFinal}
          aria-busy={cargando || undefined}
          className={cn('flex flex-col gap-2', vista === 'tarjetas' && 'grid grid-cols-2 gap-2 sm:grid-cols-3')}
        >
          {items.map(fila)}
        </ul>
      )}
    </div>
  );

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={creando ? t('documentoEdicion.productos.crearTitulo') : tituloFinal}
      descripcion={creando ? undefined : descripcion}
      icono={Package}
      ancho={800}
      onFocoAlAbrir={(e) => {
        e.preventDefault();
        refBuscador.current?.focus();
      }}
      debajoCabecera={
        creando ? undefined : (
          <div className="flex flex-col gap-2 pb-3" onKeyDown={alPulsar}>
            <div className="flex items-center gap-2">
              <SearchInput
                ref={refBuscador}
                value={consulta}
                onChange={setConsulta}
                onValueChange={setTexto}
                debounceMs={250}
                atajo={false}
                cargando={cargando}
                placeholder={t('documentoEdicion.productos.buscar')}
                etiqueta={t('documentoEdicion.productos.buscar')}
                accesorio={<ScanBarcode aria-label={t('documentoEdicion.productos.escaner')} className="size-4 text-fg-muted" strokeWidth={1.5} />}
                className="min-w-0 flex-1"
              />
              <ViewToggle
                valor={vista}
                onValorChange={setVista}
                etiqueta={t('documentoEdicion.productos.vista')}
                corte="sm"
                tamano="md"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ChipAlternable etiqueta={t('documentoEdicion.productos.conStock')} activo={filtros.conStock} onAlternar={() => setFiltros((f) => ({ ...f, conStock: !f.conStock }))} />
              {variante === 'compra' && hayProveedor && (
                <ChipAlternable
                  etiqueta={t('documentoEdicion.productos.soloProveedor')}
                  activo={filtros.soloProveedor}
                  onAlternar={() => setFiltros((f) => ({ ...f, soloProveedor: !f.soloProveedor }))}
                />
              )}
              <span className="ml-auto text-xs text-fg-muted" aria-live="polite">
                {cargando ? (
                  <Loader2 aria-hidden="true" className="inline size-3.5 animate-spin" />
                ) : (
                  t('documentoEdicion.productos.ayuda', { n: items.length })
                )}
              </span>
            </div>
          </div>
        )
      }
      pie={
        creando ? undefined : (
          <>
            <span className="text-sm text-fg-secondary sm:mr-auto" aria-live="polite">
              {destino === 'orden' ? t('documentoEdicion.productos.agregadosOrden', { n }) : t('documentoEdicion.productos.agregados', { n })}
            </span>
            {formularioCrear && (
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('documentoEdicion.productos.crear')}
              </button>
            )}
            <button
              type="button"
              onClick={() => onAbiertoChange(false)}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Check aria-hidden="true" className="size-4" strokeWidth={2} />
              {t('documentoEdicion.productos.listo', { n })}
            </button>
          </>
        )
      }
    >
      {cuerpo}
    </PanelAdaptable>
  );
}
