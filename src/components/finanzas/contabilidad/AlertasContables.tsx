'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import {
  ContabilidadService,
  type AlertasContablesDatos,
  type FalloContable,
} from './ContabilidadService';

const MOTIVOS: Record<string, string> = {
  amount_invalid: 'Importe no válido',
  no_rule: 'No hay regla contable para este hecho',
  cuenta_banco_sin_puc: 'La cuenta bancaria no tiene PUC',
  sin_cuenta: 'No hay cuenta de detalle para el movimiento',
  cuenta_no_existe: 'La cuenta no existe en el plan',
  cuenta_de_titulo: 'La cuenta es de título y no recibe movimientos',
};

function motivoLegible(fallo: FalloContable): string {
  const codigo = fallo.motivo ?? '';
  return MOTIVOS[codigo] ?? (codigo || 'Fallo contable');
}

/**
 * Fallos de asiento aún abiertos y asientos que quedaron sin líneas.
 * Si la función todavía no está desplegada, no bloquea la pantalla.
 */
export function AlertasContables() {
  const { formatDate } = useFormatDate();
  const [datos, setDatos] = useState<AlertasContablesDatos | null>(null);

  useEffect(() => {
    let cancelado = false;
    ContabilidadService.obtenerAlertas()
      .then((alerta) => {
        if (!cancelado) setDatos(alerta);
      })
      .catch((error) => {
        console.error('No se pudieron leer las alertas contables:', error);
        if (!cancelado) setDatos(null);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  if (!datos || (datos.fallos.length === 0 && datos.sinLineas.length === 0)) return null;

  return (
    <section
      aria-label="Alertas contables"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-4 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <h2 className="text-sm font-semibold">Pendientes contables</h2>
      </div>

      {datos.fallos.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-amber-900 dark:text-amber-100">
            {datos.fallos.length} fallo{datos.fallos.length === 1 ? '' : 's'} de asiento sin resolver
          </p>
          <ul className="space-y-2">
            {datos.fallos.map((fallo) => (
              <li
                key={fallo.id}
                className="rounded-lg bg-white/80 px-3 py-2 text-sm text-gray-800 dark:bg-gray-900/60 dark:text-gray-200"
              >
                <p className="font-medium">{motivoLegible(fallo)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(fallo.fecha)}
                  {fallo.origen ? ` · ${fallo.origen}` : ''}
                  {fallo.origenId ? ` ${fallo.origenId}` : ''}
                  {fallo.debito || fallo.credito
                    ? ` · D ${fallo.debito ?? '—'} / C ${fallo.credito ?? '—'}`
                    : ''}
                  {fallo.importe != null ? ` · ${fallo.importe}` : ''}
                </p>
                {fallo.detalle && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{fallo.detalle}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {datos.sinLineas.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-amber-900 dark:text-amber-100">
            {datos.sinLineas.length} asiento{datos.sinLineas.length === 1 ? '' : 's'} sin líneas
          </p>
          <ul className="space-y-2">
            {datos.sinLineas.map((asiento) => (
              <li key={asiento.id}>
                <Link
                  href={`/app/finanzas/contabilidad/asientos/${asiento.id}`}
                  className="block rounded-lg bg-white/80 px-3 py-2 text-sm text-gray-800 hover:bg-white dark:bg-gray-900/60 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  <span className="font-medium">Asiento {asiento.id}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {' '}
                    · {formatDate(asiento.fecha)}
                    {asiento.origen ? ` · ${asiento.origen}` : ''}
                    {asiento.publicado ? ' · publicado' : ' · borrador'}
                  </span>
                  {asiento.memo && <span className="block text-xs mt-1">{asiento.memo}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
