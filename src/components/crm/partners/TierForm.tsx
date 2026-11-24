'use client';

/** Formulario de un nivel (crear o editar en su sitio dentro de `TierEditor`). Validación: `validateTierForm`. */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import type { PartnerTier } from '@/lib/services/crm/partnerService';
import { formatRate, tierFormToPayload, tierToForm, validateTierForm, type FieldError, type TierForm as EstadoForm } from '@/lib/services/crm/partnerModel';
import { claveErrorPartners } from './redPartnersErrores';

interface Props {
  tier: PartnerTier | null;
  onGuardar: (payload: Record<string, unknown>, id?: string) => Promise<unknown>;
  onCancelar: () => void;
}

const CLAVE_ERROR: Record<keyof EstadoForm, string> = {
  name: 'nivelForm.errores.nombre',
  min_deals: 'nivelForm.errores.deals',
  min_revenue: 'nivelForm.errores.revenue',
  commission_rate: 'nivelForm.errores.tasa',
  benefitsText: 'nivelForm.errores.nombre',
};

export function TierForm({ tier, onGuardar, onCancelar }: Props) {
  const t = useTranslations('crm.redPartners');
  const [f, setF] = useState<EstadoForm>(() => tierToForm(tier));
  const [errores, setErrores] = useState<FieldError<keyof EstadoForm>[]>([]);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const prefijo = `tier-${tier?.id ?? 'new'}`;

  useEffect(() => {
    if (!foco) return;
    document.getElementById(foco)?.focus();
    setFoco(null);
  }, [foco]);

  const actualizar = (next: EstadoForm) => {
    setF(next);
    if (errores.length) setErrores(validateTierForm(next));
  };
  const errorDe = (k: keyof EstadoForm) => (errores.some((e) => e.field === k) ? t(CLAVE_ERROR[k]) : undefined);

  const enviar = async () => {
    const errs = validateTierForm(f);
    setErrores(errs);
    if (errs.length) return setFoco(`${prefijo}-${errs[0].field}`);
    setGuardando(true);
    setErrorServidor(null);
    try {
      await onGuardar(tierFormToPayload(f), tier?.id);
      toast({ title: tier ? t('nivelForm.actualizado') : t('nivelForm.creado'), description: `${f.name.trim()} · ${formatRate(Number(f.commission_rate))}` });
      onCancelar();
    } catch (e) {
      setErrorServidor(t(claveErrorPartners(e)));
      setFoco(`${prefijo}-server-error`);
    } finally {
      setGuardando(false);
    }
  };

  const numero = (k: 'min_deals' | 'min_revenue' | 'commission_rate', etiqueta: string, paso: string) => {
    const err = errorDe(k);
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefijo}-${k}`} className="text-sm font-medium text-fg">{etiqueta}</Label>
        <Input id={`${prefijo}-${k}`} type="number" inputMode="decimal" min={0} step={paso} value={f[k]} aria-invalid={!!err} aria-describedby={err ? `${prefijo}-${k}-error` : undefined} onChange={(e) => actualizar({ ...f, [k]: e.target.value })} />
        {err && <p id={`${prefijo}-${k}-error`} role="alert" className="text-xs text-danger-text">{err}</p>}
      </div>
    );
  };

  return (
    <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefijo}-name`} className="text-sm font-medium text-fg">{t('nivelForm.nombre')}</Label>
        <Input id={`${prefijo}-name`} value={f.name} autoComplete="off" aria-invalid={!!errorDe('name')} aria-describedby={errorDe('name') ? `${prefijo}-name-error` : undefined} onChange={(e) => actualizar({ ...f, name: e.target.value })} />
        {errorDe('name') && <p id={`${prefijo}-name-error`} role="alert" className="text-xs text-danger-text">{errorDe('name')}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {numero('min_deals', t('nivelForm.dealsMinimos'), '1')}
        {numero('min_revenue', t('nivelForm.revenueMinimo'), 'any')}
        {numero('commission_rate', t('nivelForm.tasa'), 'any')}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefijo}-benefits`} className="text-sm font-medium text-fg">{t('nivelForm.beneficios')}</Label>
        <Textarea id={`${prefijo}-benefits`} rows={3} value={f.benefitsText} onChange={(e) => actualizar({ ...f, benefitsText: e.target.value })} />
      </div>
      {errorServidor && (
        <div id={`${prefijo}-server-error`} tabIndex={-1}>
          <AvisoTonal tono="peligro" titulo={t('editor.errorGuardar')} descripcion={errorServidor} rol="alert" />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={guardando} onClick={onCancelar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>{t('editor.cancelar')}</button>
        <button type="submit" disabled={guardando} className={clasesBoton({ tamano: 'sm' })}>
          {guardando ? t('editor.guardando') : tier ? t('nivelForm.guardar') : t('nivelForm.crear')}
        </button>
      </div>
    </form>
  );
}
