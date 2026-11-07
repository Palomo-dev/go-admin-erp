'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays, getDayRange } from '@/lib/utils/timezone';
import {
  bancosConFallo,
  cifrasConexion,
  esLinkConectado,
  filasCuentasConectadas,
  ultimaSincronizacion,
  type CuentaBanco,
  type CuentaGoAdmin,
  type LinkBanco,
} from '@/lib/services/integrations/openFinance/conexionBancariaLogica';

/**
 * Datos de «Conectar banco» (antes /open-finance: tablero con variables de
 * entorno). La organización de las rutas sale de la sesión; las lecturas
 * directas van por la RLS de pertenencia (`of_*_lectura`).
 */

interface Salud {
  isConfigured: boolean;
  activeLinks: number;
  lastSync: string | null;
  pendingTransactions: number;
}

export interface AutorizacionFila {
  id: string;
  link_id: string | null;
  consent_type: 'data_access' | 'payment_initiation' | 'account_validation' | string;
  purpose: string | null;
  granted_at: string | null;
  granted_by_name?: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  status: string | null;
  link?: { id: string; institution_name: string | null; status: string | null } | null;
}

export type EstadoCarga = 'cargando' | 'listo' | 'error';

async function leerJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/** Mensaje del servidor solo si es un código (`fuera_de_ventana`); nunca texto crudo. */
async function codigoError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
  const codigo = json?.code ?? json?.error;
  return typeof codigo === 'string' && /^[a-z_]+$/.test(codigo) ? codigo : 'desconocido';
}

export function useConexionBancaria() {
  const { getToday, timezone } = useFormatDate();
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [salud, setSalud] = useState<Salud | null>(null);
  const [links, setLinks] = useState<LinkBanco[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([]);
  const [cuentasGo, setCuentasGo] = useState<CuentaGoAdmin[]>([]);
  const [movimientos30, setMovimientos30] = useState<number | null>(null);
  const [autorizaciones, setAutorizaciones] = useState<AutorizacionFila[]>([]);
  const [estadoAutorizaciones, setEstadoAutorizaciones] = useState<EstadoCarga>('cargando');

  const cargarAutorizaciones = useCallback(async () => {
    try {
      const json = await leerJson<{ data?: AutorizacionFila[] }>('/api/integrations/open-finance/consents');
      if (!json) {
        setEstadoAutorizaciones('error');
        return;
      }
      setAutorizaciones(json.data ?? []);
      setEstadoAutorizaciones('listo');
    } catch {
      setEstadoAutorizaciones('error');
    }
  }, []);

  const cargarBancos = useCallback(async () => {
    const orgId = getOrganizationId();
    try {
      const [jsonSalud, jsonLinks] = await Promise.all([
        leerJson<{ data?: Salud }>('/api/integrations/open-finance/health'),
        leerJson<{ data?: LinkBanco[] }>('/api/integrations/open-finance/links'),
      ]);
      if (!jsonSalud?.data || !jsonLinks) {
        setEstado('error');
        return;
      }
      setSalud(jsonSalud.data);
      const listaLinks = jsonLinks.data ?? [];
      setLinks(listaLinks);

      if (!orgId || listaLinks.filter(esLinkConectado).length === 0) {
        setCuentas([]);
        setCuentasGo([]);
        setMovimientos30(0);
        setEstado('listo');
        return;
      }

      // Hace 30 días calendario en la zona de la organización; la columna es timestamptz.
      const desde = getDayRange(addPlainDays(getToday(), -30), timezone).start;
      const [resCuentas, resMovs] = await Promise.all([
        supabase
          .from('open_finance_accounts')
          .select('id, link_id, bank_account_id, account_number, account_type, currency, is_active, last_balance, last_balance_at')
          .eq('organization_id', orgId),
        supabase
          .from('open_finance_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('transaction_date', desde),
      ]);
      if (resCuentas.error) {
        setEstado('error');
        return;
      }
      const listaCuentas = (resCuentas.data ?? []) as CuentaBanco[];
      setCuentas(listaCuentas);
      setMovimientos30(resMovs.error ? null : resMovs.count ?? 0);

      const ids = [...new Set(listaCuentas.map((c) => c.bank_account_id).filter((x): x is number => x !== null))];
      if (ids.length > 0) {
        const { data } = await supabase
          .from('bank_accounts')
          .select('id, name, account_number, account_code')
          .eq('organization_id', orgId)
          .in('id', ids);
        setCuentasGo((data ?? []) as CuentaGoAdmin[]);
      } else {
        setCuentasGo([]);
      }
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [getToday, timezone]);

  const recargar = useCallback(async () => {
    await Promise.all([cargarBancos(), cargarAutorizaciones()]);
  }, [cargarBancos, cargarAutorizaciones]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /**
   * «Sincronizar ahora» = lo que antes eran dos botones: traer movimientos de
   * todos los bancos y refrescar saldos. Responde qué parte falló.
   */
  const sincronizar = useCallback(async (): Promise<{ movimientos: boolean; saldos: boolean }> => {
    const post = (url: string) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => r.ok)
        .catch(() => false);
    const movimientos = await post('/api/integrations/open-finance/sync');
    const saldos = await post('/api/integrations/open-finance/refresh-balances');
    await cargarBancos();
    return { movimientos, saldos };
  }, [cargarBancos]);

  const renovar = useCallback(
    async (id: string): Promise<{ ok: true } | { ok: false; codigo: string }> => {
      try {
        const res = await fetch(`/api/integrations/open-finance/consents/${encodeURIComponent(id)}/renew`, { method: 'POST' });
        if (!res.ok) return { ok: false, codigo: await codigoError(res) };
        await cargarAutorizaciones();
        return { ok: true };
      } catch {
        return { ok: false, codigo: 'desconocido' };
      }
    },
    [cargarAutorizaciones],
  );

  const revocar = useCallback(
    async (id: string, motivo: string): Promise<{ ok: true } | { ok: false; codigo: string }> => {
      try {
        const res = await fetch(`/api/integrations/open-finance/consents/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: motivo }),
        });
        if (!res.ok) return { ok: false, codigo: await codigoError(res) };
        await Promise.all([cargarAutorizaciones(), cargarBancos()]);
        return { ok: true };
      } catch {
        return { ok: false, codigo: 'desconocido' };
      }
    },
    [cargarAutorizaciones, cargarBancos],
  );

  const filas = useMemo(() => filasCuentasConectadas(links, cuentas, cuentasGo), [links, cuentas, cuentasGo]);
  const cifras = useMemo(() => cifrasConexion(links, filas), [links, filas]);
  const conFallo = useMemo(() => bancosConFallo(links), [links]);
  const ultima = useMemo(() => ultimaSincronizacion(links), [links]);

  return {
    estado,
    salud,
    filas,
    cifras,
    movimientos30,
    conFallo,
    ultimaSincronizacion: ultima,
    autorizaciones,
    estadoAutorizaciones,
    recargar,
    sincronizar,
    renovar,
    revocar,
  };
}
