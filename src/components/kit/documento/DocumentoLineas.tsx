'use client';

import { useMemo, type ReactNode } from 'react';
import { CircleAlert, Package, Trash2, TriangleAlert } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { CampoNumero } from '../CampoNumero';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '../DataTable';
import type { EmptyStateProps } from '../EmptyState';
import type { AccionFila } from '../acciones';
import { formatearTarifa } from '../resumenTotalesLogica';
import { useKitT, useLocaleIntl } from '../useIdiomaKit';
import type { OpcionImpuesto } from './edicionDocumentoLogica';
import { ImpuestosLinea } from './ImpuestosLinea';
import {
  decimalesDocumento,
  decimalesLinea,
  numeroCantidadLinea,
  textoCantidadLinea,
  tonoLinea,
  limitesRecepcion,
  simboloMoneda,
  textoImpuestosLinea,
  type CambioLinea,
  type InsigniaLinea,
  type LineaDocumento,
  type ModoLineas,
} from './documentoLineasLogica';

/**
 * Líneas de un documento (Figma `DocumentLinesTable`, Mode lectura · edición ·
 * recepción × Layout table · cards): factura de venta y de compra, nota
 * crédito, cotización, recepción de una orden de compra.
 *
 * - `lectura`: producto (SKU, variante, nota, seriales), cantidad, precio,
 *   descuento, impuestos («IVA 19 % · Incluido»), total.
 * - `edicion`: cantidad, precio y descuento editables con `CampoNumero` y
 *   «Quitar». Cada cambio sale por `onCambiar`; **el total de la línea lo
 *   recalcula el servicio** y vuelve en `lineas`.
 * - `recepcion`: pedida, pendiente y «Recibida» (0 … pendiente).
 *
 * Sobre `DataTable`: tabla en escritorio, tarjetas por debajo de `lg`.
 *
 * Estados de la línea en edición (Figma `LineaDocumentoEdicion` 1032:33591,
 * decisión 1 del dueño: son estados de ESTA tabla, una sola para venta y
 * compra): `aviso` (fila en advertencia, no bloquea), `error` (fila en
 * peligro), `insignias` («Stock 14», «Faltan 2», «Ítem manual»),
 * `descripcionEditable` (ítem manual) e impuestos por línea con
 * `ImpuestosLinea` cuando la pantalla pasa `impuestosDisponibles`.
 */
const TONO_INSIGNIA: Record<NonNullable<InsigniaLinea['tono']>, string> = {
  neutro: 'border-line bg-subtle text-fg-secondary',
  exito: 'border-line-success bg-success-subtle text-success-text',
  advertencia: 'border-line-warning bg-warning-subtle text-warning-text',
  peligro: 'border-line-danger bg-danger-subtle text-danger-text',
  informacion: 'border-line-brand bg-brand-tint text-brand-deep',
};

export interface DocumentoLineasProps {
  lineas: readonly LineaDocumento[];
  modo?: ModoLineas;
  moneda: ContextoMoneda | string;
  etiqueta?: string;
  onCambiar?: (id: string, cambio: CambioLinea) => void;
  onQuitar?: (id: string) => void;
  /** Menú «⋯» por línea (nota, seriales, excluir impuesto). */
  accionesLinea?: (linea: LineaDocumento) => readonly AccionFila[];
  /** Oculta columnas que el documento no usa. */
  ocultar?: readonly ('sku' | 'descuento' | 'impuestos')[];
  estado?: EstadoTabla;
  vacio?: Partial<EmptyStateProps>;
  /** Fila bajo la tabla: «Buscar producto» · «Agregar ítem manual». */
  pie?: ReactNode;
  /**
   * Decimales de la cantidad de las líneas SIN regla propia; por defecto, los
   * que traigan esas líneas. Una línea con `decimalesCantidad` (producto por
   * peso o medida) usa siempre los suyos.
   */
  decimalesCant?: number;
  /** Edición: impuestos de la organización para elegir por línea (`ImpuestosLinea`). */
  impuestosDisponibles?: readonly OpcionImpuesto[];
  /** Varios impuestos por línea (venta) o uno (compra). */
  impuestosMultiples?: boolean;
  /** Oculta «Incluido en el precio» por línea (lo decide el documento). */
  sinIncluidoPorLinea?: boolean;
  /** «Se facturará al 0 %» bajo el selector de una línea sin impuesto. */
  avisoSinImpuesto?: string;
  className?: string;
}

