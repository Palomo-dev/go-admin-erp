'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Periodo y sucursal con los que el visor de Reportes abre un informe que se
 * pinta con su componente propio (estados financieros, libros, mayor…).
 *
 * Dentro del visor, el componente no dibuja su encabezado ni sus propios
 * selectores de fecha: el periodo sale de la barra de filtros del visor, que es
 * la misma de todos los reportes. Fuera del visor el contexto vale `null` y el
 * componente se comporta como antes.
 */
export interface ContextoVisorInforme {
  /** Día inicial del periodo, `AAAA-MM-DD`, en la zona de la organización. */
  desde: string;
  /** Día final (o de corte), `AAAA-MM-DD`. */
  hasta: string;
  /** Sucursal elegida en el visor; null = consolidado. Solo en reportes de sucursal. */
  sucursal: number | null;
}

const Contexto = createContext<ContextoVisorInforme | null>(null);

export function ProveedorVisorInforme({ valor, children }: { valor: ContextoVisorInforme; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** `null` fuera del visor de Reportes. */
export function useVisorInforme(): ContextoVisorInforme | null {
  return useContext(Contexto);
}
