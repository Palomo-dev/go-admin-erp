'use client';

/**
 * Ronda 5 del Contador (C.Co. art. 1277): términos obligatorios del contrato recibido en mandato — el orden en que se
 * aplica lo recaudado para el dueño y la liquidación por escrito (medio y plazo). La MISMA pieza para recibir a mano
 * (dentro de las condiciones del contrato) y para aceptar la nota que llegó de otra organización, donde además se
 * declara la compensación de la remuneración (la copia del dueño no la trae). No es una pantalla nueva: son los
 * campos que ahora exige la base; el diseño definitivo sale de Figma.
 */
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MEDIOS_LIQUIDACION,
  ORDENES_APLICACION,
  liquidacionEscritaValida,
  ordenAplicacionValido,
  presetDeOrden,
  type CondicionesContrato,
  type ConceptoAplicacion,
  type MedioLiquidacion,
  type OrdenAplicacionPreset,
} from '@/lib/inventario/consignaciones/recibidas';

const NS = 'consignacionesR5.terminos';

interface Props {
  orden: ConceptoAplicacion[] | null;
  liquidacion: CondicionesContrato['liquidacionEscrita'];
  /** Para validar que, con compensación pactada, la remuneración esté en el orden. */
  compensacion: boolean | null;
  onOrden: (o: ConceptoAplicacion[]) => void;
  onLiquidacion: (l: CondicionesContrato['liquidacionEscrita']) => void;
  /** Solo al aceptar una nota de otra organización: quien recibe declara la compensación. */
  onCompensacion?: (c: boolean) => void;
  tocado: boolean;
  idBase: string;
}

export function TerminosLiquidacionCampos({ orden, liquidacion, compensacion, onOrden, onLiquidacion, onCompensacion, tocado, idBase }: Props) {
  const t = useTranslations(NS);
  const preset = presetDeOrden(orden);
  const errorOrden = tocado && !ordenAplicacionValido(orden, compensacion) ? t('errores.orden_aplicacion') : null;
  const errorLiquidacion = tocado && !liquidacionEscritaValida(liquidacion) ? t('errores.liquidacion_escrita') : null;
  const errorCompensacion = tocado && onCompensacion && compensacion === null ? t('errores.compensacion') : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {onCompensacion && (
        <FormField etiqueta={t('compensacion')} obligatorio ayuda={t('compensacionAyuda')} error={errorCompensacion}>
          {(c) => (
            <Select value={compensacion === null ? '' : compensacion ? 'si' : 'no'} onValueChange={(v) => onCompensacion(v === 'si')}>
              <SelectTrigger id={c.id ?? `${idBase}-compensacion`} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegir')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="si">{t('si')}</SelectItem>
                <SelectItem value="no">{t('no')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
      <div className="sm:col-span-2">
        <FormField etiqueta={t('orden')} obligatorio ayuda={t('ordenAyuda')} error={errorOrden}>
          {(c) => (
            <Select value={preset ?? ''} onValueChange={(v) => onOrden([...ORDENES_APLICACION[v as OrdenAplicacionPreset]])}>
              <SelectTrigger id={c.id ?? `${idBase}-orden`} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegir')} />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ORDENES_APLICACION) as OrdenAplicacionPreset[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`ordenes.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
      <FormField etiqueta={t('medio')} obligatorio error={errorLiquidacion}>
        {(c) => (
          <Select value={liquidacion.medio ?? ''} onValueChange={(v) => onLiquidacion({ ...liquidacion, medio: v as MedioLiquidacion })}>
            <SelectTrigger id={c.id ?? `${idBase}-medio`} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
              <SelectValue placeholder={t('elegir')} />
            </SelectTrigger>
            <SelectContent>
              {MEDIOS_LIQUIDACION.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`medios.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField etiqueta={t('plazo')} obligatorio ayuda={t('plazoAyuda')}>
        {(c) => (
          <Input
            id={c.id ?? `${idBase}-plazo`}
            aria-labelledby={c.idEtiqueta}
            inputMode="numeric"
            maxLength={2}
            value={liquidacion.plazoDias === null ? '' : String(liquidacion.plazoDias)}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '');
              onLiquidacion({ ...liquidacion, plazoDias: v === '' ? null : Number(v) });
            }}
          />
        )}
      </FormField>
    </div>
  );
}
