'use client';

/**
 * «Convertir en lead» (Figma 1303:85899), solo desde Calificado. Usa el MISMO
 * alta que `/api/crm/leads` vía `POST /api/crm/referrals/[id]/convert`:
 * ficha de cliente (lead) + origen «Referido». Si el correo o el teléfono ya
 * existen en `customers`, propone «Enlazar esa ficha» (`customer_id`) en vez
 * de duplicar; el 409 con `existing_customer` del servidor hace lo mismo.
 * Responsable (vacío → asignación automática) y monto estimado opcional.
 * «Embudo» y «Etapa inicial» del marco NO se piden: desde D2 el lead es la
 * ficha y no está en un embudo, y el alta los ignora (`leadCreateService`);
 * pedirlos sería prometer algo que no se guarda. Los errores 400/409 del alta
 * se muestran tal cual.
 */

import { useEffect, useState } from 'react';
import { ArrowRight, Link2, TriangleAlert } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { FormField } from '@/components/kit/FormField';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import { mensajeErrorTelefono } from '@/lib/utils/telefono';
import type { ReferralView } from '@/lib/services/crm/referralsService';
import { ConvertReferralError } from './useReferrals';
import { useReferidosFormato } from './useReferidosFormato';

interface Props {
  open: boolean;
  referral: ReferralView | null;
  onOpenChange: (open: boolean) => void;
  onConvert: (id: string, payload: Record<string, unknown>) => Promise<{ lead: { id: string; name: string } }>;
}

interface FichaExistente {
  id: string;
  nombre: string;
  detalle: string | null;
  por: 'correo' | 'telefono';
}

const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Busca una ficha con el mismo correo (exacto) o teléfono (8 últimos dígitos) en la organización. */
async function buscarDuplicado(email: string | null, phone: string | null): Promise<FichaExistente | null> {
  const orgId = getOrganizationId();
  if (!orgId || orgId <= 0) return null;
  if (email) {
    const { filas } = await buscarClientes(supabase, { organizationId: orgId, texto: email, limite: 5 });
    const f = filas.find((c) => (c.email ?? '').trim().toLowerCase() === email.trim().toLowerCase());
    if (f) return { id: f.id, nombre: f.full_name ?? '—', detalle: f.phone, por: 'correo' };
  }
  const tel = digitos(phone).slice(-8);
  if (tel.length === 8) {
    const { filas } = await buscarClientes(supabase, { organizationId: orgId, texto: tel, limite: 5 });
    const f = filas.find((c) => digitos(c.phone).endsWith(tel));
    if (f) return { id: f.id, nombre: f.full_name ?? '—', detalle: f.email, por: 'telefono' };
  }
  return null;
}

