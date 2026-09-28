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
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Precios y costos: precio de venta, de comparación (con «−N %»), costo,
 * margen bidireccional (editarlo recalcula el costo) y vigencia programable
 * («ahora» o un día futuro en la zona de la organización → instante).
 *
 * `partes` para el stepper móvil: «venta» (paso 1: solo precio de venta) y
 * «costos» (paso 2: comparación, costo, margen, vigencia).
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

export function SeccionPrecios({ estado, cambiar, errores, modo, moneda, hoy, productUuid, partes = 'todo' }: SeccionPreciosProps) {
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

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {verVenta && (
        <FormField
          etiqueta={t('precioVenta')}
          obligatorio
          error={error(errores.price)}
          ayuda={estado.price !== null && estado.price > 0 ? moneda.formatear(estado.price) : t('precioVentaAyuda')}
          className={partes === 'venta' ? 'md:col-span-2' : undefined}
        >
          <CampoNumero
            id="producto-precio"
            valor={estado.price}
            onValorChange={(v) => cambiar('price', v)}
            prefijo={moneda.simbolo}
            decimales={moneda.decimales}
            minimo={0}
            placeholder="0"
          />
        </FormField>
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
              valor={estado.compare_price}
              onValorChange={(v) => cambiar('compare_price', v)}
              prefijo={moneda.simbolo}
              decimales={moneda.decimales}
              minimo={0}
            />
          </FormField>

          <FormField etiqueta={t('costo')} error={error(errores.cost)} ayuda={t('costoAyuda')}>
            <CampoNumero
              id="producto-costo"
              valor={estado.cost}
              onValorChange={(v) => cambiar('cost', v)}
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
                  {t('utilidad', { valor: moneda.formatear(estado.price - estado.cost) })}
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
