'use client';

/**
 * «Nueva organización» dentro de la app: el MISMO asistente que el registro
 * (acceso v3; docs/design/AUTH-ACCESO-V2.md §13, regla 7 de CLAUDE.md). Antes
 * tenía su propia copia del alta (organización, membresía, sucursal,
 * suscripción y Stripe) con su propia tabla de planes; ahora todo va por
 * `crearOrganizacionInicial` (RPC transaccional `fn_alta_organizacion`).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { ProgresoPasos } from '@/components/kit/acceso';
import { AsistenteAltaOrganizacion, type PasoAlta } from '@/components/auth/alta/AsistenteAltaOrganizacion';

interface CreatedOrganization {
  id: number;
  name: string;
  logo_url?: string | null;
}

interface CreateOrganizationWizardProps {
  onSuccess: (org: CreatedOrganization) => void;
  onCancel: () => void;
}

export default function CreateOrganizationWizard({ onSuccess, onCancel }: CreateOrganizationWizardProps) {
  const t = useTranslations('org.createOrgWizard');
  const [paso, setPaso] = useState<PasoAlta>(1);
  const [usuario, setUsuario] = useState<{ email: string; firstName: string; lastName: string } | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('profiles').select('first_name, last_name, email').eq('id', user.id).single();
      setUsuario({
        email: perfil?.email || user.email || '',
        firstName: perfil?.first_name || '',
        lastName: perfil?.last_name || '',
      });
    })();
  }, []);

  const etiquetas: Record<PasoAlta, string> = {
    1: t('steps.organization'),
    2: t('steps.branch'),
    3: t('steps.plan'),
    4: t('steps.payment'),
  };

  if (!usuario) return null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <ProgresoPasos actual={paso} total={4} etiqueta={etiquetas[paso]} />
      <AsistenteAltaOrganizacion
        modo="app"
        correo={usuario.email}
        nombre={usuario.firstName}
        apellido={usuario.lastName}
        onPaso={setPaso}
        onCancelar={onCancel}
        onCreada={(org) => onSuccess({ id: org.id, name: org.nombre })}
      />
    </div>
  );
}
