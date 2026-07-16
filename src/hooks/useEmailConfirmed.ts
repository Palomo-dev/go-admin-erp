'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';

/**
 * Hook para verificar si el correo del usuario actual está confirmado.
 * Se usa para restringir acciones sensibles (cambiar contraseña, facturación,
 * invitar usuarios) a solo cuentas con email confirmado.
 */
export function useEmailConfirmed() {
  const [confirmed, setConfirmed] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (mounted) setConfirmed(!!user?.email_confirmed_at);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setConfirmed(!!session?.user?.email_confirmed_at);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { confirmed, loading };
}
