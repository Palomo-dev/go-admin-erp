'use client';

/**
 * Ronda 4 del Contador: revertir o reintegrar reteICA exige el procedimiento VALIDADO del municipio de la retención
 * (solicitud, certificado y las pruebas que ese municipio pide). No se traslada el de otro municipio: sin procedimiento,
 * el formulario lo dice y la base lo bloquea (`reteica_sin_procedimiento_municipal`).
 */
import { useTranslations } from 'next-intl';
import { AvisoTonal, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';

const NS = 'finanzasTercerosR4.anticipos';

export interface CamposPruebasIcaProps {
  /** Pruebas que exige el procedimiento validado; `null` = el municipio no tiene procedimiento validado. */
  pruebas: readonly string[] | null;
  valores: Record<string, string>;
  onCambio: (v: Record<string, string>) => void;
  tocado: boolean;
}

export function CamposPruebasIca({ pruebas, valores, onCambio, tocado }: CamposPruebasIcaProps) {
  const t = useTranslations(NS);
  if (!pruebas) {
    return <AvisoTonal tono="peligro" titulo={t('ica.sinProcedimientoTitulo')} descripcion={t('ica.sinProcedimientoDescripcion')} />;
  }
  const campos = ['solicitud', 'certificado', ...pruebas];
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-medium text-fg">{t('ica.titulo')}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {campos.map((k) => (
          <FormField
            key={k}
            etiqueta={k === 'solicitud' ? t('ica.solicitud') : k === 'certificado' ? t('ica.certificado') : t('ica.prueba', { nombre: k.replace(/_/g, ' ') })}
            obligatorio
            error={tocado && (valores[k] ?? '').trim().length < 3 ? t('validacion.soporte') : null}
          >
            <Input value={valores[k] ?? ''} onChange={(e) => onCambio({ ...valores, [k]: e.target.value })} maxLength={500} />
          </FormField>
        ))}
      </div>
    </fieldset>
  );
}
