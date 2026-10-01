'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, Loader2, XCircle } from 'lucide-react';
import { FormField } from '@/components/kit/FormField';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { CLASE_AREA, CLASE_AVISO_INFO, CLASE_CAMPO, simboloMoneda } from './camposCrm';
import { SelectCrm } from './SelectCrm';
import { cuerpoPerder, DIAS_RECONTACTO, esCompetencia, motivosVisibles, validarPerder, valoresInicialesPerder, type MotivoPerdida, type ValoresPerder } from './loseDialogLogica';

/**
 * Perder oportunidad (Figma `LoseDialog` 761:24268) con el catálogo de
 * motivos de la organización; «Eligió a la competencia» pide competidor y
 * precio. Diálogo en escritorio, hoja en móvil. `onPerder` recibe el cuerpo
 * de `POST …/lose` (mueve a la etapa perdida y conserva el resto de
 * `metadata`). Sin motivos en el catálogo no se puede perder: lo dice.
 */
export interface LoseDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  oportunidad: { name: string; amount: number | string | null };
  /** Moneda de la oportunidad. */
  moneda: ContextoMoneda;
  motivos: readonly MotivoPerdida[];
  cargandoMotivos?: boolean;
  stageId?: string;
  onPerder: (cuerpo: ReturnType<typeof cuerpoPerder>) => Promise<void> | void;
  ocupado?: boolean;
  error?: string | null;
}

export function LoseDialog({ abierto, onAbiertoChange, oportunidad, moneda, motivos, cargandoMotivos, stageId, onPerder, ocupado, error }: LoseDialogProps) {
  const t = useTranslations('crm.kit.perder');
  const { getToday } = useFormatDate();
  const [v, setV] = useState<ValoresPerder>(valoresInicialesPerder);
  const [intentado, setIntentado] = useState(false);
  useEffect(() => {
    if (abierto) { setV(valoresInicialesPerder()); setIntentado(false); }
  }, [abierto]);

  const lista = motivosVisibles(motivos);
  const motivo = lista.find((m) => m.id === v.motivoId) ?? null;
  const errores = validarPerder(v, motivo);
  const err = (k: keyof ValoresPerder) => (intentado && errores[k] ? t(`error.${errores[k]}`) : null);
  const cambiar = (p: Partial<ValoresPerder>) => setV((x) => ({ ...x, ...p }));
  const sinCatalogo = !cargandoMotivos && lista.length === 0;

  const perder = () => {
    setIntentado(true);
    if (!motivo || Object.keys(errores).length) return;
    void onPerder(cuerpoPerder(v, motivo, getToday(), stageId));
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={`«${oportunidad.name}» · ${formatMoneda(oportunidad.amount, moneda)}`}
      icono={XCircle}
      ancho={520}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" onClick={() => onAbiertoChange(false)} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>{t('cancelar')}</button>
          <button type="button" onClick={perder} disabled={ocupado || sinCatalogo} aria-busy={ocupado || undefined} className={clasesBoton({ variante: 'destructivo' })}>
            {ocupado && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {t('marcarPerdida')}
          </button>
        </>
      }
    >
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      {sinCatalogo ? (
        <p role="alert" className="rounded-lg bg-warning-subtle px-3 py-2 text-[13px] text-warning-text">{t('sinCatalogo')}</p>
      ) : (
        <FormField etiqueta={t('motivo')} obligatorio error={err('motivoId')}>
          <SelectCrm
            valor={v.motivoId}
            disabled={cargandoMotivos}
            aria-busy={cargandoMotivos || undefined}
            onValorChange={(motivoId) => cambiar({ motivoId })}
            opcionVacia={cargandoMotivos ? t('cargando') : t('elegir')}
            opciones={lista.map((m) => ({ valor: m.id, etiqueta: m.label }))}
          />
        </FormField>
      )}
      {esCompetencia(motivo) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('competidor')} obligatorio error={err('competidor')}>
            <input value={v.competidor} onChange={(e) => cambiar({ competidor: e.target.value })} className={CLASE_CAMPO} />
          </FormField>
          <FormField etiqueta={t('precioCompetidor')} error={err('precioCompetidor')}>
            <input inputMode="decimal" value={v.precioCompetidor} onChange={(e) => cambiar({ precioCompetidor: e.target.value })} placeholder={`${simboloMoneda(moneda)} 0`} className={CLASE_CAMPO} />
          </FormField>
        </div>
      )}
      <FormField etiqueta={t('quePaso')}>
        <textarea value={v.notas} onChange={(e) => cambiar({ notas: e.target.value })} className={CLASE_AREA} />
      </FormField>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={v.crearSeguimiento} onChange={(e) => cambiar({ crearSeguimiento: e.target.checked })} className="size-4 rounded border-line-strong accent-brand-action" />
        {t('seguimiento', { dias: DIAS_RECONTACTO })}
      </label>
      <p className={CLASE_AVISO_INFO}>
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {t('conserva')}
      </p>
    </PanelAdaptable>
  );
}
