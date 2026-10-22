'use client';

import { useEffect, useState } from 'react';
import { ContabilidadService, type ChartAccount } from './ContabilidadService';
import { esCuentaDeMovimiento } from '@/lib/finanzas/contabilidad/cuentaLinea';

const CLASE =
  'h-10 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white';

let cargando: Promise<ChartAccount[]> | null = null;

function cuentasDeMovimiento(): Promise<ChartAccount[]> {
  cargando ??= ContabilidadService.obtenerPlanCuentas()
    .then((cuentas) => cuentas.filter((c) => esCuentaDeMovimiento(c, cuentas)))
    .catch((error) => {
      cargando = null;
      throw error;
    });
  return cargando;
}

/** Select nativo: un Select de Radix dentro de un diálogo cierra el diálogo. */
export function CampoCuentaContable({
  value,
  onChange,
  id,
  vacio = 'Sin cuenta propia',
}: {
  value: string | null | undefined;
  onChange: (cuenta: string | null) => void;
  id?: string;
  vacio?: string;
}) {
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);

  useEffect(() => {
    let vivo = true;
    cuentasDeMovimiento()
      .then((lista) => vivo && setCuentas(lista))
      .catch(() => vivo && setCuentas([]));
    return () => {
      vivo = false;
    };
  }, []);

  const actual = (value ?? '').trim();
  const opciones = actual && !cuentas.some((c) => c.account_code === actual)
    ? [{ account_code: actual, name: 'Cuenta guardada' } as ChartAccount, ...cuentas]
    : cuentas;

  return (
    <select id={id} className={CLASE} value={actual} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{vacio}</option>
      {opciones.map((c) => (
        <option key={c.account_code} value={c.account_code}>
          {c.account_code} — {c.name}
        </option>
      ))}
    </select>
  );
}
