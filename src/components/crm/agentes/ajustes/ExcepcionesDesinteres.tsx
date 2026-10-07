'use client';

/**
 * Excepciones de «Cuando el cliente no tiene interés» (Figma
 * `VozDesinteres/Configuración`): por valor (monto + moneda) y por etapa
 * avanzada. Solo aplican al marcar perdida; con otro modo quedan
 * deshabilitadas. Accesible: cada interruptor tiene su etiqueta y descripción.
 */

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/kit/FormField';
import { CampoNumero } from '@/components/kit/CampoNumero';
import type { BorradorDesinteres, ErroresBorrador, VistaDesinteres } from './desinteresVozLogica';

export function ExcepcionesDesinteres({
  borrador,
  vista,
  lectura,
  errores,
  cambiar,
}: {
  borrador: BorradorDesinteres;
  vista: VistaDesinteres;
  lectura: boolean;
  errores: ErroresBorrador;
  cambiar: (parcial: Partial<BorradorDesinteres>) => void;
}) {
  const t = useTranslations('crm.agentesIa.ajustes.desinteres');
  const variosPipelines = new Set(vista.etapas.map((e) => e.pipelineId)).size > 1;
  const textoError = (c?: string) => (c ? t(`errores.${c}`) : null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-fg">{t('excepciones.titulo')}</p>
        <p className="text-sm text-fg-muted">{borrador.modo === 'mark_lost' ? t('excepciones.descripcion') : t('excepciones.soloPerdida')}</p>
      </div>

      <FilaInterruptor
        titulo={t('excepciones.valor.titulo')}
        descripcion={t('excepciones.valor.descripcion')}
        activa={borrador.valorActiva}
        deshabilitada={lectura || borrador.modo !== 'mark_lost'}
        onCambio={(v) => cambiar({ valorActiva: v })}
      />
      {borrador.valorActiva && (
        <div className="flex flex-col gap-3 md:pl-12">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField etiqueta={t('excepciones.valor.monto')} obligatorio error={textoError(errores.monto)}>
              <CampoNumero
                valor={borrador.monto}
                onValorChange={(v) => cambiar({ monto: v })}
                prefijo="$"
                decimales={2}
                inputMode="decimal"
                disabled={lectura || borrador.modo !== 'mark_lost'}
              />
            </FormField>
            <FormField etiqueta={t('excepciones.valor.moneda')} obligatorio ayuda={t('excepciones.valor.monedaAyuda')} error={textoError(errores.moneda)}>
              {(campo) => (
                <Select value={borrador.moneda ?? undefined} onValueChange={(v) => cambiar({ moneda: v })} disabled={lectura || borrador.modo !== 'mark_lost'}>
                  <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']} aria-required>
                    <SelectValue placeholder={t('excepciones.valor.monedaPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {vista.monedas.map((m) => (
                      <SelectItem key={m} value={m}>{m === vista.monedaBase ? t('excepciones.valor.monedaBase', { codigo: m }) : m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>
          <p className="flex items-start gap-2 text-xs text-fg-muted">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {t('excepciones.valor.comoSeCompara')}
          </p>
        </div>
      )}

      <FilaInterruptor
        titulo={t('excepciones.etapa.titulo')}
        descripcion={t('excepciones.etapa.descripcion')}
        activa={borrador.etapaActiva}
        deshabilitada={lectura || borrador.modo !== 'mark_lost' || vista.etapas.length === 0}
        onCambio={(v) => cambiar({ etapaActiva: v })}
      />
      {borrador.etapaActiva && (
        <div className="md:pl-12">
          <FormField etiqueta={t('excepciones.etapa.campo')} obligatorio ayuda={t('excepciones.etapa.ayuda')} error={textoError(errores.etapa)}>
            {(campo) => (
              <Select value={borrador.etapaId ?? undefined} onValueChange={(v) => cambiar({ etapaId: v })} disabled={lectura || borrador.modo !== 'mark_lost'}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']} aria-required>
                  <SelectValue placeholder={t('excepciones.etapa.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {vista.etapas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {variosPipelines
                        ? t('excepciones.etapa.opcionConPipeline', { pipeline: e.pipelineNombre, etapa: e.nombre, orden: e.orden, total: e.total })
                        : t('excepciones.etapa.opcion', { etapa: e.nombre, orden: e.orden, total: e.total })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
      )}
    </div>
  );
}

function FilaInterruptor({
  titulo,
  descripcion,
  activa,
  deshabilitada,
  onCambio,
}: {
  titulo: string;
  descripcion: string;
  activa: boolean;
  deshabilitada: boolean;
  onCambio: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={activa} onCheckedChange={onCambio} disabled={deshabilitada} aria-describedby={`${id}-d`} className="mt-0.5" />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-fg">{titulo}</label>
        <p id={`${id}-d`} className="text-sm text-fg-secondary">{descripcion}</p>
      </div>
    </div>
  );
}
