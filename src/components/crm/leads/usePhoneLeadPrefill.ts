'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { aE164 } from '@/lib/utils/telefono';

/** Una URL solo prellena; la creación sigue en el formulario y API canónicos. */
export function phoneLeadPrefill(params: URLSearchParams): string | null {
  const number = params.get('phone');
  return params.get('create') === '1' && number && /^\+[1-9][0-9]{6,14}$/.test(number) && aE164(number) === number ? number : null;
}
export function usePhoneLeadPrefill(loading: boolean, allowed: boolean, open: (value: boolean) => void) {
  const router = useRouter();
  const query = useSearchParams();
  const [initialPhone, setInitialPhone] = useState<string | null>(null);
  const raw = query?.toString() ?? '';
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(raw);
    if (params.get('create') !== '1') return;
    const number = phoneLeadPrefill(params);
    params.delete('create'); params.delete('phone');
    const rest = params.toString();
    router.replace(`${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`, { scroll: false });
    if (allowed && number) { setInitialPhone(number); open(true); }
  }, [loading, allowed, raw, router, open]);
  return { initialPhone, clearInitialPhone: () => setInitialPhone(null) };
}
