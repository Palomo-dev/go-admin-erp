'use client';

import Link from 'next/link';
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CampoFecha, FormField, SegmentedControl } from '@/components/kit';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import { calcularMargen, costoDesdeMargen, descuentoComparacion, tonoMargen } from '../../logica/margen';
import { referenciaDesdeTexto, unidadParaModo } from '../../logica/formularioProducto';
import { decimalesCantidad, simboloUnidad, type ModoVenta } from '@/lib/pos/peso/modoVenta';
import {
  esReferenciaKilo,
  precioEnReferencia,
  precioPorUnidadDesdeReferencia,
  referenciasPermitidas,
  type ReferenciaPrecio,
} from '@/lib/pos/peso/precioReferencia';
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Precios y costos: precio de venta, de comparación (con «−N %»), costo,
 * margen bidireccional (editarlo recalcula el costo) y vigencia programable
 * («ahora» o un día futuro en la zona de la organización → instante).
 *
 * `partes` para el stepper móvil: «venta» (paso 1: solo precio de venta) y
 * «costos» (paso 2: comparación, costo, margen, vigencia).
 *
 * «Cómo se vende» (PRODUCTOS-POR-PESO-BASCULA.md, Figma P1/P3/P6): por unidad,
 * por peso (g, kg o lb) o por medida (metro o litro). Por peso, el precio se
 * puede escribir «cada 500/250/100/50 g», pero se guarda siempre por la unidad
 * de inventario (`estado.price`), así que el margen y el costo van en la misma.
 * En gramos, precio, comparación y costo se escriben «por kg» y se guardan por
 * gramo ($ 12.000/kg → $ 12/g).
 */
export interface SeccionPreciosProps extends PropsSeccionFormulario {
  partes?: 'todo' | 'venta' | 'costos';
}

const TONO_MARGEN = {
  exito: 'text-success-text',
  advertencia: 'text-warning-text',
  peligro: 'text-danger-text',
  neutro: 'text-fg-muted',
} as const;

/** Día calendario (YYYY-MM-DD) legible en el idioma activo, sin cambiar de zona. */
function diaLegible(dia: string, locale: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  if (!a || !m || !d) return dia;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d, 12)));
}

