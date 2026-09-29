'use client';

/**
 * Asistente COMPARTIDO de alta de organización: organización → sucursal →
 * plan → pago (acceso v3, decisión v2-8 y R5; docs/design/AUTH-ACCESO-V2.md §13).
 *
 * Lo usan el registro (/auth/signup/organizacion, después de confirmar el
 * correo: no se pide tarjeta antes) y «Nueva organización» dentro de la app.
 * Solo pinta el cuerpo; quien lo usa pone el marco (TarjetaAcceso o el
 * diálogo) y los pasos. El alta va por `crearOrganizacionInicial` (una RPC
 * transaccional).
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import SubscriptionStep from '@/components/auth/SubscriptionStep';
import PaymentMethodStep from '@/components/auth/PaymentMethodStep';
import type { CouponData } from '@/components/auth/PriceSummary';
import { AvisoAcceso } from '@/components/kit/acceso';
import { crearOrganizacionInicial, type OrganizacionCreada } from '@/lib/services/altaOrganizacionService';
import { guardarOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { paisDesdeNavegador, senalesDelNavegador } from '@/lib/utils/paisNavegador';
import { PasoOrganizacion } from './PasoOrganizacion';
import { PasoSucursal } from './PasoSucursal';
import { ORGANIZACION_INICIAL, PLAN_INICIAL, SUCURSAL_INICIAL, datosParaAlta, type PlanAlta } from './tipos';

export type PasoAlta = 1 | 2 | 3 | 4;

export interface AsistenteAltaOrganizacionProps {
  modo: 'registro' | 'app';
  correo: string;
  nombre: string;
  apellido: string;
  referido?: string | null;
  onPaso?: (paso: PasoAlta) => void;
  onCreada: (org: OrganizacionCreada) => void;
  /** Solo en la app: cerrar el asistente desde el primer paso. */
  onCancelar?: () => void;
}

export function AsistenteAltaOrganizacion({ modo, correo, nombre, apellido, referido, onPaso, onCreada, onCancelar }: AsistenteAltaOrganizacionProps) {
  const t = useTranslations('acceso.alta');
  const [paso, setPaso] = React.useState<PasoAlta>(1);
  const [org, setOrg] = React.useState(() => ORGANIZACION_INICIAL(correo));
  const [suc, setSuc] = React.useState(() => ({ ...SUCURSAL_INICIAL, nombre: t('sucursalNombrePorDefecto') }));
  const [plan, setPlan] = React.useState<PlanAlta & { validatedCoupon?: CouponData | null }>(PLAN_INICIAL);
  const [creando, setCreando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (correo) setOrg((o) => (o.correo ? o : { ...o, correo }));
  }, [correo]);

  const ir = (p: PasoAlta) => {
    setPaso(p);
    onPaso?.(p);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finalizar = async () => {
    if (creando) return;
    setCreando(true);
    setError(null);
    try {
      const senales = senalesDelNavegador();
      const pais = org.ubicacion.paisCodigo;
      const zonaHoraria = paisDesdeNavegador([pais], senales) === pais ? senales.zonaHoraria ?? null : null;
      const creada = await crearOrganizacionInicial(
        supabase,
        datosParaAlta(org, suc, plan, { zonaHoraria, referido, nombreCliente: `${nombre} ${apellido}`.trim() }),
      );
      guardarOrganizacionActiva({ id: creada.id, name: creada.nombre, logo_url: org.logoUrl ?? undefined });
      onCreada(creada);
    } catch (e) {
      console.error('[alta] No se pudo crear la organización:', e);
      const m = e instanceof Error ? e.message : '';
      setError(/subdomain|subdominio|duplicate key/i.test(m) ? t('errorSubdominio') : t('errorCrear'));
      setCreando(false);
    }
  };

  if (creando) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
        <Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />
        <p className="text-sm text-fg-secondary">{t('creando')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <AvisoAcceso tono="error">{error}</AvisoAcceso>}
      {paso === 1 && (
        <PasoOrganizacion
          valor={org}
          onCambio={setOrg}
          onSiguiente={() => ir(2)}
          onAnterior={modo === 'app' ? onCancelar : undefined}
          permitirUnirse={modo === 'registro'}
        />
      )}
      {paso === 2 && <PasoSucursal organizacion={org} valor={suc} onCambio={setSuc} onSiguiente={() => ir(3)} onAnterior={() => ir(1)} />}
      {paso === 3 && (
        <SubscriptionStep
          formData={plan}
          updateFormData={(d: Partial<PlanAlta>) => setPlan((p) => ({ ...p, ...d }))}
          onNext={() => ir(4)}
          onBack={() => ir(2)}
        />
      )}
      {paso === 4 && (
        <PaymentMethodStep
          formData={{
            email: correo,
            firstName: nombre,
            lastName: apellido,
            subscriptionPlan: plan.subscriptionPlan,
            billingPeriod: plan.billingPeriod,
            skipTrial: plan.skipTrial,
            validatedCoupon: plan.validatedCoupon,
          }}
          updateFormData={(d: Partial<PlanAlta>) => setPlan((p) => ({ ...p, ...d }))}
          onNext={finalizar}
          onSkip={finalizar}
          onBack={() => ir(3)}
          loading={creando}
        />
      )}
    </div>
  );
}
