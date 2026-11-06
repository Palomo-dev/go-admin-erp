'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  firmaConsultas,
  type ConsultaCuenta,
  type CuentaEfectiva,
  type DocumentoCuenta,
  type SugerenciaCuenta,
} from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { CuentasAutomaticasService } from './CuentasAutomaticasService';

const ESPERA_MS = 250;

export interface CuentasEfectivas {
  porClave: ReadonlyMap<string, CuentaEfectiva>;
  lista: readonly CuentaEfectiva[];
  cargando: boolean;
  fallo: boolean;
  recargar: () => void;
}

/**
 * La cuenta que usará el asiento, preguntada a la base. Con `activo` en false no
 * hay ninguna llamada: el documento sigue exactamente igual que sin esta función.
 */
export function useCuentasEfectivas(
  branchId: number | null | undefined,
  documento: DocumentoCuenta,
  consultas: readonly ConsultaCuenta[],
  activo = true,
): CuentasEfectivas {
  const firma = firmaConsultas(consultas);
  const ultimas = useRef(consultas);
  ultimas.current = consultas;
  const [lista, setLista] = useState<readonly CuentaEfectiva[]>([]);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!activo || ultimas.current.length === 0) {
      setLista([]);
      setCargando(false);
      return;
    }
    let vivo = true;
    setCargando(true);
    const espera = setTimeout(() => {
      CuentasAutomaticasService.efectivas(branchId, documento, ultimas.current)
        .then((filas) => {
          if (!vivo) return;
          setLista(filas);
          setFallo(false);
        })
        .catch(() => {
          if (vivo) setFallo(true);
        })
        .finally(() => {
          if (vivo) setCargando(false);
        });
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [activo, branchId, documento, firma, vuelta]);

  const porClave = useMemo(() => new Map(lista.flatMap((c) => (c.clave ? [[c.clave, c] as const] : []))), [lista]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { porClave, lista, cargando, fallo, recargar };
}

/** La cuenta usada antes con este proveedor. Solo lee: la acepta la persona. */
export function useSugerenciaProveedor(proveedorId: number | null | undefined, activo: boolean): SugerenciaCuenta | null {
  const [sugerencia, setSugerencia] = useState<SugerenciaCuenta | null>(null);
  useEffect(() => {
    setSugerencia(null);
    if (!activo || !proveedorId) return;
    let vivo = true;
    CuentasAutomaticasService.sugerida(proveedorId)
      .then((s) => vivo && setSugerencia(s))
      .catch(() => vivo && setSugerencia(null));
    return () => {
      vivo = false;
    };
  }, [activo, proveedorId]);
  return sugerencia;
}