export function SeccionPrecios({ estado, cambiar, actualizar, errores, modo, moneda, hoy, productUuid, partes = 'todo' }: SeccionPreciosProps) {
  const t = useTranslations('productoForm.precios');
  const tErr = useTranslations('productoForm.errores');
  const fechas = useFormatDate();
  const localeIntl = useLocaleIntl();
  const error = (codigo: string | undefined) => (codigo ? tErr(codigo) : null);

  const verVenta = partes !== 'costos';
  const verCostos = partes !== 'venta';

  const margen = calcularMargen(estado.price, estado.cost);
  const descuento = descuentoComparacion(estado.price, estado.compare_price);
  const manana = addPlainDays(hoy, 1);
  const diaProgramado = estado.precio_desde ? fechas.toDate(new Date(estado.precio_desde)) : null;
  const porcentaje = (n: number) => new Intl.NumberFormat(localeIntl, { maximumFractionDigits: 1 }).format(n);

  // Cómo se vende: el precio se escribe en la referencia y se guarda por la unidad de venta.
  const modoVenta = estado.sale_mode;
  const medido = modoVenta !== 'unit' && estado.product_type !== 'service';
  const unidadVenta = (estado.unit_code ?? '').trim().toUpperCase();
  const simbolo = simboloUnidad(unidadVenta) || unidadVenta.toLowerCase();
  const referencia = modoVenta === 'weight' ? referenciaDesdeTexto(estado.precio_referencia) : null;
  const precioMostrado = referencia && estado.price !== null ? precioEnReferencia(estado.price, referencia, unidadVenta, moneda.decimales) : estado.price;
  const etiquetaReferencia = (cantidad: number, unidad: string) =>
    unidad === unidadVenta && cantidad === 1
      ? t('porUnidadVenta', { unidad: simbolo })
      : esReferenciaKilo({ cantidad, unidad })
        ? t('porUnidadVenta', { unidad: 'kg' })
        : t('cadaCantidad', { cantidad, unidad: simboloUnidad(unidad) });
  const decimalesMinimo = decimalesCantidad({ sale_mode: modoVenta, unit_code: unidadVenta });
  // En gramos, comparación y costo también se escriben por kg (se guardan por gramo).
  const porKiloEnGramos: ReferenciaPrecio | null = medido && modoVenta === 'weight' && unidadVenta === 'GR' ? { cantidad: 1000, unidad: 'GR' } : null;
  const simboloCosto = porKiloEnGramos ? 'kg' : simbolo;
  const mostrarPorKilo = (v: number | null) =>
    v !== null && porKiloEnGramos ? precioEnReferencia(v, porKiloEnGramos, unidadVenta, moneda.decimales) : v;
  const guardarPorKilo = (v: number | null) =>
    v !== null && porKiloEnGramos ? precioPorUnidadDesdeReferencia(v, porKiloEnGramos, unidadVenta, moneda.decimales) : v;
  // Por gramo el precio guardado lleva centavos aunque la moneda no los use ($ 12,50/g).
  const precioGuardadoTexto = (v: number) =>
    unidadVenta === 'GR' ? `${moneda.simbolo} ${new Intl.NumberFormat(localeIntl, { maximumFractionDigits: 2 }).format(v)}` : moneda.formatear(v);
  /** Referencia por defecto al elegir la unidad: en gramos, «por kg». */
  const referenciaPorDefecto = (unidad: string) => (unidad === 'GR' ? '1000GR' : '');
  const cambiarModo = (valor: ModoVenta) =>
    actualizar({
      sale_mode: valor,
      unit_code: unidadParaModo(valor, estado.unit_code),
      precio_referencia: valor === 'weight' ? referenciaPorDefecto(unidadParaModo(valor, estado.unit_code)) : '',
      require_scale: valor === 'weight' ? estado.require_scale : false,
      min_sale_qty: valor === modoVenta ? estado.min_sale_qty : null,
    });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {verVenta && estado.product_type !== 'service' && (
        <FormField
          etiqueta={t('comoSeVende')}
          error={error(errores.modo_venta)}
          ayuda={t(modoVenta === 'weight' ? 'comoSeVendeAyudaPeso' : modoVenta === 'measure' ? 'comoSeVendeAyudaMedida' : 'comoSeVendeAyuda')}
          className="md:col-span-2"
        >
          {(campo) => (
            <SegmentedControl
              aria-labelledby={campo.idEtiqueta}
              opciones={[
                { valor: 'unit', etiqueta: t('porUnidad') },
                { valor: 'weight', etiqueta: t('porPeso') },
                { valor: 'measure', etiqueta: t('porMedida') },
              ]}
              valor={modoVenta}
              onValorChange={(v) => cambiarModo(v as ModoVenta)}
            />
          )}
        </FormField>
      )}

      {verVenta && medido && (
        <FormField etiqueta={t(modoVenta === 'weight' ? 'unidadPeso' : 'unidadMedida')}>
          {(campo) => (
            <SegmentedControl
              aria-labelledby={campo.idEtiqueta}
              tamano="sm"
              opciones={
                modoVenta === 'weight'
                  ? [
                      { valor: 'GR', etiqueta: t('gramo') },
                      { valor: 'KG', etiqueta: t('kilogramo') },
                      { valor: 'LB', etiqueta: t('libra') },
                    ]
                  : [
                      { valor: 'MT', etiqueta: t('metro') },
                      { valor: 'LT', etiqueta: t('litro') },
                    ]
              }
              valor={unidadVenta}
              onValorChange={(v) => actualizar({ unit_code: v, precio_referencia: modoVenta === 'weight' ? referenciaPorDefecto(v) : '' })}
            />
          )}
        </FormField>
      )}

      {verVenta && modoVenta === 'weight' && medido && referenciasPermitidas(unidadVenta).length > 1 && (
        <FormField etiqueta={t('precioEscrito')} ayuda={t('precioEscritoAyuda')}>
          {(campo) => (
            <SegmentedControl
              aria-labelledby={campo.idEtiqueta}
              tamano="sm"
              opciones={referenciasPermitidas(unidadVenta).map((r) => ({
                valor: r.unidad === unidadVenta && r.cantidad === 1 ? '' : `${r.cantidad}${r.unidad}`,
                etiqueta: etiquetaReferencia(r.cantidad, r.unidad),
              }))}
              valor={estado.precio_referencia}
              onValorChange={(v) => cambiar('precio_referencia', v)}
            />
          )}
        </FormField>
      )}

      {verVenta && (
        <FormField
          etiqueta={
            medido
              ? referencia
                ? t('precioVentaCada', { referencia: etiquetaReferencia(referencia.cantidad, referencia.unidad) })
                : t('precioVentaPor', { unidad: simbolo })
              : t('precioVenta')
          }
          obligatorio
          error={error(errores.price)}
          ayuda={
            medido && referencia && estado.price !== null && estado.price > 0
              ? t('seGuardaComo', { precio: precioGuardadoTexto(estado.price), unidad: simbolo })
              : estado.price !== null && estado.price > 0
                ? moneda.formatear(estado.price)
                : t('precioVentaAyuda')
          }
          className={partes === 'venta' ? 'md:col-span-2' : undefined}
        >
          <CampoNumero
            id="producto-precio"
            valor={precioMostrado}
            onValorChange={(v) =>
              cambiar(
                'price',
                v !== null && referencia ? precioPorUnidadDesdeReferencia(v, referencia, unidadVenta, moneda.decimales) : v,
              )
            }
            prefijo={moneda.simbolo}
            sufijo={medido ? (referencia ? etiquetaReferencia(referencia.cantidad, referencia.unidad) : `/ ${simbolo}`) : undefined}
            decimales={moneda.decimales}
            minimo={0}
            placeholder="0"
          />
        </FormField>
      )}

      {verVenta && medido && (
        <FormField etiqueta={t('ventaMinima', { unidad: simbolo })} ayuda={t('ventaMinimaAyuda')}>
          <CampoNumero
            id="producto-venta-minima"
            valor={estado.min_sale_qty}
            onValorChange={(v) => cambiar('min_sale_qty', v)}
            sufijo={simbolo}
            decimales={decimalesMinimo}
            minimo={0}
          />
        </FormField>
      )}

      {verVenta && medido && modoVenta === 'weight' && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 md:col-span-2">
          <input
            type="checkbox"
            checked={estado.require_scale}
            onChange={(e) => cambiar('require_scale', e.target.checked)}
            className="mt-0.5 size-4 cursor-pointer rounded accent-brand-action"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-fg">{t('exigirBascula')}</span>
            <span className="text-xs text-fg-secondary">{t('exigirBasculaAyuda')}</span>
          </span>
        </label>
      )}

      {verCostos && (
        <>
          <FormField
            etiqueta={t('precioComparacion')}
            error={error(errores.compare_price)}
            ayuda={descuento !== null ? t('descuento', { porcentaje: descuento }) : t('precioComparacionAyuda')}
          >
            <CampoNumero
              id="producto-comparacion"
              valor={mostrarPorKilo(estado.compare_price)}
              onValorChange={(v) => cambiar('compare_price', guardarPorKilo(v))}
              prefijo={moneda.simbolo}
              decimales={moneda.decimales}
              minimo={0}
            />
          </FormField>

          <FormField etiqueta={medido ? t('costoPor', { unidad: simboloCosto }) : t('costo')} error={error(errores.cost)} ayuda={t('costoAyuda')}>
            <CampoNumero
              id="producto-costo"
              valor={mostrarPorKilo(estado.cost)}
              onValorChange={(v) => cambiar('cost', guardarPorKilo(v))}
              prefijo={moneda.simbolo}
              decimales={moneda.decimales}
              minimo={0}
            />
          </FormField>

          <FormField
            etiqueta={t('margen')}
            ayuda={
              margen !== null && estado.price !== null && estado.cost !== null ? (
                <span className={TONO_MARGEN[tonoMargen(margen)]}>
                  {t('utilidad', { valor: moneda.formatear(mostrarPorKilo(estado.price - estado.cost) ?? 0) })}
                </span>
              ) : (
                t('margenAyuda')
              )
            }
          >
            <CampoNumero
              id="producto-margen"
              valor={margen}
              onValorChange={(m) => {
                const costo = costoDesdeMargen(estado.price, m);
                if (costo !== null) cambiar('cost', costo);
              }}
              sufijo="%"
              decimales={1}
              maximo={99.9}
              disabled={!(estado.price !== null && estado.price > 0)}
            />
          </FormField>

          <FormField
            etiqueta={t('vigenteDesde')}
            error={error(errores.precio_desde)}
            ayuda={
              diaProgramado
                ? t('programadoAyuda', { fecha: diaLegible(diaProgramado, localeIntl) })
                : t('vigenteDesdeAyuda')
            }
          >
            {(campo) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  tamano="sm"
                  opciones={[
                    { valor: 'ahora', etiqueta: t('ahora') },
                    { valor: 'programar', etiqueta: t('programar') },
                  ]}
                  valor={estado.precio_desde ? 'programar' : 'ahora'}
                  onValorChange={(v) => cambiar('precio_desde', v === 'ahora' ? null : fechas.toInstant(manana))}
                />
                {estado.precio_desde && (
                  <CampoFecha
                    id={campo.id}
                    aria-describedby={campo['aria-describedby']}
                    aria-invalid={campo['aria-invalid']}
                    aria-label={t('diaVigencia')}
                    min={manana}
                    hoy={hoy}
                    valor={diaProgramado ?? manana}
                    onValorChange={(dia) => {
                      cambiar('precio_desde', dia ? fechas.toInstant(dia < manana ? manana : dia) : null);
                    }}
                    tamano="sm"
                    className="sm:w-44"
                  />
                )}
              </div>
            )}
          </FormField>

          {modo === 'editar' && productUuid && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">{t('historial')}</span>
              <Link
                href={`/app/inventario/productos/${productUuid}?tab=precios`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-subtle px-3 text-sm text-link hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <History aria-hidden className="size-4" strokeWidth={1.5} />
                {t('verHistorial')}
              </Link>
              <span className="text-xs text-fg-muted">{t('historialAyuda')}</span>
            </div>
          )}

          {margen !== null && (
            <p className="text-xs text-fg-muted md:col-span-2" aria-live="polite">
              {t('resumenMargen', { margen: porcentaje(margen) })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
