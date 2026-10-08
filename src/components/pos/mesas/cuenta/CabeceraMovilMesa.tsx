'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoreHorizontal } from 'lucide-react';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { HojaCajaDispositivo } from '@/components/pos/venta/HojaCajaDispositivo';

/** A dónde vuelve «←» de la mesa cuando no hay historial: el plano de mesas. */
export const VOLVER_MESA = '/app/pos/mesas';

/**
 * Cabecera de la mesa en celular (Figma «POS — Mesas: flujo completo de
 * atención», M2 `1080:162972` y M5): la ÚNICA barra es el `MobileHeader
 * Mode=pos` del shell — «←» al plano · sucursal activa · estado de la caja ·
 * «⋯ Caja y dispositivo». La cabecera propia de la mesa (`CabeceraMesa`) es de
 * tableta (T2–T7): en celular no se dibuja, así no hay dos flechas que vuelven
 * al mismo sitio. La mesa, su menú ⋯ y sus acciones van en la hoja de la
 * cuenta («Ver cuenta», M3), como en Figma.
 *
 * Solo publica en el shell por `useCabeceraMovil` (el mecanismo del shell, no
 * otro) y monta la hoja «Caja y dispositivo» que abre «⋯». En escritorio el
 * MobileHeader está oculto (`lg:hidden`) y esto no pinta nada.
 */
export interface CabeceraMovilMesaProps {
  cajaAbierta: boolean;
  /** «Caja abierta · 8:02» o «Caja cerrada»: el mismo texto del POS. */
  estadoCaja: string;
  cierreBloqueado: boolean;
  onCaja: () => void;
  carritosActivos: number;
  carritosEnEspera: number;
}

export function CabeceraMovilMesa({
  cajaAbierta,
  estadoCaja,
  cierreBloqueado,
  onCaja,
  carritosActivos,
  carritosEnEspera,
}: CabeceraMovilMesaProps) {
  const t = useTranslations('posVenta.cabecera');
  const [hoja, setHoja] = useState(false);

  useCabeceraMovil({
    modo: 'pos',
    volverA: VOLVER_MESA,
    estadoPos: { texto: estadoCaja, tono: cajaAbierta ? 'exito' : 'advertencia' },
    accion: (
      <button
        type="button"
        onClick={() => setHoja(true)}
        aria-label={t('abrirHoja')}
        title={t('abrirHoja')}
        className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </button>
    ),
  });

  // Sin «Ver atajos»: el mapa es el del mostrador y la mesa tiene los suyos (F8, F4, P).
  return (
    <HojaCajaDispositivo
      abierta={hoja}
      onAbiertaChange={setHoja}
      cajaAbierta={cajaAbierta}
      estadoCaja={estadoCaja}
      cierreBloqueado={cierreBloqueado}
      onCaja={onCaja}
      carritosActivos={carritosActivos}
      carritosEnEspera={carritosEnEspera}
    />
  );
}
