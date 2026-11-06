'use client';

import React, { useEffect, useState } from 'react';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { reportarFallosContables } from '@/lib/finanzas/reportarFalloContable';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
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
  cuenta_linea: 'La cuenta de la línea no sirve para el asiento',
  tercero_requerido: 'Falta el tercero de la cuenta',
  period_closed: 'El periodo contable está cerrado',
};

function motivoLegible(fallo: FalloContable): string {
  const codigo = fallo.motivo ?? '';
  return MOTIVOS[codigo] ?? (codigo || 'Fallo contable');
}

/**
 * Al cliente solo le llegan los borradores que tiene que aprobar.
 * Los fallos técnicos los devuelve la base únicamente a soporte y
 * superadmin; aquí se reportan una vez a Sentry.
 */
export function AlertasContables() {
  const { formatDate } = useFormatDate();
  const { formatear } = useMonedaOrganizacion();
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

  useEffect(() => {
    if (!datos?.veTecnicos) return;
    reportarFallosContables(datos.fallos.map((fallo) => ({ id: fallo.id, motivo: fallo.motivo ?? null })));
  }, [datos]);

  if (!datos) return null;

  const borradores = datos.borradores;
  const tecnicos = datos.veTecnicos ? datos.fallos : [];
  const sinLineas = datos.veTecnicos ? datos.sinLineas : [];
  if (borradores.length === 0 && tecnicos.length === 0 && sinLineas.length === 0) return null;

  return (
    <div className="space-y-3">
      {borradores.map((borrador) => (
        <AvisoTonal
          key={borrador.id}
          tono="advertencia"
          rol="alert"
          titulo="Tienes un asiento por aprobar"
          descripcion={
            <>
              El asiento del {formatDate(borrador.fecha)} por {formatear(borrador.importe)} está listo.
              {borrador.memo ? ` ${borrador.memo}.` : ''} Revísalo y apruébalo para dejarlo en los libros.
            </>
          }
          accion={{
            etiqueta: 'Revisar y aprobar',
            href: `/app/finanzas/contabilidad/asientos/${borrador.id}`,
          }}
        />
      ))}

      {tecnicos.length > 0 && (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={tecnicos.length === 1 ? 'Hay 1 fallo contable' : `Hay ${tecnicos.length} fallos contables`}
          descripcion={
            <ul className="mt-1 space-y-1">
              {tecnicos.map((fallo) => (
                <li key={fallo.id}>
                  {motivoLegible(fallo)}
                  {fallo.detalle ? ` — ${fallo.detalle}` : ''}
                  {fallo.fecha ? ` · ${formatDate(fallo.fecha)}` : ''}
                </li>
              ))}
            </ul>
          }
        />
      )}

      {sinLineas.length > 0 && (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={sinLineas.length === 1 ? 'Hay 1 asiento sin líneas' : `Hay ${sinLineas.length} asientos sin líneas`}
          descripcion={
            <ul className="mt-1 space-y-1">
              {sinLineas.map((asiento) => (
                <li key={asiento.id}>
                  Asiento {asiento.id}
                  {asiento.fecha ? ` · ${formatDate(asiento.fecha)}` : ''}
                  {asiento.memo ? ` · ${asiento.memo}` : ''}
                </li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
}
