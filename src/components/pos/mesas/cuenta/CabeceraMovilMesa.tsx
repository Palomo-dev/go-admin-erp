'use client';

import { useCabeceraMovil, type EstadoPagina } from '@/components/shell/header/cabeceraMovil';

/** A dónde vuelve «←» de la mesa cuando no hay historial: el plano de mesas. */
export const VOLVER_MESA = '/app/pos/mesas';

/**
 * Barra de la mesa en celular (Figma M2b, «POS — Mesas: flujo completo de
 * atención», 390 `2256:232152` y 430 `2262:186022`): la ÚNICA barra es el
 * `MobileHeader Mode=page` del shell — «←» al plano · «Mesa 2 · A» · chip de
 * estado. Lo demás de la cabecera de la mesa (tiempo, mesero y comensales,
 * «Pre-cuenta», «⋯») sigue justo debajo en `CabeceraMesa`, que en celular
 * oculta su propia «←», su título y su chip: así no hay dos flechas que
 * vuelven al mismo sitio y no se esconde nada.
 *
 * Solo publica en el shell por `useCabeceraMovil` (el mecanismo del shell).
 * En escritorio el MobileHeader está oculto (`lg:hidden`) y no pinta nada.
 */
export interface CabeceraMovilMesaProps {
  /** «Mesa 2 · A», el mismo título de `CabeceraMesa`. */
  titulo: string;
  estado: EstadoPagina;
}

export function CabeceraMovilMesa({ titulo, estado }: CabeceraMovilMesaProps) {
  // Subtítulo vacío: sin él, el shell pondría el nombre de la organización.
  useCabeceraMovil({ modo: 'page', titulo, subtitulo: '', estado, volverA: VOLVER_MESA });
  return null;
}