export function DocumentoLineas({
  lineas,
  modo = 'lectura',
  moneda,
  etiqueta,
  onCambiar,
  onQuitar,
  accionesLinea,
  ocultar = [],
  estado = 'listo',
  vacio,
  pie,
  decimalesCant,
  impuestosDisponibles,
  impuestosMultiples = true,
  sinIncluidoPorLinea,
  avisoSinImpuesto,
  className,
}: DocumentoLineasProps) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const simbolo = useMemo(() => simboloMoneda(moneda), [moneda]);
  const decimalesMoneda = typeof moneda === 'string' ? undefined : moneda.decimals;
  const decCant = decimalesDocumento(lineas, decimalesCant);
  /** Número de la cantidad con los decimales de la línea (sin la unidad). */
  const cantidadTexto = (l: LineaDocumento, n?: number | null) => numeroCantidadLinea(l, locale, decCant, n);
  /** Con la unidad («0,735 kg»), para textos y etiquetas accesibles. */
  const cantidadConUnidad = (l: LineaDocumento, n?: number | null) => textoCantidadLinea(l, locale, decCant, n);
  const unidadDe = (l: LineaDocumento) => l.unidad?.trim() || null;
  /** «$ 18.900 / kg» en lectura; en edición el «/ kg» va de sufijo del campo. */
  const precioTexto = (l: LineaDocumento) => {
    const u = unidadDe(l);
    return u ? t('documento.lineas.precioPor', { precio: formatear(l.precioUnitario), unidad: u }) : formatear(l.precioUnitario);
  };
  const tarifa = (x: number | null | undefined) => formatearTarifa(x, locale);
  const oculta = (c: 'sku' | 'descuento' | 'impuestos') => ocultar.includes(c);
  const editable = modo === 'edicion' && !!onCambiar;

  const producto = (l: LineaDocumento) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      {editable && l.descripcionEditable ? (
        <input
          type="text"
          value={l.descripcion}
          maxLength={1000}
          placeholder={t('documentoEdicion.lineas.describe')}
          aria-label={t('documentoEdicion.lineas.descripcionDe')}
          aria-invalid={l.error ? true : undefined}
          onChange={(e) => onCambiar?.(l.id, { descripcion: e.target.value })}
          className={cn(
            'h-9 w-full min-w-0 rounded-md border bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            l.error ? 'border-line-danger' : 'border-line-strong',
          )}
        />
      ) : (
        <span className="truncate font-medium text-fg">{l.descripcion}</span>
      )}
      {(l.variante || (!oculta('sku') && l.sku)) && (
        <span className="truncate text-xs text-fg-muted">
          {[l.variante, !oculta('sku') && l.sku ? `${t('documento.lineas.sku')} ${l.sku}` : null].filter(Boolean).join(' · ')}
        </span>
      )}
      {l.nota && <span className="truncate text-xs italic text-fg-secondary">{l.nota}</span>}
      {l.seriales && l.seriales.length > 0 && (
        <span className="truncate font-mono text-[11px] text-fg-muted" title={l.seriales.join(', ')}>
          {t('documento.lineas.seriales', { n: l.seriales.length })}: {l.seriales.slice(0, 3).join(', ')}
          {l.seriales.length > 3 ? '…' : ''}
        </span>
      )}
      {l.error && (
        <span role="alert" className="flex items-center gap-1 text-xs text-danger-text">
          <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
          {l.error}
        </span>
      )}
      {l.aviso && (
        <span className="flex items-start gap-1 text-xs text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
          <span className="whitespace-normal">{l.aviso}</span>
        </span>
      )}
      {l.insignias && l.insignias.length > 0 && (
        <span className="flex flex-wrap gap-1 pt-0.5">
          {l.insignias.map((i) => (
            <span key={i.texto} className={cn('inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium', TONO_INSIGNIA[i.tono ?? 'neutro'])}>
              {i.texto}
            </span>
          ))}
        </span>
      )}
    </div>
  );

  const selectorImpuestos = editable && !!impuestosDisponibles;
  const celdaImpuestos = (l: LineaDocumento) =>
    selectorImpuestos && l.impuestosSeleccion ? (
      <ImpuestosLinea
        opciones={impuestosDisponibles ?? []}
        valor={l.impuestosSeleccion}
        multiple={impuestosMultiples}
        sinIncluido={sinIncluidoPorLinea}
        avisoSinImpuesto={avisoSinImpuesto}
        etiqueta={t('documentoEdicion.impuestos.de', { producto: l.descripcion || t('documentoEdicion.lineas.itemSinNombre') })}
        onValorChange={(v) => onCambiar?.(l.id, { impuestos: { ids: [...v.ids], incluido: v.incluido } })}
        className="w-full min-w-[160px]"
      />
    ) : (
      impuestos(l)
    );

  const impuestos = (l: LineaDocumento) => {
    const r = textoImpuestosLinea(l.impuestos, tarifa);
    if (!r.texto) return <span className="text-fg-muted">{t('documento.lineas.sinImpuesto')}</span>;
    return (
      <span className="flex flex-col">
        <span className="truncate">{r.texto}</span>
        {r.incluido !== null && (
          <span className="text-xs text-fg-muted">{r.incluido ? t('documento.lineas.incluido') : t('documento.lineas.adicional')}</span>
        )}
      </span>
    );
  };

  const campoCantidad = (l: LineaDocumento) => {
    const u = unidadDe(l);
    const d = decimalesLinea(l, decCant);
    return editable ? (
      <CampoNumero
        tamano="sm"
        // Peso o medida recién agregado: vacío (no «0») para escribir 0,735.
        valor={u && !l.cantidad ? null : l.cantidad}
        decimales={d}
        minimo={0}
        sufijo={u ?? undefined}
        placeholder={u ? numeroCantidadLinea(l, locale, decCant, 0) : undefined}
        aria-label={
          u
            ? t('documento.lineas.cantidadEnDe', { producto: l.descripcion, unidad: u })
            : t('documento.lineas.cantidadDe', { producto: l.descripcion })
        }
        onValorChange={(v) => onCambiar?.(l.id, { cantidad: v ?? 0 })}
        className={u ? 'w-28' : 'w-24'}
      />
    ) : (
      <span>
        {cantidadTexto(l)}
        {u ? <span className="ml-1 text-xs text-fg-muted">{u}</span> : null}
      </span>
    );
  };

  const campoPrecio = (l: LineaDocumento) => {
    const u = unidadDe(l);
    return editable ? (
      <CampoNumero
        tamano="sm"
        prefijo={simbolo}
        sufijo={u ? t('documento.lineas.porUnidad', { unidad: u }) : undefined}
        valor={l.precioUnitario}
        decimales={decimalesMoneda ?? 2}
        minimo={0}
        aria-label={
          u
            ? t('documento.lineas.precioPorDe', { producto: l.descripcion, unidad: u })
            : t('documento.lineas.precioDe', { producto: l.descripcion })
        }
        onValorChange={(v) => onCambiar?.(l.id, { precioUnitario: v ?? 0 })}
        className={u ? 'w-40' : 'w-32'}
      />
    ) : (
      precioTexto(l)
    );
  };

  const campoDescuento = (l: LineaDocumento) =>
    editable ? (
      <CampoNumero
        tamano="sm"
        prefijo={simbolo}
        valor={l.descuento ?? null}
        decimales={decimalesMoneda ?? 2}
        minimo={0}
        aria-label={t('documento.lineas.descuentoDe', { producto: l.descripcion })}
        onValorChange={(v) => onCambiar?.(l.id, { descuento: v })}
        className="w-28"
      />
    ) : l.descuento ? (
      <span className="text-success-text">−{formatear(l.descuento)}</span>
    ) : (
      <span className="text-fg-muted">—</span>
    );

  const campoRecibida = (l: LineaDocumento) => {
    const { minimo, maximo } = limitesRecepcion(l);
    return (
      <CampoNumero
        tamano="sm"
        valor={l.cantidadRecibida ?? null}
        decimales={decimalesLinea({ cantidad: l.cantidadRecibida ?? 0, decimalesCantidad: l.decimalesCantidad }, decCant)}
        minimo={minimo}
        maximo={maximo}
        sufijo={unidadDe(l) ?? undefined}
        disabled={!onCambiar || maximo === 0}
        aria-label={t('documento.lineas.recibidaDe', { producto: l.descripcion, maximo: cantidadConUnidad(l, maximo) })}
        onValorChange={(v) => onCambiar?.(l.id, { cantidadRecibida: v })}
        className={unidadDe(l) ? 'w-28' : 'w-24'}
      />
    );
  };

  const conUnidad = lineas.some((l) => !!unidadDe(l));
  const columnas: ColumnaTabla<LineaDocumento>[] = [
    { id: 'producto', encabezado: t('documento.lineas.producto'), celda: producto },
  ];
  if (modo === 'recepcion') {
    columnas.push(
      { id: 'pedida', encabezado: t('documento.lineas.pedida'), alinear: 'derecha', celda: (l) => cantidadConUnidad(l), ancho: 96 },
      { id: 'pendiente', encabezado: t('documento.lineas.pendiente'), alinear: 'derecha', celda: (l) => cantidadConUnidad(l, limitesRecepcion(l).maximo), ancho: 96 },
      { id: 'recibida', encabezado: t('documento.lineas.recibida'), alinear: 'derecha', celda: campoRecibida, ancho: 128 },
    );
  } else {
    columnas.push(
      { id: 'cantidad', encabezado: t('documento.lineas.cantidad'), alinear: 'derecha', celda: campoCantidad, ancho: editable ? (conUnidad ? 128 : 112) : 96 },
      { id: 'precio', encabezado: t('documento.lineas.precio'), variante: 'importe', celda: campoPrecio, ancho: editable ? (conUnidad ? 176 : 148) : 128 },
    );
    if (!oculta('descuento')) {
      columnas.push({ id: 'descuento', encabezado: t('documento.lineas.descuento'), variante: 'importe', celda: campoDescuento, ocultarDebajo: 'xl', ancho: editable ? 132 : 112 });
    }
    if (!oculta('impuestos')) {
      columnas.push({
        id: 'impuestos',
        encabezado: t('documento.lineas.impuestos'),
        celda: celdaImpuestos,
        ...(selectorImpuestos ? { ancho: 200 } : { ocultarDebajo: 'xl' as const }),
      });
    }
    columnas.push({
      id: 'total',
      encabezado: t('documento.lineas.total'),
      variante: 'importe',
      celda: (l) => (
        <span className="flex flex-col items-end">
          <span className="font-medium">{formatear(l.total)}</span>
          {l.detalleTotal && <span className="text-xs font-normal text-fg-muted">{l.detalleTotal}</span>}
        </span>
      ),
      ancho: 128,
    });
    if (editable && onQuitar) {
      columnas.push({
        id: 'quitar',
        encabezado: t('documento.lineas.quitar'),
        alinear: 'centro',
        ancho: 56,
        celda: (l) => (
          <button
            type="button"
            aria-label={t('documento.lineas.quitarDe', { producto: l.descripcion })}
            onClick={() => onQuitar(l.id)}
            className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        ),
      });
    }
  }

  const tarjeta = (l: LineaDocumento) => (
    <div className={cn('flex flex-col gap-3 rounded-xl border p-4', l.error ? 'border-line-danger bg-surface' : l.aviso ? 'border-line-warning bg-warning-subtle' : 'border-line bg-surface')}>
      <div className="flex items-start justify-between gap-3">
        {producto(l)}
        {modo !== 'recepcion' && <span className="shrink-0 font-semibold tabular-nums text-fg">{formatear(l.total)}</span>}
      </div>
      {modo === 'recepcion' ? (
        <div className="flex items-center justify-between gap-3 text-[13px] text-fg-secondary">
          <span>
            {t('documento.lineas.pedida')} {cantidadConUnidad(l)} · {t('documento.lineas.pendiente')} {cantidadConUnidad(l, limitesRecepcion(l).maximo)}
          </span>
          {campoRecibida(l)}
        </div>
      ) : editable ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-fg-secondary">
            {t('documento.lineas.cantidad')}
            {campoCantidad(l)}
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-secondary">
            {t('documento.lineas.precio')}
            {campoPrecio(l)}
          </label>
          {!oculta('descuento') && (
            <label className="flex flex-col gap-1 text-xs text-fg-secondary">
              {t('documento.lineas.descuento')}
              {campoDescuento(l)}
            </label>
          )}
          {selectorImpuestos && l.impuestosSeleccion && (
            <div className="col-span-2 flex flex-col gap-1 text-xs text-fg-secondary">
              {t('documento.lineas.impuestos')}
              {celdaImpuestos(l)}
            </div>
          )}
          {onQuitar && (
            <button
              type="button"
              onClick={() => onQuitar(l.id)}
              className="mt-auto flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line-strong text-[13px] font-medium text-fg-secondary hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('documento.lineas.quitar')}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] tabular-nums text-fg-secondary">
          <span>
            {cantidadConUnidad(l)} × {precioTexto(l)}
            {l.descuento ? <span className="text-success-text"> · −{formatear(l.descuento)}</span> : null}
          </span>
          {!oculta('impuestos') && <span className="text-xs">{impuestos(l)}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <DataTable
        etiqueta={etiqueta ?? t('documento.lineas.etiqueta')}
        columnas={columnas}
        filas={lineas}
        obtenerId={(l) => l.id}
        etiquetaFila={(l) => l.descripcion}
        estado={estado}
        densidad="compacta"
        acciones={accionesLinea}
        tonoFila={tonoLinea}
        tarjetaMovil={(l) => tarjeta(l)}
        vacio={{ icono: Package, titulo: t('documento.lineas.vacio'), descripcion: t('documento.lineas.vacioDescripcion'), compacto: true, ...vacio }}
      />
      {pie && <div className="flex flex-wrap items-center gap-2">{pie}</div>}
    </div>
  );
}
