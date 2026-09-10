'use client';

/**
 * Estado de Configuración › CRM › Email: dominios (+ acciones) y ajustes de
 * la org (política de fallback, tracking, firma del usuario).
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import type { EmailDomain } from '@/lib/services/crm/email/types';
import { createDomain, deleteDomain, getEmailSettings, listDomains, patchEmailSettings, setDefaultDomain, updateDomain, verifyDomain, type EmailSettings } from '@/components/crm/email/emailApi';

export function useEmailSettings() {
  const [domains, setDomains] = useState<EmailDomain[]>([]);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, s] = await Promise.all([listDomains(), getEmailSettings()]);
      setDomains(d.data);
      setSettings(s.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración de email');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, okTitle?: string): Promise<T | null> => {
    setBusy(key);
    try {
      const r = await fn();
      if (okTitle) toast({ title: okTitle });
      return r;
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const upsertDomain = (d: EmailDomain) => setDomains((list) => {
    const others = list.filter((x) => x.id !== d.id).map((x) => (d.is_default ? { ...x, is_default: false } : x));
    return [d, ...others].sort((a, b) => Number(b.is_default) - Number(a.is_default));
  });

  return {
    domains, settings, loading, error, busy, refresh,
    addDomain: (body: Record<string, unknown>) => run('add', async () => { const r = await createDomain(body); upsertDomain(r.data); return r.data; }, 'Dominio creado. Publica los registros DNS y verifica.'),
    verify: (id: string) => run(`verify:${id}`, async () => { const r = await verifyDomain(id); upsertDomain(r.data); return r.data; }),
    makeDefault: (id: string) => run(`default:${id}`, async () => { const r = await setDefaultDomain(id); upsertDomain(r.data); return r.data; }, 'Remitente por defecto actualizado'),
    update: (id: string, body: Record<string, unknown>) => run(`update:${id}`, async () => { const r = await updateDomain(id, body); upsertDomain(r.data); return r.data; }, 'Dominio actualizado'),
    remove: (id: string) => run(`remove:${id}`, async () => { await deleteDomain(id); setDomains((l) => l.filter((d) => d.id !== id)); return true; }, 'Dominio eliminado'),
    savePolicy: (body: Partial<Pick<EmailSettings, 'email_fallback_policy' | 'email_tracking_transactional'>>) =>
      run('policy', async () => { await patchEmailSettings(body); setSettings((s) => (s ? { ...s, ...body } : s)); return true; }, 'Política guardada'),
    saveSignature: (signature_html: string) =>
      run('signature', async () => { await patchEmailSettings({ signature_html }); setSettings((s) => (s ? { ...s, signature_html } : s)); return true; }, 'Firma guardada'),
  };
}

export type EmailSettingsApi = ReturnType<typeof useEmailSettings>;
