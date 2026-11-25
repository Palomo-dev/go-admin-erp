'use client';

/**
 * «Registrar referido» (Figma 1303:85692; en móvil hoja inferior 1313:89380):
 * quién recomienda (clientes de la organización), a quién y en qué programa
 * activo. Validación en vivo con `validateRegisterForm` (la misma del modelo,
 * regla 7) y errores traducidos junto al campo. En móvil el correo se oculta
 * tras «Añadir correo». Guarda por `POST /api/crm/referrals` (lo hace quien
 * monta el diálogo); nace pendiente.
 */

import { useEffect, useMemo, useState } from 'react';
import { Info, Plus } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { FormField } from '@/components/kit/FormField';
import { CustomerPicker, type ClientePicker } from '@/components/kit/CustomerPicker';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import type { ReferralProgram, ReferralView } from '@/lib/services/crm/referralsService';
import { emptyRegisterForm, registerFormToPayload, REFERRED_NAME_MAX, validateRegisterForm, type FormError, type RegisterReferralForm } from '@/lib/services/crm/referralModel';
import { useReferidosFormato } from './useReferidosFormato';

interface Props {
  open: boolean;
  /** Referidor prellenado (desde «pedir referido» de F10). */
  preset: { id: string; name: string } | null;
  programs: ReferralProgram[];
  onOpenChange: (open: boolean) => void;
  onRegister: (payload: Record<string, unknown>) => Promise<ReferralView>;
}

/** Búsqueda de clientes con el servicio único (RPC `fn_clientes_buscar`, RLS de la sesión). */
async function buscarReferidor(texto: string): Promise<ClientePicker[]> {
  const orgId = getOrganizationId();
  if (!orgId || orgId <= 0) return [];
  const { filas } = await buscarClientes(supabase, { organizationId: orgId, texto, limite: 20 });
  return filas.map((c) => ({ id: c.id, nombre: c.full_name ?? '—', correo: c.email, telefono: c.phone }));
}

