'use client';

/**
 * Datos de apoyo de la lista de Métodos de pago (además de los métodos, que
 * carga la página): cuentas bancarias (para «Entra a»), conexiones de las
 * pasarelas, si la organización exige caja abierta para cobrar y los pagos por
 * código (aviso «usados y sin configurar»). Todo lectura; nada se escribe.
 *
 * Un fallo de estas lecturas no tumba la lista: se muestra sin ese dato
 * (`usoPorMetodo` null = «no se pudo contar», nunca «0 pagos»).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import type { ConexionBasica, CuentaBancariaBasica } from '@/lib/finanzas/metodosPagoLista';

export interface DatosListaMetodos {
  bancos: CuentaBancariaBasica[];
  conexiones: ConexionBasica[];
  exigeCaja: boolean;
  usoPorMetodo: Record<string, number> | null;
  cargando: boolean;
}

export function useDatosListaMetodos(
  organizationId: number | null | undefined,
  idsConexion: readonly string[],
  recarga: number,
): DatosListaMetodos {
  const [datos, setDatos] = useState<DatosListaMetodos>({
    bancos: [],
    conexiones: [],
    exigeCaja: true,
    usoPorMetodo: null,
    cargando: true,
  });
  const claveConexiones = [...idsConexion].sort().join(',');

  useEffect(() => {
    if (!organizationId) return;
    let vigente = true;
    setDatos((d) => ({ ...d, cargando: true }));
    const ids = claveConexiones ? claveConexiones.split(',') : [];

    const bancos = Promise.resolve(
      supabase.from('bank_accounts').select('id, name, bank_name, account_number').eq('organization_id', organizationId),
    )
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as CuentaBancariaBasica[];
      })
      .catch((e: unknown) => {
        console.error('Métodos de pago: cuentas bancarias', e);
        return [] as CuentaBancariaBasica[];
      });

    const conexiones = ids.length
      ? Promise.resolve(supabase.from('integration_connections').select('id, name, status').in('id', ids))
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []) as ConexionBasica[];
          })
          .catch((e: unknown) => {
            console.error('Métodos de pago: conexiones', e);
            return [] as ConexionBasica[];
          })
      : Promise.resolve([] as ConexionBasica[]);

    // La misma lectura que usa Configuración › POS; si falla, el POS la exige (valor por defecto).
    const exigeCaja = ConfiguracionService.getRequireCashSessionConfig()
      .then((c) => c.require_cash_session !== false)
      .catch(() => true);

    const uso = fetch('/api/finanzas/metodos-pago/uso', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'x-organization-id': String(organizationId) },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`uso de métodos ${r.status}`);
        const cuerpo = (await r.json()) as { porMetodo?: Record<string, number> };
        return cuerpo.porMetodo ?? {};
      })
      .catch((e: unknown) => {
        console.error('Métodos de pago: pagos por método', e);
        return null;
      });

    void Promise.all([bancos, conexiones, exigeCaja, uso]).then(([b, c, caja, u]) => {
      if (!vigente) return;
      setDatos({ bancos: b, conexiones: c, exigeCaja: caja, usoPorMetodo: u, cargando: false });
    });
    return () => {
      vigente = false;
    };
  }, [organizationId, claveConexiones, recarga]);

  return datos;
}
