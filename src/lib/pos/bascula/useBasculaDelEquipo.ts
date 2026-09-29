'use client';

/**
 * La báscula de este equipo para el POS (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.8, §2.10): básculas activas de la sucursal (`pos_basculas_para_pos`),
 * filtradas por lo que este equipo puede leer (Desktop con el puente `scale`,
 * o Chrome/Edge con Web Serial) y la elegida en este navegador.
 *
 * Sin conexión usa la última lista guardada de esta organización y sucursal
 * (la lectura de la báscula es local: funciona sin internet). Sin ninguna, no
 * hay báscula y «Pesar» sigue con el peso a mano de siempre.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { BasculasService } from '@/lib/services/basculasService';
import { PosTerminalsService } from '@/lib/services/posTerminalsService';
import { claveBasculaEquipo, elegirBasculaDelEquipo, type FilaBascula } from './config';
import { entornoBascula } from './entorno';
import type { ConfigBascula } from './tipos';

export { entornoBascula };

const claveCache = (orgId: number, branchId: number) => `pos_basculas_${orgId}_${branchId}`;

function leerLocal<T>(clave: string): T | null {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function escribirLocal(clave: string, valor: unknown): void {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento local */
  }
}

/** Báscula elegida en este navegador («Usar en este equipo» de Configuración). */
export function basculaPreferida(orgId: number, branchId: number): string | null {
  return leerLocal<string>(claveBasculaEquipo(orgId, branchId));
}

export function fijarBasculaPreferida(orgId: number, branchId: number, id: string | null): void {
  escribirLocal(claveBasculaEquipo(orgId, branchId), id);
}

export interface BasculaDelEquipo {
  config: ConfigBascula | null;
  cargando: boolean;
  recargar: () => void;
}

export function useBasculaDelEquipo(): BasculaDelEquipo {
  const { organization } = useOrganization();
  const { selectedBranchId } = useBranch();
  const orgId = organization?.id as number | undefined;
  const branchId = selectedBranchId ?? undefined;
  const [filas, setFilas] = useState<FilaBascula[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!orgId || !branchId) {
      setFilas(null);
      return;
    }
    let cancelado = false;
    setFilas(leerLocal<FilaBascula[]>(claveCache(orgId, branchId)));
    setCargando(true);
    BasculasService.paraPos(orgId, branchId, PosTerminalsService.getLocalTerminalId())
      .then((data) => {
        if (cancelado) return;
        setFilas(data);
        escribirLocal(claveCache(orgId, branchId), data);
      })
      .catch((err) => {
        // Sin conexión o sin la migración: se queda con la caché (o sin báscula).
        if (!cancelado) console.warn('No se pudieron consultar las básculas del POS:', err);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [orgId, branchId, version]);

  const config = useMemo(() => {
    if (!orgId || !branchId || !filas?.length) return null;
    return elegirBasculaDelEquipo(filas, entornoBascula(), basculaPreferida(orgId, branchId));
  }, [filas, orgId, branchId]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { config, cargando, recargar };
}
