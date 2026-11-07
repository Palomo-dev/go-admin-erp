'use client';

import { useCallback, useEffect, useState } from 'react';
import { pedirApi, type CuentaAbono, type Dispersion, type ResumenDispersiones } from './cobrosLogica';

/**
 * Lecturas de «Cobros y dispersiones». La organización la pone el servidor
 * (sesión): no se manda `organizationId` en la query.
 */
export function useCobrosDispersiones(habilitado: boolean) {
  const [resumen, setResumen] = useState<ResumenDispersiones | null>(null);
  const [dispersiones, setDispersiones] = useState<Dispersion[]>([]);
  const [cargandoDispersiones, setCargandoDispersiones] = useState(true);
  const [errorDispersiones, setErrorDispersiones] = useState<string | null>(null);

  const [cuentas, setCuentas] = useState<CuentaAbono[]>([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);
  const [errorCuentas, setErrorCuentas] = useState<string | null>(null);

  const cargarDispersiones = useCallback(async () => {
    setCargandoDispersiones(true);
    setErrorDispersiones(null);
    try {
      const [r, lista] = await Promise.all([
        pedirApi<ResumenDispersiones>('/api/integrations/payfac/payouts/summary'),
        pedirApi<Dispersion[]>('/api/integrations/payfac/payouts?limit=500'),
      ]);
      setResumen(r);
      setDispersiones(Array.isArray(lista) ? lista : []);
    } catch (e) {
      console.error('Error cargando dispersiones:', e);
      setErrorDispersiones(e instanceof Error ? e.message : String(e));
    } finally {
      setCargandoDispersiones(false);
    }
  }, []);

  const cargarCuentas = useCallback(async () => {
    setCargandoCuentas(true);
    setErrorCuentas(null);
    try {
      const lista = await pedirApi<CuentaAbono[]>('/api/integrations/payfac/payout-accounts');
      setCuentas(Array.isArray(lista) ? lista : []);
    } catch (e) {
      console.error('Error cargando cuentas de abono:', e);
      setErrorCuentas(e instanceof Error ? e.message : String(e));
    } finally {
      setCargandoCuentas(false);
    }
  }, []);

  useEffect(() => {
    if (!habilitado) return;
    void cargarDispersiones();
    void cargarCuentas();
  }, [habilitado, cargarDispersiones, cargarCuentas]);

  return {
    resumen,
    dispersiones,
    cargandoDispersiones,
    errorDispersiones,
    cargarDispersiones,
    cuentas,
    cargandoCuentas,
    errorCuentas,
    cargarCuentas,
  };
}
