'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Lock, Ruler, Scale } from 'lucide-react';
import { Dialogo } from '@/components/kit';
import { textoCantidadParcialValido } from '@/components/kit/cartLineLogica';
import type { Product } from '@/components/pos/types';
import {
  cantidadDesdeTexto,
  decimalesCantidad,
  esPorPeso,
  formatoCantidad,
  importePesada,
  minimoDeVenta,
  pesajeManual,
  simboloUnidad,
  validarPesada,
  type Pesaje,
} from '@/lib/pos/peso';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { cn } from '@/utils/Utils';

/**
 * «Pesar» (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6, Figma `DialogoPesar`
 * 1078:702729 y Q4/Q7/Q11). Fase 2: todavía no hay lectura de báscula, así
 * que la lectura es «Sin báscula · peso a mano», solo con el permiso «Pesar a
 * mano en el POS» (resuelto en el servidor) y nunca en un producto que exige
 * báscula: ahí el diálogo lo dice y no deja agregar.
 *
 * Un producto «por medida» (metro, litro) usa el mismo diálogo para escribir
 * la cantidad, sin permiso de peso.
 *
 * Enter agrega (o guarda el peso en «cambiar peso»); Esc cancela. El importe
 * es exacto (0,735 × 18.900 = 13.891,50) y se muestra redondeado a la moneda.
 */
export interface DialogoPesarProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  producto: Product | null;
  /** Precio por unidad de venta (por kg), el mismo que llevará la línea. */
  precioPorUnidad: number;
  moneda: ContextoMoneda | string;
  /** Permiso resuelto en el servidor (`pos_pesaje_contexto`). */
  puedePesarAMano: boolean;
  /** «Cambiar peso» de una línea que ya está en el carrito. */
  modo?: 'agregar' | 'cambiar';
  cantidadInicial?: number | null;
  onConfirmar: (cantidad: number, pesaje: Pesaje | undefined) => void;
}

