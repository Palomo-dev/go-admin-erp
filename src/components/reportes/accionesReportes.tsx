'use client';

/**
 * Acciones compartidas del centro de reportes: los diálogos de cierre y de
 * envío, y el GO Asistente con el reporte como contexto, se abren desde el
 * inicio, la lista y el visor.
 */
import { createContext, useContext } from 'react';
import type { PlantillaCierre } from '@/lib/services/reportes/cierres/snapshot';
import type { ProgramadoVista } from '@/lib/services/reportes/programados/programados.server';

export interface PedidoCierreUi {
  plantilla?: PlantillaCierre;
  reportes?: string[];
}

export interface PedidoEnvioUi {
  reportId?: string;
  editar?: ProgramadoVista;
}

/** Sin `reporteId`, el del visor abierto (o ninguno en el inicio y la lista). */
export interface PedidoAsistenteUi {
  reporteId?: string;
  /** Vista del visor; sin ella, la de los filtros vigentes. */
  vista?: string | null;
}

export interface AccionesReportes {
  abrirCierre: (pedido?: PedidoCierreUi) => void;
  abrirEnvio: (pedido?: PedidoEnvioUi) => void;
  /** «Preguntar a GO Asistente»: abre el asistente del shell con este reporte y sus filtros. */
  abrirAsistente: (pedido?: PedidoAsistenteUi) => void;
  /** Sube cuando un diálogo guarda algo: las pestañas vuelven a leer. */
  recarga: number;
  recargar: () => void;
}

const Contexto = createContext<AccionesReportes | null>(null);

export const ProveedorAccionesReportes = Contexto.Provider;

export function useAccionesReportes(): AccionesReportes {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAccionesReportes fuera del centro de reportes');
  return ctx;
}
