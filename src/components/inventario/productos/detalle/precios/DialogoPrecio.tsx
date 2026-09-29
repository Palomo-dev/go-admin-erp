'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp } from 'lucide-react';
import { FormField } from '@/components/kit';
import { Dialogo } from '@/components/kit/Dialogo';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { productoService } from '@/lib/services/productoService';
import { calcularMargen, descuentoComparacion, tonoMargen } from '../../logica/margen';
import { useProductoDetalle } from '../ContextoProducto';
import { CampoVigencia, errorVigencia, type ValorVigencia } from './CampoVigencia';
import { simboloUnidad, unidadVisible, type ProductoModoVenta } from '@/lib/pos/peso/modoVenta';
import { esReferenciaUnidad, precioEnReferencia, precioPorUnidadDesdeReferencia, referenciaDelProducto } from '@/lib/pos/peso/precioReferencia';

/**
 * «Actualizar precio» (A.9 #5-#10): precio vigente real, nuevo precio,
 * comparación opcional (> precio), vigencia (ahora o un día futuro) y vista
 * previa del margen con el costo vigente. Guarda con `fn_producto_fijar_precio`,
 * que cierra la vigencia que cubre la fecha y cancela lo programado después.
 */
export function DialogoPrecio({
  abierto,
  onAbiertoChange,
  onGuardado,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('productoDetalle.precios.dialogoPrecio');
  const tv = useTranslations('productoDetalle.precios.vigencia');
  const tm = useTranslations('productoDetalle.precios');
  const { producto, organizacionId, resumen, moneda, fechas, mensajeError } = useProductoDetalle();
  const { toast } = useToast();
  const hoy = fechas.getToday();

  const [precio, setPrecio] = useState<number | null>(null);
  const [comparacion, setComparacion] = useState<number | null>(null);
  const [vigencia, setVigencia] = useState<ValorVigencia>({ modo: 'ahora', dia: '' });
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setPrecio(resumen?.precio ?? null);
    setComparacion(resumen?.precio_comparacion ?? null);
    setVigencia({ modo: 'ahora', dia: '' });
    setIntentado(false);
    setErrorServidor(null);
  }, [abierto, resumen?.precio, resumen?.precio_comparacion]);

  const errPrecio = precio === null ? t('errorPrecioRequerido') : precio < 0 ? t('errorPrecioNegativo') : null;
  const errComparacion =
    comparacion !== null && comparacion > 0 && precio !== null && comparacion <= precio ? t('errorComparacion') : null;
  const codigoVigencia = errorVigencia(vigencia, hoy);
  const errVigencia = codigoVigencia ? tv(codigoVigencia) : null;
  const valido = !errPrecio && !errComparacion && !errVigencia;

  // Por peso: el precio se escribe en la referencia del producto («cada 100 g») y
  // se guarda SIEMPRE por la unidad de venta (por kg), con la misma vigencia.
  const unidadVenta = (producto.unit_code ?? '').trim().toUpperCase();
  const simbolo = unidadVisible(producto as ProductoModoVenta);
  const referencia = simbolo && producto.sale_mode === 'weight' ? referenciaDelProducto(producto) : null;
  const conReferencia = !!referencia && !esReferenciaUnidad(referencia, unidadVenta);
  const enReferencia = (v: number | null) => (v !== null && conReferencia && referencia ? precioEnReferencia(v, referencia, unidadVenta, moneda.decimales) : v);
  const desdeReferencia = (v: number | null) =>
    v !== null && conReferencia && referencia ? precioPorUnidadDesdeReferencia(v, referencia, unidadVenta, moneda.decimales) : v;
  const textoReferencia = conReferencia && referencia ? t('cadaReferencia', { cantidad: referencia.cantidad, unidad: simboloUnidad(referencia.unidad) }) : null;

  const margen = calcularMargen(precio, resumen?.costo ?? null);
  const descuento = descuentoComparacion(precio, comparacion);

  const guardar = async () => {
    setIntentado(true);
    if (!valido || precio === null) return;
    setGuardando(true);
    setErrorServidor(null);
    try {
      const desde = vigencia.modo === 'programar' ? fechas.toInstant(vigencia.dia) : null;
      const cambio = await productoService.fijarPrecio(organizacionId, producto.id, precio, comparacion && comparacion > 0 ? comparacion : null, desde);
      toast(
        cambio
          ? {
              title: vigencia.modo === 'programar' ? t('toastProgramado') : t('toastActualizado'),
              description:
                vigencia.modo === 'programar'
                  ? t('toastProgramadoDetalle', { precio: moneda.formatear(precio), dia: fechas.formatPlain(vigencia.dia) })
                  : t('toastActualizadoDetalle', { precio: moneda.formatear(precio) }),
            }
          : { title: t('toastSinCambios'), description: t('toastSinCambiosDetalle') },
      );
      onAbiertoChange(false);
      onGuardado();
    } catch (e) {
      const mensaje = mensajeError(e);
      setErrorServidor(mensaje);
      toast({ variant: 'destructive', title: t('toastError'), description: mensaje });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={TrendingUp}
      ancho={520}
      primario={{ etiqueta: guardando ? t('guardando') : t('guardar'), onClick: () => void guardar(), cargando: guardando }}
    >
      <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2.5 text-sm">
        <span className="text-fg-secondary">{t('precioActual')}</span>
        <span className="text-right font-semibold tabular-nums text-fg">
          {resumen?.precio !== null && resumen?.precio !== undefined ? moneda.formatear(resumen.precio) : tm('sinPrecio')}
          {simbolo && resumen?.precio !== null && resumen?.precio !== undefined ? ` / ${simbolo}` : null}
          {resumen?.precio_comparacion ? (
            <span className="ml-2 font-normal text-fg-muted line-through">{moneda.formatear(resumen.precio_comparacion)}</span>
          ) : null}
        </span>
      </div>

      <FormField
        etiqueta={textoReferencia ? t('nuevoPrecioReferencia', { referencia: textoReferencia }) : simbolo ? t('nuevoPrecioPor', { unidad: simbolo }) : t('nuevoPrecio')}
        obligatorio
        error={intentado ? errPrecio : null}
        ayuda={textoReferencia && precio !== null && simbolo ? t('seGuardaComo', { precio: moneda.formatear(precio), unidad: simbolo }) : undefined}
      >
        <CampoNumero
          valor={enReferencia(precio)}
          onValorChange={(v) => setPrecio(desdeReferencia(v))}
          prefijo={moneda.simbolo}
          sufijo={textoReferencia ?? (simbolo ? `/ ${simbolo}` : undefined)}
          decimales={moneda.decimales}
          minimo={0}
          autoFocus
        />
      </FormField>

      <FormField
        etiqueta={t('comparacion')}
        ayuda={descuento !== null ? t('comparacionDescuento', { descuento }) : t('comparacionAyuda')}
        error={errComparacion}
      >
        <CampoNumero
          valor={enReferencia(comparacion)}
          onValorChange={(v) => setComparacion(desdeReferencia(v))}
          prefijo={moneda.simbolo}
          sufijo={textoReferencia ?? (simbolo ? `/ ${simbolo}` : undefined)}
          decimales={moneda.decimales}
          minimo={0}
        />
      </FormField>

      <CampoVigencia valor={vigencia} onChange={setVigencia} hoy={hoy} error={intentado ? errVigencia : null} deshabilitado={guardando} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5 text-sm">
        <span className="text-fg-secondary">
          {resumen?.costo !== null && resumen?.costo !== undefined
            ? t('margenConCosto', { costo: moneda.formatear(resumen.costo) })
            : t('margenSinCosto')}
        </span>
        {margen !== null ? (
          <Badge tono={tonoMargen(margen)}>{tm('margen', { valor: margen })}</Badge>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </div>

      {errorServidor && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {errorServidor}
        </p>
      )}
    </Dialogo>
  );
}
