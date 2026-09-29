'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Barcode, CalendarClock, Info, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { FormField } from '@/components/kit/FormField';
import { Switch } from '@/components/ui/switch';
import type { PropsSeccionFormulario } from '../tipos';
import { ConstructorPatronSerial } from './ConstructorPatronSerial';

/**
 * «Trazabilidad» del formulario único de producto (Figma 09 · Nuevo producto,
 * dentro de «Inventario por sucursal»; sheet «Trazabilidad de Seriales y
 * Garantía» del detalle). Solo el contenido: el marco lo pone `ProductoForm`.
 *
 * - «Maneja lotes y vencimientos» (track_lots, B7): la venta descuenta por FEFO
 *   y cada entrada lleva lote; el stock inicial pide el lote. Sin control de
 *   existencias no se puede activar. Las variantes lo heredan en el servidor.
 * - «Requiere número de serial» (track_serial).
 * - «Meses de garantía» (entero ≥ 0): cada serial nuevo recibe su garantía desde el día de alta.
 * - «Auto-generar seriales» + patrón con el constructor de tokens. El patrón
 *   también lo usa «Generar seriales» del detalle, así que se muestra siempre
 *   que el producto tenga seriales; es obligatorio solo con auto-generación
 *   (`validarFormulario` → errores.serial_pattern).
 *
 * Nunca escribe en la base: todo va en `fn_producto_guardar`.
 */
export function SeccionTrazabilidad({ estado, cambiar, errores, hoy, modo }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.trazabilidad');
  const tErr = useTranslations('productoForm.errores');
  const base = useId();
  const idSerial = `${base}-serial`;
  const idAuto = `${base}-auto`;
  const idLotes = `${base}-lotes`;
  const tl = useTranslations('productoForm.trazabilidad.lotes');

  const errorGarantia = errores.warranty_months ? tErr(errores.warranty_months) : null;
  const errorPatron = errores.serial_pattern ? tErr(errores.serial_pattern) : null;
  const sinInventario = !estado.track_stock || estado.product_type === 'service';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Barcode aria-hidden="true" className="size-4 text-fg-secondary" />
        <h3 className="text-sm font-semibold text-fg">{t('titulo')}</h3>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor={idLotes} className="flex items-center gap-1.5 text-sm font-medium text-fg">
              <CalendarClock aria-hidden="true" className="size-4 text-fg-secondary" />
              {tl('etiqueta')}
            </label>
            <p id={`${idLotes}-ayuda`} className="text-xs text-fg-secondary">
              {sinInventario ? tl('sinInventario') : tl('ayuda')}
            </p>
          </div>
          <Switch
            id={idLotes}
            checked={estado.track_lots && !sinInventario}
            disabled={sinInventario}
            onCheckedChange={(v) => cambiar('track_lots', v)}
            aria-describedby={`${idLotes}-ayuda`}
          />
        </div>
        {estado.track_lots && !sinInventario && (modo === 'editar' || estado.tiene_variantes) && (
          <p className="flex items-start gap-2 text-xs text-fg-muted">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {modo === 'editar' ? tl('notaEditar') : tl('notaVariantes')}
          </p>
        )}
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-3">
        <div className="min-w-0">
          <label htmlFor={idSerial} className="text-sm font-medium text-fg">
            {t('requiereSerial')}
          </label>
          <p id={`${idSerial}-ayuda`} className="text-xs text-fg-secondary">
            {t('requiereSerialAyuda')}
          </p>
        </div>
        <Switch
          id={idSerial}
          checked={estado.track_serial}
          onCheckedChange={(v) => cambiar('track_serial', v)}
          aria-describedby={`${idSerial}-ayuda`}
        />
      </div>

      {estado.track_serial && (
        <div className="space-y-4 border-l-2 border-line-brand pl-4">
          {sinInventario && (
            <p className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-xs text-warning-text">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {t('sinInventario')}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('garantia')} ayuda={t('garantiaAyuda')} error={errorGarantia}>
              <CampoNumero
                valor={estado.warranty_months}
                onValorChange={(v) => cambiar('warranty_months', v === null ? null : Math.max(0, Math.round(v)))}
                decimales={0}
                minimo={0}
                sufijo={t('meses')}
                placeholder="12"
              />
            </FormField>
            {!!estado.warranty_months && estado.warranty_months > 0 && (
              <p className="flex items-center gap-2 self-center rounded-lg bg-success-subtle px-3 py-2 text-xs text-success-text">
                <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
                {t('garantiaResumen', { count: estado.warranty_months })}
              </p>
            )}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-3">
            <div className="min-w-0">
              <label htmlFor={idAuto} className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <Sparkles aria-hidden="true" className="size-4 text-warning-text" />
                {t('autoGenerar')}
              </label>
              <p id={`${idAuto}-ayuda`} className="text-xs text-fg-secondary">
                {t('autoGenerarAyuda')}
              </p>
            </div>
            <Switch
              id={idAuto}
              checked={estado.auto_generate_serial}
              onCheckedChange={(v) => cambiar('auto_generate_serial', v)}
              aria-describedby={`${idAuto}-ayuda`}
            />
          </div>

          <FormField
            etiqueta={t('patron.etiqueta')}
            obligatorio={estado.auto_generate_serial}
            ayuda={estado.auto_generate_serial ? t('patron.ayudaAuto') : t('patron.ayudaManual')}
            error={errorPatron}
          >
            {(c) => (
              <ConstructorPatronSerial
                id={c.id}
                valor={estado.serial_pattern}
                onCambiar={(v) => cambiar('serial_pattern', v)}
                sku={estado.sku}
                hoy={hoy}
                error={errorPatron}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>

          {(estado.tiene_variantes || modo === 'editar') && (
            <p className="flex items-start gap-2 text-xs text-fg-muted">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {estado.tiene_variantes ? t('notaVariantes') : t('notaEditar')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
