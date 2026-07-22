'use client';

import { useEffect, useState } from 'react';
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
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

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

        const orgId = parseInt(orgIdStr, 10);
        if (isNaN(orgId)) {
          setChecked(true);
          return;
        }

        // Consultar estado de la organización
        const { data: org } = await supabase
          .from('organizations')
          .select('status')
          .eq('id', orgId)
          .single();

        if (org?.status === 'suspended' || org?.status === 'deleted') {
          router.push(`/app/cuenta-congelada?reason=${org.status}`);
          return;
        }

        // Consultar suscripción
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status, trial_end, current_period_end')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!sub) {
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

        setChecked(true);
      } catch (error) {
        console.error('Error in useSubscriptionGuard:', error);
        setChecked(true); // En caso de error, permitir acceso
      }
    };

    checkStatus();
  }, [pathname, router]);

  return checked;
}
