'use client';

/**
 * Pestañas de las pantallas de Transporte que reúnen vistas hermanas (Figma «23 Transporte»,
 * decisión 2): Viajes (Todos los viajes · Despachos de hoy · Novedades), Rutas (Rutas · Paradas)
 * y Boletos (Boletos · Tarifas). La pestaña vive en `?pestana=` para que las redirecciones 308
 * de las rutas viejas (/paradas, /tarifas-pasajeros, /incidentes) caigan en la correcta y para
 * que el enlace se pueda compartir. Cambiar de pestaña reemplaza la URL (no apila historial).
 */
import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TabBar, idPanel, idPestana, type PestanaTab } from '@/components/kit';

export function usePestana<V extends string>(validas: readonly V[], porDefecto: V): [V, (v: V) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pedida = params?.get('pestana');
  const actual = (validas as readonly string[]).includes(pedida ?? '') ? (pedida as V) : porDefecto;
  const cambiar = React.useCallback(
    (v: V) => {
      const q = new URLSearchParams(params?.toString() ?? '');
      q.set('pestana', v);
      router.replace(`${pathname ?? ''}?${q.toString()}`, { scroll: false });
    },
    [params, router, pathname],
  );
  return [actual, cambiar];
}

interface Props<V extends string> {
  id: string;
  etiqueta: string;
  pestanas: readonly PestanaTab<V>[];
  valor: V;
  onValorChange: (v: V) => void;
  /** A la derecha de las pestañas (p. ej. el atajo «Configurar» de Boletos). */
  acciones?: React.ReactNode;
  /** Sin el margen propio: la página ya lo pone (Viajes, con su PageHeader). */
  sinMargen?: boolean;
  children: React.ReactNode;
}

/** Barra de pestañas arriba y el panel de la activa debajo (con sus `aria-*`). */
export function PestanasTransporte<V extends string>({ id, etiqueta, pestanas, valor, onValorChange, acciones, sinMargen, children }: Props<V>) {
  return (
    <div className="flex flex-col">
      <div className={`flex items-end gap-2 ${sinMargen ? '' : 'px-4 pt-4 sm:px-6 sm:pt-6'}`}>
        <TabBar id={id} etiqueta={etiqueta} pestanas={pestanas} valor={valor} onValorChange={onValorChange} className="min-w-0 flex-1" />
        {acciones ? <div className="flex shrink-0 items-center gap-2 pb-1">{acciones}</div> : null}
      </div>
      <div role="tabpanel" id={idPanel(id, valor)} aria-labelledby={idPestana(id, valor)}>
        {children}
      </div>
    </div>
  );
}
