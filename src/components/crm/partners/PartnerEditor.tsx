'use client';

/**
 * Crear/editar un partner en hoja lateral (desde «Nuevo partner» del
 * directorio y «Editar» de la ficha). Validación junto al campo
 * (`validatePartnerForm`) con foco al primer error; los errores del servidor
 * (correo repetido, nivel ajeno, sin permiso) se traducen por su `code`.
 * La tasa propia vacía = hereda la del nivel (se guarda 0).
 * Escribe por `/api/crm/partners/**` (admin/manager en el servidor).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import type { PartnerTier } from '@/lib/services/crm/partnerService';
import { formatRate, partnerFormToPayload, partnerToForm, validatePartnerForm, type FieldError, type PartnerForm } from '@/lib/services/crm/partnerModel';
import type { PartnerView } from '@/lib/services/crm/partnerService';
import { claveErrorPartners } from './redPartnersErrores';

const NO_TIER = '__none__';

/** Clave i18n de cada mensaje de `validatePartnerForm` (los mensajes del modelo están en español). */
function claveValidacion(e: FieldError<keyof PartnerForm>): string {
  if (e.field === 'name') return 'editor.errores.nombre';
  if (e.field === 'email') return e.message.includes('formato') ? 'editor.errores.correoFormato' : 'editor.errores.correo';
  if (e.field === 'phone') return 'editor.errores.telefono';
  return 'editor.errores.tasa';
}

interface Props {
  abierto: boolean;
  partner: PartnerView | null;
  tiers: PartnerTier[];
  onAbiertoChange: (abierto: boolean) => void;
  onGuardar: (payload: Record<string, unknown>, id?: string) => Promise<unknown>;
}

export function PartnerEditor({ abierto, partner, tiers, onAbiertoChange, onGuardar }: Props) {
  const t = useTranslations('crm.redPartners');
  const [form, setForm] = useState<PartnerForm>(() => partnerToForm(null));
  const [errores, setErrores] = useState<FieldError<keyof PartnerForm>[]>([]);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setForm(partnerToForm(partner));
    setErrores([]);
    setErrorServidor(null);
  }, [abierto, partner]);

  useEffect(() => {
    if (!foco) return;
    document.getElementById(foco)?.focus();
    setFoco(null);
  }, [foco]);

  const actualizar = (next: PartnerForm) => {
    setForm(next);
    if (errores.length) setErrores(validatePartnerForm(next));
  };
  const errorDe = (f: keyof PartnerForm) => {
    const e = errores.find((x) => x.field === f);
    return e ? t(claveValidacion(e)) : undefined;
  };
  const tier = tiers.find((x) => x.id === form.tier_id) ?? null;

  const enviar = async () => {
    const errs = validatePartnerForm(form);
    setErrores(errs);
    if (errs.length) return setFoco(`partner-${errs[0].field}`);
    setGuardando(true);
    setErrorServidor(null);
    try {
      await onGuardar(partnerFormToPayload(form), partner?.id);
      toast({ title: partner ? t('editor.actualizado') : t('editor.creado'), description: form.name.trim() });
      onAbiertoChange(false);
    } catch (e) {
      setErrorServidor(t(claveErrorPartners(e)));
      setFoco('partner-server-error');
    } finally {
      setGuardando(false);
    }
  };

  const campo = (key: keyof PartnerForm, etiqueta: string, extra: { type?: string; placeholder?: string; ayuda?: string } = {}) => {
    const err = errorDe(key);
    const id = `partner-${key}`;
    const describe = err ? `${id}-error` : extra.ayuda ? `${id}-hint` : undefined;
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-sm font-medium text-fg">{etiqueta}</Label>
        {extra.type === 'tel' ? (
          <PhoneInput id={id} value={String(form[key])} autoComplete="off" aria-invalid={!!err} showValidation={false} aria-describedby={describe} onChange={(v) => actualizar({ ...form, [key]: v })} />
        ) : (
          <Input id={id} type={extra.type ?? 'text'} value={String(form[key])} placeholder={extra.placeholder} autoComplete="off" aria-invalid={!!err} aria-describedby={describe} onChange={(e) => actualizar({ ...form, [key]: e.target.value })} />
        )}
        {err ? (
          <p id={`${id}-error`} role="alert" className="text-xs text-danger-text">{err}</p>
        ) : extra.ayuda ? (
          <p id={`${id}-hint`} className="text-xs text-fg-secondary">{extra.ayuda}</p>
        ) : null}
      </div>
    );
  };

  return (
    <Sheet open={abierto} onOpenChange={(next) => { if (!guardando) onAbiertoChange(next); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 bg-canvas p-0 sm:max-w-xl">
        <SheetHeader className="text-left border-b border-line bg-surface px-6 pr-8 py-4">
          <SheetTitle className="text-fg">{partner ? t('editor.tituloEditar', { nombre: partner.name }) : t('editor.tituloNuevo')}</SheetTitle>
          <SheetDescription className="text-fg-secondary">{t('editor.descripcion')}</SheetDescription>
        </SheetHeader>
        <form className="flex-1 space-y-4 overflow-y-auto px-6 py-4" noValidate onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          {campo('name', t('editor.nombre'))}
          {campo('company_name', t('editor.empresa'))}
          <div className="grid gap-4 sm:grid-cols-2">
            {campo('email', t('editor.correo'), { type: 'email', ayuda: t('editor.correoAyuda') })}
            {campo('phone', t('editor.telefono'), { type: 'tel' })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partner-tier_id" className="text-sm font-medium text-fg">{t('editor.nivel')}</Label>
              <Select value={form.tier_id || NO_TIER} onValueChange={(v) => actualizar({ ...form, tier_id: v === NO_TIER ? '' : v })}>
                <SelectTrigger id="partner-tier_id" className="text-left [&>span]:line-clamp-1" aria-describedby="partner-tier-hint"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TIER}>{t('nivel.sinNivel')}</SelectItem>
                  {tiers.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} · {formatRate(x.commission_rate)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p id="partner-tier-hint" className="text-xs text-fg-secondary">{t('editor.nivelAyuda')}</p>
            </div>
            {campo('commission_rate', t('editor.tasaPropia'), {
              type: 'number',
              placeholder: tier ? t('editor.heredaTasa', { tasa: formatRate(tier.commission_rate) }) : t('editor.sinNivelTasa'),
              ayuda: t('editor.tasaAyuda'),
            })}
          </div>
          {errorServidor && (
            <div id="partner-server-error" tabIndex={-1}>
              <AvisoTonal tono="peligro" titulo={t('editor.errorGuardar')} descripcion={errorServidor} rol="alert" />
            </div>
          )}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">{t('editor.guardar')}</button>
        </form>
        <SheetFooter className="gap-3 border-t border-line bg-surface px-6 py-3 sm:justify-between">
          <div className="flex items-center gap-2 self-center">
            <Switch id="partner-is_active" checked={form.is_active} disabled={guardando} onCheckedChange={(v) => actualizar({ ...form, is_active: v })} />
            <Label htmlFor="partner-is_active" className="text-sm text-fg">{form.is_active ? t('estado.activo') : t('estado.inactivo')}</Label>
          </div>
          <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
            <button type="button" disabled={guardando} onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario' })}>{t('editor.cancelar')}</button>
            <button type="button" disabled={guardando} onClick={() => void enviar()} className={clasesBoton()}>
              {guardando ? t('editor.guardando') : partner ? t('editor.guardarCambios') : t('editor.crear')}
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
