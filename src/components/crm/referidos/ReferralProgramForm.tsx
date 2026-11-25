'use client';

/**
 * Formulario de un programa de referidos (Figma 1301:85046, «Editar
 * «Recomienda y gana»»): nombre (único por organización), descripción, tipo y
 * destinatario en chips (valores del CHECK de `referral_programs`), valor con
 * el símbolo de la moneda base (o % si es descuento), «Programa activo» y la
 * vista previa. Lo usan la hoja «Programas» y la tarjeta de configuración del
 * CRM: UN solo formulario. Sin lógica de negocio: valida junto al campo y
 * entrega el payload; guarda quien lo monta (`/api/crm/referrals/programs`).
 */

import { useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/kit/FormField';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import type { ReferralProgram } from '@/lib/services/crm/referralsService';
import { REWARD_TO, REWARD_TYPES, type RewardTo, type RewardType } from '@/lib/services/crm/referralReward';
import { useReferidosFormato } from './useReferidosFormato';

export interface ProgramFormPayload {
  name: string;
  description: string | null;
  reward_type: string;
  reward_amount: number;
  reward_to: string;
  is_active: boolean;
}

interface Props {
  program: ReferralProgram | null;
  /** Se conserva por compatibilidad: el formato sale de la moneda base de la organización. */
  currency?: string | null;
  /** Prefijo de ids para poder montar dos formularios en la misma página. */
  idPrefix?: string;
  onSave: (payload: ProgramFormPayload, id?: string) => Promise<unknown>;
  onCancel?: () => void;
  submitLabel?: string;
  /** Acción secundaria a la izquierda del pie (p. ej. «Eliminar programa»). */
  extraPie?: React.ReactNode;
}

interface State {
  name: string;
  description: string;
  reward_type: RewardType;
  reward_amount: number | null;
  reward_to: RewardTo;
  is_active: boolean;
}

function fromProgram(p: ReferralProgram | null): State {
  return {
    name: p?.name ?? '',
    description: p?.description ?? '',
    reward_type: ((REWARD_TYPES as readonly string[]).includes(p?.reward_type ?? '') ? p!.reward_type : 'credit') as RewardType,
    reward_amount: p ? Number(p.reward_amount) : null,
    reward_to: ((REWARD_TO as readonly string[]).includes(p?.reward_to ?? '') ? p!.reward_to : 'both') as RewardTo,
    is_active: p?.is_active ?? true,
  };
}

export type ErrorPrograma = 'nombre' | 'valor' | 'descuento';

/** Validación del programa (la misma regla que aplica el servidor: nombre, valor ≥ 0, descuento ≤ 100). */
export function validateProgramForm(s: { name: string; reward_type: string; reward_amount: number | null }): { name?: ErrorPrograma; reward_amount?: ErrorPrograma } {
  const errors: { name?: ErrorPrograma; reward_amount?: ErrorPrograma } = {};
  if (!s.name.trim()) errors.name = 'nombre';
  const n = s.reward_amount;
  if (n === null || !Number.isFinite(n) || n < 0) errors.reward_amount = 'valor';
  else if (s.reward_type === 'discount' && n > 100) errors.reward_amount = 'descuento';
  return errors;
}

export function ReferralProgramForm({ program, idPrefix = 'program', onSave, onCancel, submitLabel, extraPie }: Props) {
  const { t, recompensa, simbolo } = useReferidosFormato();
  const f = (k: string, v?: Record<string, string | number>) => t(`programaForm.${k}`, v);
  const [s, setS] = useState<State>(() => fromProgram(program));
  const [errors, setErrors] = useState<ReturnType<typeof validateProgramForm>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const id = (k: string) => `${idPrefix}-${k}`;

  useEffect(() => {
    setS(fromProgram(program));
    setErrors({});
    setServerError(null);
  }, [program]);

  const update = (next: State) => {
    setS(next);
    if (Object.keys(errors).length) setErrors(validateProgramForm(next));
  };

  const submit = async () => {
    const errs = validateProgramForm(s);
    setErrors(errs);
    if (errs.name) return document.getElementById(id('name'))?.focus();
    if (errs.reward_amount) return document.getElementById(id('amount'))?.focus();
    setSaving(true);
    setServerError(null);
    try {
      await onSave(
        { name: s.name.trim(), description: s.description.trim() || null, reward_type: s.reward_type, reward_amount: s.reward_amount ?? 0, reward_to: s.reward_to, is_active: s.is_active },
        program?.id,
      );
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('errorDesconocido'));
    } finally {
      setSaving(false);
    }
  };

  const esDescuento = s.reward_type === 'discount';
  const vista = recompensa({ reward_type: s.reward_type, reward_amount: s.reward_amount ?? 0, reward_to: s.reward_to }, true);

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <FormField id={id('name')} etiqueta={f('nombre')} obligatorio ayuda={f('nombreAyuda')} error={errors.name ? f(`errores.${errors.name}`) : null}>
        <Input value={s.name} placeholder={f('nombrePlaceholder')} autoComplete="off" onChange={(e) => update({ ...s, name: e.target.value })} />
      </FormField>
      <FormField id={id('description')} etiqueta={f('descripcion')}>
        <Input value={s.description} placeholder={f('descripcionPlaceholder')} autoComplete="off" onChange={(e) => update({ ...s, description: e.target.value })} />
      </FormField>
      <FormField id={id('type')} etiqueta={f('tipo')}>
        {(c) => (
          <ChipsOpcion<RewardType>
            aria-labelledby={c.idEtiqueta}
            valor={s.reward_type}
            onValorChange={(v) => update({ ...s, reward_type: v })}
            opciones={REWARD_TYPES.map((v) => ({ valor: v, etiqueta: t(`tipo.${v}`) }))}
          />
        )}
      </FormField>
      <FormField
        id={id('amount')}
        etiqueta={esDescuento ? f('porcentaje') : f('valor')}
        ayuda={f('valorAyuda')}
        error={errors.reward_amount ? f(`errores.${errors.reward_amount}`) : null}
      >
        {(c) => (
          <CampoNumero
            id={c.id}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
            valor={s.reward_amount}
            onValorChange={(v) => update({ ...s, reward_amount: v })}
            prefijo={esDescuento ? undefined : simbolo}
            sufijo={esDescuento ? '%' : undefined}
            minimo={0}
            maximo={esDescuento ? 100 : undefined}
            decimales={2}
            alinear="derecha"
          />
        )}
      </FormField>
      <FormField id={id('to')} etiqueta={f('para')}>
        {(c) => (
          <ChipsOpcion<RewardTo>
            aria-labelledby={c.idEtiqueta}
            valor={s.reward_to}
            onValorChange={(v) => update({ ...s, reward_to: v })}
            opciones={REWARD_TO.map((v) => ({ valor: v, etiqueta: f(`paraOpciones.${v}`) }))}
          />
        )}
      </FormField>
      <div className="flex items-start gap-3">
        <Switch id={id('active')} checked={s.is_active} disabled={saving} onCheckedChange={(v) => update({ ...s, is_active: v })} aria-describedby={id('active-ayuda')} />
        <div>
          <label htmlFor={id('active')} className="text-sm font-medium text-fg">{f('activo')}</label>
          <p id={id('active-ayuda')} className="text-[13px] text-fg-secondary">{f('activoAyuda')}</p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-xl bg-brand-tint px-4 py-3" aria-live="polite">
        <Ticket aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" strokeWidth={1.5} />
        <div>
          <p className="text-[13px] text-fg-secondary">{f('vista')}</p>
          <p className="text-sm font-semibold text-brand-deep">{vista}</p>
        </div>
      </div>
      {serverError && <AvisoTonal tono="peligro" rol="alert" titulo={f('errorServidor')} descripcion={serverError} />}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center">
        {extraPie && <div className="sm:mr-auto">{extraPie}</div>}
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
          {onCancel && (
            <button type="button" disabled={saving} onClick={onCancel} className={clasesBoton({ variante: 'secundario' })}>
              {f('cancelar')}
            </button>
          )}
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className={clasesBoton()}>
            {saving ? f('guardando') : submitLabel ?? (program ? f('guardar') : f('crear'))}
          </button>
        </div>
      </div>
    </form>
  );
}
