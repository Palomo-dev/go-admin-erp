'use client';

import type { DragEvent, KeyboardEvent } from 'react';
import { CircleAlert, GripVertical, Info, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { LineaCostoReceta } from '@/lib/services/recipeService';
import { simboloUnidad } from '@/lib/pos/peso/modoVenta';
import { cn } from '@/utils/Utils';
import { CampoNumero } from '../CampoNumero';
import { unidadesCompatibles, unidadLimpia, type ErrorLineaReceta, type IngredienteBorrador, type UnidadReceta } from './recetaLogica';

/**
 * Fila de ingrediente (Figma `FilaIngrediente` 957-583384): producto con su
 * unidad y existencia, cantidad y unidad (solo del mismo tipo), merma %, costo
 * de la línea, opcional, quitar y arrastrar para ordenar. Estados: normal · sin
 * conversión · sin costo · duplicado · no descuenta stock · con error. Layout
 * `fila` (escritorio) o `tarjeta` (móvil).
 */
export interface FilaIngredienteProps {
  ingrediente: IngredienteBorrador;
  /** Lo que calculó el servidor para esta fila (costo, conversión, existencia). */
  linea?: LineaCostoReceta;
  error?: ErrorLineaReceta;
  unidades: readonly UnidadReceta[];
  sucursalNombre: string | null;
  permitidoCostos: boolean;
  formatearMoneda: (n: number) => string;
  formatearCantidad: (n: number) => string;
  layout: 'fila' | 'tarjeta';
  soloLectura?: boolean;
  onCambio: (i: IngredienteBorrador) => void;
  onQuitar: () => void;
  onFusionar?: () => void;
  onCrearConversion?: (de: string, a: string) => void;
  /** Reordenar: arrastre con el ratón y ↑/↓ en el asa. */
  onMover?: (delta: -1 | 1) => void;
  arrastre?: {
    onDragStart: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
  idBase: string;
}

type Mensaje = { tono: 'error' | 'aviso' | 'info'; texto: string; accion?: { etiqueta: string; onClick: () => void } };

export function FilaIngrediente({
  ingrediente: i,
  linea,
  error,
  unidades,
  sucursalNombre,
  permitidoCostos,
  formatearMoneda,
  formatearCantidad,
  layout,
  soloLectura,
  onCambio,
  onQuitar,
  onFusionar,
  onCrearConversion,
  onMover,
  arrastre,
  idBase,
}: FilaIngredienteProps) {
  const t = useTranslations('receta.fila');
  const te = useTranslations('receta.errores');
  const opcionesUnidad = unidadesCompatibles(unidades, i.unidadIngrediente);
  const unidad = unidadLimpia(i.unidad);
  const otraUnidad = unidad !== unidadLimpia(i.unidadIngrediente);

  // Meta: «PAN-004 · se lleva en UN · 120 UN en Sucursal Principal» o «sin inventario · se costea por LT».
  const partesMeta: string[] = [];
  if (i.sku) partesMeta.push(i.sku);
  if (i.trackStock) {
    partesMeta.push(t('seLlevaEn', { unidad: i.unidadIngrediente }));
    if (linea?.existencia !== null && linea?.existencia !== undefined && sucursalNombre) {
      partesMeta.push(t('existencia', { cantidad: formatearCantidad(linea.existencia), unidad: i.unidadIngrediente, sucursal: sucursalNombre }));
    }
  } else {
    partesMeta.push(t('sinInventario'), t('seCosteaPor', { unidad: i.unidadIngrediente }));
  }
  if (otraUnidad && linea && linea.factor !== null && linea.error === null) {
    partesMeta.push(t('equivale', { cantidad: formatearCantidad(linea.cantidad), unidad: i.unidadIngrediente }));
  }

  let mensaje: Mensaje | null = null;
  if (error === 'repetido') {
    mensaje = { tono: 'aviso', texto: te('repetido'), accion: onFusionar && !soloLectura ? { etiqueta: t('fusionar'), onClick: onFusionar } : undefined };
  } else if (error) {
    mensaje = { tono: 'error', texto: te(error) };
  } else if (linea?.error === 'conversion_faltante') {
    mensaje = {
      tono: 'error',
      texto: te('conversion_faltante', { de: linea.unidad_receta, a: linea.unidad_ingrediente }),
      accion:
        onCrearConversion && !soloLectura
          ? { etiqueta: t('crearConversion'), onClick: () => onCrearConversion(linea.unidad_receta, linea.unidad_ingrediente) }
          : undefined,
    };
  } else if (linea?.error === 'ingrediente_invalido') {
    mensaje = { tono: 'error', texto: te('ingrediente_invalido') };
  } else if (permitidoCostos && linea && linea.costo_unitario === null && !linea.opcional) {
    mensaje = { tono: 'aviso', texto: t('sinCosto') };
  } else if (!i.trackStock) {
    mensaje = { tono: 'info', texto: t('noDescuenta') };
  }

  const conError = mensaje?.tono === 'error';
  const idMensaje = `${idBase}-msg`;
  const nombreAccesible = t('filaDe', { nombre: i.nombre });

  const alTeclaAsa = (e: KeyboardEvent) => {
    if (!onMover) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onMover(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onMover(1);
    }
  };

  const asa = !soloLectura && (
    <button
      type="button"
      draggable={!!arrastre}
      onDragStart={arrastre?.onDragStart}
      onDragEnd={arrastre?.onDragEnd}
      onKeyDown={alTeclaAsa}
      aria-label={t('ordenar', { nombre: i.nombre })}
      className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing"
    >
      <GripVertical aria-hidden className="size-4" strokeWidth={1.5} />
    </button>
  );

  const cantidad = (
    <CampoNumero
      id={`${idBase}-cantidad`}
      aria-label={t('cantidad')}
      valor={i.cantidad}
      onValorChange={(v) => onCambio({ ...i, cantidad: v })}
      decimales={4}
      minimo={0}
      tamano="sm"
      disabled={soloLectura}
      aria-invalid={error === 'cantidad_invalida' ? true : undefined}
      aria-describedby={mensaje ? idMensaje : undefined}
    />
  );

  const selectorUnidad = (
    <Select value={unidad} onValueChange={(v) => onCambio({ ...i, unidad: unidadLimpia(v) })} disabled={soloLectura}>
      <SelectTrigger
        id={`${idBase}-unidad`}
        aria-label={t('unidad')}
        aria-invalid={linea?.error === 'conversion_faltante' ? true : undefined}
        className={cn('h-8 text-[13px]', linea?.error === 'conversion_faltante' && 'border-danger')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opcionesUnidad.map((u) => (
          <SelectItem key={u.code} value={unidadLimpia(u.code)}>
            {unidadLimpia(u.code)} · {u.name}
          </SelectItem>
        ))}
        {!opcionesUnidad.some((u) => unidadLimpia(u.code) === unidad) && <SelectItem value={unidad}>{unidad}</SelectItem>}
      </SelectContent>
    </Select>
  );

  const merma = (
    <CampoNumero
      id={`${idBase}-merma`}
      aria-label={t('merma')}
      valor={i.mermaPct}
      onValorChange={(v) => onCambio({ ...i, mermaPct: v })}
      decimales={2}
      minimo={0}
      maximo={99.99}
      sufijo="%"
      tamano="sm"
      disabled={soloLectura}
      aria-invalid={error === 'merma_invalida' ? true : undefined}
    />
  );

  const costo = (
    <div className="flex min-w-0 flex-col items-end text-right leading-tight">
      {!permitidoCostos ? (
        <span className="text-sm text-fg-muted">—</span>
      ) : linea && linea.costo_linea !== null ? (
        <>
          <span className={cn('text-sm font-semibold tabular-nums', linea.opcional ? 'text-fg-muted' : 'text-fg')}>
            {formatearMoneda(linea.costo_linea)}
          </span>
          {linea.costo_unitario !== null && (
            <span className="text-[11px] tabular-nums text-fg-muted">
              {/* Costo por la unidad del insumo: «$ 24.000 / kg» (un insumo por peso se usa en gramos y cuesta por kg). */}
              {t('porUnidad', { costo: formatearMoneda(linea.costo_unitario), unidad: simboloUnidad(i.unidadIngrediente) || i.unidadIngrediente })}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="text-sm text-fg-muted">—</span>
          {linea?.error === 'conversion_faltante' && <span className="text-[11px] text-fg-muted">{t('sinConversion')}</span>}
        </>
      )}
    </div>
  );

  const opcional = (
    <label className="flex items-center gap-2 text-[13px] text-fg-secondary">
      <Switch
        checked={i.opcional}
        onCheckedChange={(v) => onCambio({ ...i, opcional: v })}
        disabled={soloLectura}
        aria-label={t('opcionalDe', { nombre: i.nombre })}
      />
      {t('opcional')}
    </label>
  );

  const quitar = !soloLectura && (
    <button
      type="button"
      onClick={onQuitar}
      aria-label={t('quitar', { nombre: i.nombre })}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
    </button>
  );

  const aviso = mensaje && (
    <p
      id={idMensaje}
      role={mensaje.tono === 'error' ? 'alert' : undefined}
      className={cn(
        'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs',
        mensaje.tono === 'error' && 'text-danger-text',
        mensaje.tono === 'aviso' && 'text-warning-text',
        mensaje.tono === 'info' && 'text-info-text',
      )}
    >
      {mensaje.tono === 'error' ? (
        <CircleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
      ) : mensaje.tono === 'aviso' ? (
        <TriangleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
      ) : (
        <Info aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
      )}
      <span>{mensaje.texto}</span>
      {mensaje.accion && (
        <button type="button" onClick={mensaje.accion.onClick} className="font-medium text-link hover:underline">
          {mensaje.accion.etiqueta}
        </button>
      )}
    </p>
  );

  const nombre = (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-fg">{i.nombre}</p>
      <p className="text-xs text-fg-muted">{partesMeta.join(' · ')}</p>
    </div>
  );

  if (layout === 'tarjeta') {
    return (
      <li
        aria-label={nombreAccesible}
        onDragOver={arrastre?.onDragOver}
        onDrop={arrastre?.onDrop}
        className={cn(
          'flex flex-col gap-3 rounded-xl border bg-surface p-3',
          conError ? 'border-danger' : error === 'repetido' ? 'border-line-warning bg-warning-subtle' : 'border-line',
        )}
      >
        <div className="flex items-start gap-2">
          {asa}
          <div className="min-w-0 flex-1">{nombre}</div>
          {quitar}
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
          {cantidad}
          {selectorUnidad}
          {merma}
        </div>
        <div className="flex items-center justify-between gap-3">
          {costo}
          {opcional}
        </div>
        {aviso}
      </li>
    );
  }

  return (
    <li
      aria-label={nombreAccesible}
      onDragOver={arrastre?.onDragOver}
      onDrop={arrastre?.onDrop}
      className={cn(
        'flex flex-col gap-1.5 border-b border-line px-1 py-2.5 last:border-b-0',
        error === 'repetido' && 'bg-warning-subtle',
      )}
    >
      <div className="grid grid-cols-[24px_minmax(0,1fr)_88px_104px_84px_104px_auto_32px] items-center gap-2">
        {asa || <span />}
        {nombre}
        {cantidad}
        {selectorUnidad}
        {merma}
        {costo}
        {opcional}
        {quitar || <span />}
      </div>
      {aviso && <div className="pl-8">{aviso}</div>}
    </li>
  );
}
