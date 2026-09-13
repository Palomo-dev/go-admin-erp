'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';

const ALLOWED_ROUTES = [
  '/app/cuenta-congelada',
  '/app/plan',
  '/app/organizacion',
  '/app/roles',
];

export function useSubscriptionGuard() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [checked, setChecked] = useState(false);
  const lastCheckedOrgRef = useRef<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      // No verificar si estamos en una ruta permitida
      const isAllowed = ALLOWED_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (isAllowed) {
        setChecked(true);
        return;
      }

      try {
        // Obtener org_id desde localStorage
        const orgIdStr = localStorage.getItem('currentOrganizationId');
        if (!orgIdStr) {
          setChecked(true);
          return;
        }

        // Skip si ya verificamos para esta organización — el estado de
        // suscripción no cambia entre navegaciones, solo cuando cambia la org.
        // Esto evita 2 queries a Supabase en CADA cambio de ruta.
        if (lastCheckedOrgRef.current === orgIdStr) {
          setChecked(true);
          return;
        }

        const orgId = parseInt(orgIdStr, 10);
        if (isNaN(orgId)) {
          setChecked(true);
          return;
        }

        // Timeout de seguridad: si las queries tardan más de 4s, permitir
        // acceso para no dejar la app en skeleton indefinidamente. El
        // middleware del servidor también valida el estado de la org.
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SUBSCRIPTION_CHECK_TIMEOUT')), 4000)
        );

        // Consultar estado de la organización y suscripción en paralelo
        const [orgResult, subResult] = await Promise.race([
          Promise.all([
            supabase
              .from('organizations')
              .select('status')
              .eq('id', orgId)
              .single(),
            supabase
              .from('subscriptions')
              .select('status, trial_end, current_period_end')
              .eq('organization_id', orgId)
              .order('created_at', { ascending: false })
              .limit(1)
              .single(),
          ]),
          timeoutPromise,
        ]) as [{ data: { status?: string } | null; error: unknown }, { data: { status?: string; trial_end?: string; current_period_end?: string } | null; error: unknown }];

        const org = orgResult.data;
        const sub = subResult.data;

        if (org?.status === 'suspended' || org?.status === 'deleted') {
          router.push(`/app/cuenta-congelada?reason=${org.status}`);
          return;
        }

        if (!sub) {
          lastCheckedOrgRef.current = orgIdStr;
          setChecked(true);
          return;
        }

        const now = new Date();

        if (sub.status === 'canceled') {
          router.push('/app/cuenta-congelada?reason=canceled');
          return;
        }

        if (sub.status === 'past_due') {
          router.push('/app/cuenta-congelada?reason=payment_failed');
          return;
        }

        if (sub.status === 'trialing') {
          const trialEnd = sub.trial_end ? new Date(sub.trial_end) : (sub.current_period_end ? new Date(sub.current_period_end) : null);
          if (trialEnd && trialEnd < now) {
            router.push('/app/cuenta-congelada?reason=trial_expired');
            return;
          }
        }

        if (sub.status === 'incomplete' || sub.status === 'incomplete_expired') {
          router.push('/app/cuenta-congelada?reason=trial_expired');
          return;
        }

        lastCheckedOrgRef.current = orgIdStr;
        setChecked(true);
      } catch (error) {
        console.error('Error in useSubscriptionGuard:', error);
        // En caso de error o timeout, permitir acceso. El middleware
        // del servidor valida el estado en cada request, así que no
        // hay riesgo de seguridad en fallar abiertamente aquí.
        setChecked(true);
      }
    };

    checkStatus();
  }, [pathname, router]);

  return checked;
}