export function DialogoPesar({
  abierto,
  onAbiertoChange,
  producto,
  precioPorUnidad,
  moneda,
  puedePesarAMano,
  modo = 'agregar',
  cantidadInicial,
  onConfirmar,
}: DialogoPesarProps) {
  const t = useTranslations('posPeso.dialogo');
  const idCampo = useId();
  const idAyuda = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [intentado, setIntentado] = useState(false);

  const porPeso = esPorPeso(producto);
  const decimales = decimalesCantidad(producto);
  const unidad = simboloUnidad(producto?.unit_code) || (producto?.unit_code ?? '').trim();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const formatoDecimal = (n: number) => formatoCantidad(n, producto);

  // Al abrir: el peso actual en «cambiar peso»; vacío al agregar.
  useEffect(() => {
    if (!abierto) return;
    setIntentado(false);
    setTexto(cantidadInicial && cantidadInicial > 0 ? String(cantidadInicial).replace('.', ',') : '');
    const id = setTimeout(() => campo.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [abierto, cantidadInicial]);

  if (!producto) return null;

  const bloqueoPeso: 'exige' | 'sinPermiso' | null = porPeso
    ? producto.require_scale
      ? 'exige'
      : !puedePesarAMano
        ? 'sinPermiso'
        : null
    : null;

  const cantidad = cantidadDesdeTexto(texto, decimales);
  const resultado = validarPesada({ producto, cantidad, origen: 'manual', permisoPesoManual: puedePesarAMano });
  const importe = resultado.ok ? importePesada(resultado.cantidad, precioPorUnidad) : 0;
  const minimo = minimoDeVenta(producto);

  const mensajeError = (() => {
    if (resultado.ok || bloqueoPeso) return null;
    switch (resultado.error) {
      case 'bajo_minimo':
        return t('errores.bajoMinimo', { minimo: formatoDecimal(resultado.minimo ?? 0) });
      case 'demasiados_decimales':
        return t('errores.demasiadosDecimales', { decimales: resultado.decimales ?? decimales });
      default:
        return texto.trim() === '' && !intentado ? null : t(porPeso ? 'errores.pesoInvalido' : 'errores.cantidadInvalida');
    }
  })();

  const confirmar = () => {
    setIntentado(true);
    if (bloqueoPeso || !resultado.ok) return;
    onConfirmar(resultado.cantidad, porPeso ? pesajeManual(producto, resultado.cantidad) : undefined);
  };

  const titulo = t(modo === 'cambiar' ? 'tituloCambiar' : porPeso ? 'titulo' : 'tituloMedida', { producto: producto.name });
  const existencias = typeof producto.stock_quantity === 'number' && producto.track_stock !== false
    ? t('existencias', { cantidad: formatoDecimal(producto.stock_quantity) })
    : null;
  const subtitulo = [
    t('precioPor', { precio: formatear(precioPorUnidad), unidad }),
    existencias,
    porPeso ? t('sinBascula') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const etiquetaPrimaria = bloqueoPeso
    ? t('agregarDeshabilitado')
    : modo === 'cambiar'
      ? t('guardar')
      : t('agregar', { importe: formatear(importe) });

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={subtitulo}
      icono={porPeso ? Scale : Ruler}
      textoCancelar={t('cancelar')}
      primario={{
        etiqueta: etiquetaPrimaria,
        onClick: confirmar,
        deshabilitada: !!bloqueoPeso || (intentado && !resultado.ok),
        motivo: bloqueoPeso ? t(bloqueoPeso === 'exige' ? 'exigeBascula.texto' : 'sinPermiso.texto', { producto: producto.name }) : undefined,
      }}
    >
      {bloqueoPeso ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          {bloqueoPeso === 'exige' ? (
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
          ) : (
            <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
          )}
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{t(bloqueoPeso === 'exige' ? 'exigeBascula.titulo' : 'sinPermiso.titulo')}</p>
            <p>{t(bloqueoPeso === 'exige' ? 'exigeBascula.texto' : 'sinPermiso.texto', { producto: producto.name })}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle px-4 py-3">
            <div className="flex items-center justify-between gap-2 text-xs text-fg-secondary">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-fg-muted" />
                {t(porPeso ? 'estadoManual' : 'estadoMedida')}
              </span>
              {porPeso && (
                <span className="inline-flex items-center gap-1 text-fg-muted">
                  <Scale aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                  {t('ingresoManual')}
                </span>
              )}
            </div>
            <label htmlFor={idCampo} className="sr-only">
              {t(porPeso ? 'campo' : 'campoMedida', { unidad })}
            </label>
            <div
              className={cn(
                'flex h-12 items-center rounded-md border bg-surface text-fg focus-within:ring-2 focus-within:ring-brand',
                mensajeError ? 'border-line-danger' : 'border-line-strong',
              )}
            >
              <input
                ref={campo}
                id={idCampo}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={texto}
                aria-invalid={mensajeError ? true : undefined}
                aria-describedby={idAyuda}
                onChange={(e) => {
                  if (textoCantidadParcialValido(e.target.value, decimales)) setTexto(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmar();
                  }
                }}
                className="h-full w-full min-w-0 bg-transparent px-3 text-right text-2xl font-semibold tabular-nums outline-none"
              />
              <span aria-hidden="true" className="shrink-0 border-l border-line px-3 text-sm text-fg-secondary">
                {unidad}
              </span>
            </div>
            <p id={idAyuda} className={cn('text-xs', mensajeError ? 'text-danger-text' : 'text-fg-secondary')} aria-live="polite">
              {mensajeError ?? (porPeso ? t('ayudaManual') : t('ayudaMedida', { decimales }))}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-brand bg-brand-tint px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium tabular-nums text-fg">
                {t('calculo', {
                  cantidad: resultado.ok ? formatoDecimal(resultado.cantidad) : `— ${unidad}`,
                  precio: formatear(precioPorUnidad),
                  unidad,
                })}
              </span>
              <span className="text-xs text-fg-secondary">
                {[minimo !== null ? t('minimo', { minimo: formatoDecimal(minimo) }) : null, porPeso ? t('cobroAlGramo') : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <span className="shrink-0 text-2xl font-bold tabular-nums text-fg" aria-live="polite">
              {formatear(importe)}
            </span>
          </div>
        </>
      )}
    </Dialogo>
  );
}