export function ConvertReferralDialog({ open, referral, onOpenChange, onConvert }: Props) {
  const { t, recompensa, simbolo } = useReferidosFormato();
  const escritorio = useEsEscritorio();
  const cat = useCatalogosCrm();
  const [duplicado, setDuplicado] = useState<FichaExistente | null>(null);
  const [enlazar, setEnlazar] = useState(false);
  const [responsable, setResponsable] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !referral) return;
    setDuplicado(null);
    setEnlazar(false);
    setResponsable('');
    setMonto(null);
    setEmail(referral.referred_email ?? '');
    setPhone(referral.referred_phone ?? '');
    setError(null);
    let vivo = true;
    buscarDuplicado(referral.referred_email, referral.referred_phone)
      .then((d) => vivo && setDuplicado(d))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [open, referral]);

  const sinContacto = !referral?.referred_email && !referral?.referred_phone;
  const pideContacto = sinContacto && !enlazar;

  const submit = async () => {
    if (!referral) return;
    if (pideContacto) {
      if (!email.trim() && !phone.trim()) return setError(t('convertirDialogo.faltaContacto'));
      const errTel = mensajeErrorTelefono(phone);
      if (errTel) return setError(errTel);
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        ...(enlazar && duplicado ? { customer_id: duplicado.id } : {}),
        ...(pideContacto ? { referred_email: email.trim() || null, referred_phone: phone.trim() || null } : {}),
        ...(responsable ? { salesperson_id: responsable } : {}),
        ...(monto !== null && monto > 0 ? { amount: monto } : {}),
      };
      await onConvert(referral.id, payload);
      toast({ title: t('toast.convertido'), description: t('toast.convertidoDescripcion', { nombre: referral.referred_name }) });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ConvertReferralError && err.existingCustomer) {
        setDuplicado({ id: err.existingCustomer.id, nombre: err.existingCustomer.full_name ?? '—', detalle: referral.referred_email, por: 'correo' });
      }
      setError(err instanceof Error ? err.message : t('errorDesconocido'));
    } finally {
      setSaving(false);
    }
  };

  const contacto = [referral?.referred_email, referral?.referred_phone].filter(Boolean).join(' · ');
  const programa = referral?.program ? `${referral.program.name} (${recompensa(referral.program, true)})` : t('programa.sin');

  return (
    <PanelAdaptable
      abierto={open}
      onAbiertoChange={onOpenChange}
      titulo={t('convertirDialogo.titulo')}
      descripcion={t('convertirDialogo.descripcion')}
      ancho={560}
      ocupado={saving}
      pie={
        <>
          <button type="button" disabled={saving} onClick={() => onOpenChange(false)} className={clasesBoton({ variante: 'secundario', anchoCompleto: !escritorio })}>
            {t('convertirDialogo.cancelar')}
          </button>
          <button type="submit" form="convertir-referido" disabled={saving} aria-busy={saving || undefined} className={clasesBoton({ anchoCompleto: !escritorio })}>
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {saving ? t('convertirDialogo.creando') : t('convertirDialogo.crear')}
          </button>
        </>
      }
    >
      <form id="convertir-referido" className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {referral && (
          <div className="rounded-xl bg-subtle px-4 py-3">
            <p className="text-[15px] font-semibold text-fg">{referral.referred_name}</p>
            <p className="mt-1 text-[13px] text-fg-secondary">{contacto || t('convertirDialogo.sinContacto')}</p>
            <p className="mt-0.5 text-[13px] text-fg-secondary">
              {t('convertirDialogo.referidaPor', { nombre: referral.referrer?.full_name ?? t('sinNombre') })} · {programa}
            </p>
          </div>
        )}

        {duplicado && !enlazar && (
          <AvisoTonal
            tono="advertencia"
            icono={TriangleAlert}
            titulo={t(duplicado.por === 'correo' ? 'convertirDialogo.duplicado' : 'convertirDialogo.duplicadoTelefono')}
            descripcion={[duplicado.nombre, duplicado.detalle].filter(Boolean).join(' · ')}
            accion={{ etiqueta: t('convertirDialogo.enlazar'), onClick: () => { setEnlazar(true); setError(null); } }}
          />
        )}
        {duplicado && enlazar && (
          <AvisoTonal
            tono="informacion"
            icono={Link2}
            titulo={t('convertirDialogo.enlazada', { nombre: duplicado.nombre })}
            accion={{ etiqueta: t('convertirDialogo.deshacer'), onClick: () => setEnlazar(false) }}
          />
        )}

        {pideContacto && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('convertirDialogo.correo')} ayuda={t('convertirDialogo.faltaContacto')}>
              <Input type="email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField etiqueta={t('convertirDialogo.telefono')}>
              {(c) => <PhoneInput id={c.id} aria-describedby={c['aria-describedby']} value={phone} autoComplete="off" onChange={setPhone} />}
            </FormField>
          </div>
        )}

        <FormField etiqueta={t('convertirDialogo.responsable')} ayuda={t('convertirDialogo.ayudaResponsable')}>
          {(c) => (
            <SelectCrm
              id={c.id}
              aria-describedby={c['aria-describedby']}
              valor={responsable}
              onValorChange={setResponsable}
              opcionVacia={t('convertirDialogo.automatico')}
              opciones={cat.usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
              disabled={cat.cargando}
            />
          )}
        </FormField>

        <FormField etiqueta={t('convertirDialogo.monto')}>
          {(c) => <CampoNumero id={c.id} valor={monto} onValorChange={setMonto} prefijo={simbolo} minimo={0} decimales={2} />}
        </FormField>

        {error && <AvisoTonal tono="peligro" rol="alert" titulo={t('convertirDialogo.error')} descripcion={error} />}
      </form>
    </PanelAdaptable>
  );
}
