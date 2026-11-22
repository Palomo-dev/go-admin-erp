'use client';

/**
 * Cartera del cliente para la ficha (Figma 06 Clientes, 331:112627 y
 * 331:115207): saldo abierto, cuentas vencidas y las cuentas en sí.
 *
 * No se calcula nada aquí: se pide a `GET /api/cartera` (`fn_cxc_listado`), el
 * mismo listado de Cuentas por cobrar. Ahí la organización sale de la sesión,
 * «abiertas» es `balance > 0` y estado distinto de `cancelled`, y «vencida»
 * se resuelve con el día de hoy en la zona de la organización. Así el KPI de
 * la ficha, el botón «Registrar pago» y Finanzas nunca dan cifras distintas.
 *
 * Los permisos también son del servidor: ver la cartera exige `finance.view`
 * (si no, `sinPermiso`) y cobrar, `crear` de `/api/finanzas/permisos`.
 */
import { useCallback, useEffect, useState } from 'react';
import { ErrorPeticionCartera, pedirListadoCartera } from '@/lib/finanzas/cartera/clienteCartera';
import type { FilaCartera, ResumenCartera } from '@/lib/finanzas/cartera/listadoCartera';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';

export type EstadoCarteraFicha = 'cargando' | 'listo' | 'sinPermiso' | 'error';

export interface CarteraFicha {
  estado: EstadoCarteraFicha;
  resumen: ResumenCartera | null;
  filas: FilaCartera[];
  /** Permiso de registrar cobros (servidor); `false` mientras carga. */
  puedeCobrar: boolean;
  permisosCargando: boolean;
  recargar: () => void;
}

/** Por qué «Registrar pago» no se puede usar, o `null` si se puede. */
export type MotivoSinCobro = 'cargando' | 'sinPermiso' | 'error' | 'sinSaldo';

export function motivoSinCobro(c: Pick<CarteraFicha, 'estado' | 'resumen' | 'puedeCobrar' | 'permisosCargando'>): MotivoSinCobro | null {
  if (c.estado === 'cargando' || c.permisosCargando) return 'cargando';
  if (c.estado === 'sinPermiso' || !c.puedeCobrar) return 'sinPermiso';
  if (c.estado === 'error') return 'error';
  if (!c.resumen || c.resumen.por_cobrar <= 0) return 'sinSaldo';
  return null;
}

export function useCarteraFicha(clienteId: string | null): CarteraFicha {
  const permisos = usePermisosFinanzas();
  const [estado, setEstado] = useState<EstadoCarteraFicha>('cargando');
  const [resumen, setResumen] = useState<ResumenCartera | null>(null);
  const [filas, setFilas] = useState<FilaCartera[]>([]);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    setEstado('cargando');
    const q = new URLSearchParams({ cliente: clienteId, estado: 'abiertas', tamano: '200', orden: 'vencimiento_asc' });
    pedirListadoCartera(q)
      .then((r) => {
        if (cancelado) return;
        setResumen(r.resumen);
        setFilas(r.filas);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setResumen(null);
        setFilas([]);
        setEstado(e instanceof ErrorPeticionCartera && (e.estado === 403 || e.codigo === 'sin_permiso') ? 'sinPermiso' : 'error');
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId, vuelta]);

  const recargar = useCallback(() => setVuelta((n) => n + 1), []);

  return { estado, resumen, filas, puedeCobrar: permisos.crear, permisosCargando: permisos.cargando, recargar };
}
