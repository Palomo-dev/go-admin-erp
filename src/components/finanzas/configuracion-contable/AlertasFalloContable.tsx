'use client';

import React, { useEffect, useState } from 'react';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { reportarFallosContables } from '@/lib/finanzas/reportarFalloContable';
import { etiquetaMotivoFallo, etiquetaOrigen } from '@/lib/finanzas/configuracionContable';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { supabase } from '@/lib/supabase/config';
import { ConfiguracionContableService, type FalloContable } from './ConfiguracionContableService';

/**
 * Los fallos técnicos solo los ve soporte o superadmin de la plataforma.
 * Un cliente de la organización no recibe esta caja.
 */
export function AlertasFalloContable({ compacto = false }: { compacto?: boolean }) {
  const { formatDateTime } = useFormatDate();
  const [veTecnicos, setVeTecnicos] = useState(false);
  const [total, setTotal] = useState(0);
  const [filas, setFilas] = useState<FalloContable[]>([]);

  useEffect(() => {
    let vivo = true;
    supabase
      .rpc('fn_ve_fallos_contables')
      .then(({ data }) => {
        if (!vivo || data !== true) return;
        setVeTecnicos(true);
        return ConfiguracionContableService.fallosPendientes(compacto ? 3 : 30);
      })
      .then((resultado) => {
        if (!vivo || !resultado) return;
        setTotal(resultado.total);
        setFilas(resultado.filas);
        reportarFallosContables(
          resultado.filas.map((fila) => ({ id: fila.id, motivo: fila.reason })),
        );
      })
      .catch((error) => {
        console.error('No se pudieron cargar los fallos contables:', error);
      });
    return () => {
      vivo = false;
    };
  }, [compacto]);

  if (!veTecnicos || total === 0) return null;

  return (
    <AvisoTonal
      tono="peligro"
      rol="alert"
      titulo={total === 1 ? 'Hay 1 fallo contable' : `Hay ${total} fallos contables`}
      descripcion={
        <ul className="mt-1 space-y-1">
          {filas.map((fila) => (
            <li key={fila.id}>
              {etiquetaOrigen(fila.source)}
              {fila.source_id ? ` ${fila.source_id}` : ''}
              {' · '}
              {etiquetaMotivoFallo(fila.reason)}
              {fila.detail ? ` — ${fila.detail}` : ''}
              {' · '}
              {formatDateTime(fila.created_at)}
            </li>
          ))}
        </ul>
      }
      accion={
        compacto
          ? { etiqueta: 'Ver la configuración', href: '/app/finanzas/configuracion-contable' }
          : undefined
      }
    />
  );
}