export function RegisterReferralDialog({ open, preset, programs, onOpenChange, onRegister }: Props) {
  const { t, recompensa } = useReferidosFormato();
  const escritorio = useEsEscritorio();
  const [form, setForm] = useState<RegisterReferralForm>(emptyRegisterForm);
  const [referidor, setReferidor] = useState<ClientePicker | null>(null);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conCorreo, setConCorreo] = useState(false);
  const activos = useMemo(() => programs.filter((p) => p.is_active), [programs]);

  useEffect(() => {
    if (!open) return;
    const first = activos.length === 1 ? activos[0].id : '';
    setForm({ ...emptyRegisterForm(), referrer_customer_id: preset?.id ?? null, referrer_name: preset?.name ?? null, program_id: first });
    setReferidor(preset ? { id: preset.id, nombre: preset.name } : null);
    setErrors([]);
    setServerError(null);
    setConCorreo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset?.id]);

  const update = (next: RegisterReferralForm) => {
    setForm(next);
    if (errors.length) setErrors(validateRegisterForm(next));
  };

  /** Error traducido del campo (el modelo valida; aquí solo se nombra). */
  const errorDe = (field: FormError['field']): string | undefined => {
    if (!errors.some((e) => e.field === field)) return undefined;
    if (field === 'referrer_customer_id') return t('registrarDialogo.errores.referidor');
    if (field === 'referred_name') return form.referred_name.trim() ? t('registrarDialogo.errores.nombreLargo', { max: REFERRED_NAME_MAX }) : t('registrarDialogo.errores.nombre');
    if (field === 'referred_email') return t('registrarDialogo.errores.correo');
    if (field === 'referred_phone') return t('registrarDialogo.errores.telefono');
    return undefined;
  };

  const submit = async () => {
    const errs = validateRegisterForm(form);
    setErrors(errs);
    if (errs.length) {
      if (errs.some((e) => e.field === 'referred_email')) setConCorreo(true);
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      const row = await onRegister(registerFormToPayload(form));
      toast({ title: t('toast.registrado'), description: t('toast.registradoDescripcion', { nombre: row.referred_name, referidor: form.referrer_name ?? '' }) });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('errorDesconocido'));
    } finally {
      setSaving(false);
    }
  };

  const mostrarCorreo = escritorio || conCorreo || !!form.referred_email;
  const campoCorreo = (
    <FormField etiqueta={t('registrarDialogo.correo')} error={errorDe('referred_email')}>
      <Input type="email" value={form.referred_email} autoComplete="off" onChange={(e) => update({ ...form, referred_email: e.target.value })} />
    </FormField>
  );
  const campoTelefono = (
    <FormField etiqueta={t('registrarDialogo.telefono')} error={errorDe('referred_phone')}>
      {(c) => <PhoneInput id={c.id} aria-describedby={c['aria-describedby']} value={form.referred_phone} autoComplete="off" onChange={(v) => update({ ...form, referred_phone: v })} />}
    </FormField>
  );

  return (
    <PanelAdaptable
      abierto={open}
      onAbiertoChange={onOpenChange}
      titulo={t('registrarDialogo.titulo')}
      descripcion={escritorio ? t('registrarDialogo.descripcion') : undefined}
      ancho={560}
      ocupado={saving}
      pie={
        <>
          <button type="button" disabled={saving} onClick={() => onOpenChange(false)} className={clasesBoton({ variante: escritorio ? 'secundario' : 'fantasma', anchoCompleto: !escritorio })}>
            {t('registrarDialogo.cancelar')}
          </button>
          <button type="submit" form="registrar-referido" disabled={saving} aria-busy={saving || undefined} className={clasesBoton({ anchoCompleto: !escritorio, tamano: escritorio ? 'md' : 'lg' })}>
            {saving ? t('registrarDialogo.guardando') : t('registrarDialogo.guardar')}
          </button>
        </>
      }
    >
      <form id="registrar-referido" className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <FormField etiqueta={t('registrarDialogo.referidor')} obligatorio error={errorDe('referrer_customer_id')}>
          {(c) => (
            <CustomerPicker
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              layout="campo"
              etiqueta={t('registrarDialogo.referidor')}
              cliente={referidor}
              buscar={(texto) => buscarReferidor(texto)}
              onCambiar={(cl) => {
                setReferidor(cl);
                update({ ...form, referrer_customer_id: cl.id, referrer_name: cl.nombre });
              }}
              onQuitar={() => {
                setReferidor(null);
                update({ ...form, referrer_customer_id: null, referrer_name: null });
              }}
            />
          )}
        </FormField>
        <FormField etiqueta={t('registrarDialogo.nombre')} obligatorio error={errorDe('referred_name')}>
          <Input value={form.referred_name} maxLength={REFERRED_NAME_MAX + 20} autoComplete="off" onChange={(e) => update({ ...form, referred_name: e.target.value })} />
        </FormField>
        {escritorio ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {campoCorreo}
            {campoTelefono}
          </div>
        ) : (
          <>
            {campoTelefono}
            {mostrarCorreo ? (
              campoCorreo
            ) : (
              <button type="button" onClick={() => setConCorreo(true)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'self-start text-brand-deep' })}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('registrarDialogo.anadirCorreo')}
              </button>
            )}
          </>
        )}
        <FormField etiqueta={t('registrarDialogo.programa')} ayuda={activos.length === 0 ? t('registrarDialogo.sinProgramasActivos') : undefined}>
          {(c) => (
            <SelectCrm
              id={c.id}
              aria-describedby={c['aria-describedby']}
              valor={form.program_id}
              onValorChange={(v) => update({ ...form, program_id: v })}
              opcionVacia={t('registrarDialogo.sinPrograma')}
              opciones={activos.map((p) => ({ valor: p.id, etiqueta: escritorio ? `${p.name} · ${recompensa(p, true)}` : p.name }))}
            />
          )}
        </FormField>
        {escritorio && <AvisoTonal tono="informacion" icono={Info} compacto titulo={t('registrarDialogo.aviso')} />}
        {serverError && <AvisoTonal tono="peligro" rol="alert" titulo={t('registrarDialogo.errorServidor')} descripcion={serverError} />}
      </form>
    </PanelAdaptable>
  );
}
