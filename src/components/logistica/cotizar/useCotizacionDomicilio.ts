'use client';

/**
 * Cotiza el domicilio mientras se escribe la dirección (POS, pedido manual y simulador).
 *
 * Llama a `POST /api/logistica/cotizar` (el servidor resuelve la organización, el DANE y el
 * permiso de cambiar el cargo) con espera de 500 ms y descarta respuestas viejas. Nunca calcula
 * nada: muestra lo que devolvió `logistica_cotizar_envio`.
 */
import { useEffect, useRef, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { itemsParaCotizar, leerCotizacion, type CanalCotizacion, type CotizacionEnvio } from '@/lib/logistica/cotizacion';

export interface DireccionCotizar {
  ciudad?: string | null;
  municipioId?: string | null;
  municipioDane?: string | null;
  barrio?: string | null;
  codigoPostal?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface SolicitudCotizarCliente {
  branchId: number | null;
  canal: CanalCotizacion;
  subtotal: number;
  direccion: DireccionCotizar;
  metodoPago?: string | null;
  pesoKg?: number | null;
  /** Productos del pedido: la base suma su peso para las reglas de despacho por peso. */
  items?: ReadonlyArray<{ product_id: number; cantidad: number }>;
}

export interface RespuestaCotizar {
  cotizacion: CotizacionEnvio;
  municipioDane: string | null;
  puedeEditarCargo: boolean;
}

export async function pedirCotizacion(s: SolicitudCotizarCliente, signal?: AbortSignal): Promise<RespuestaCotizar> {
  const org = getOrganizationId();
  const r = await fetch('/api/logistica/cotizar', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
    body: JSON.stringify({
      branchId: s.branchId,
      canal: s.canal,
      subtotal: s.subtotal,
      direccion: {
        ciudad: s.direccion.ciudad ?? null,
        municipio_id: s.direccion.municipioId ?? null,
        municipio_dane: s.direccion.municipioDane ?? null,
        barrio: s.direccion.barrio ?? null,
        codigo_postal: s.direccion.codigoPostal ?? null,
        lat: s.direccion.lat ?? null,
        lng: s.direccion.lng ?? null,
      },
      opciones: { metodo_pago: s.metodoPago ?? null, peso_kg: s.pesoKg ?? null, items: itemsParaCotizar(s.items) },
    }),
  });
  const d = (await r.json().catch(() => null)) as { cotizacion?: unknown; municipioDane?: string | null; puedeEditarCargo?: boolean; code?: string } | null;
  if (!r.ok || !d?.cotizacion) throw new Error(d?.code || `cotizar ${r.status}`);
  return { cotizacion: leerCotizacion(d.cotizacion), municipioDane: d.municipioDane ?? null, puedeEditarCargo: d.puedeEditarCargo === true };
}

/** Registra que se cambió el cargo que llenó la zona (después de guardar la venta o el pedido). */
export async function registrarCambioCargo(e: {
  tipo: 'sale' | 'web_order';
  id: string;
  cotizado: number;
  cobrado: number;
  zonaId?: string | null;
  zonaNombre?: string | null;
}): Promise<boolean> {
  const org = getOrganizationId();
  try {
    const r = await fetch('/api/logistica/cargo-domicilio', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
      body: JSON.stringify(e),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export type EstadoPeticion = 'inactivo' | 'cargando' | 'listo' | 'error';

/** ¿Hay algo con qué ubicar la dirección? Sin dirección no se cotiza (la zona saldría «fuera»). */
export function hayDireccionParaCotizar(d: DireccionCotizar): boolean {
  return [d.ciudad, d.municipioId, d.municipioDane, d.barrio, d.codigoPostal].some((v) => typeof v === 'string' && v.trim().length >= 2)
    || (typeof d.lat === 'number' && typeof d.lng === 'number');
}

export function useCotizacionDomicilio(s: SolicitudCotizarCliente & {
  activo: boolean;
  /**
   * Cotiza aunque no haya dirección: la respuesta dice si la organización tiene zonas
   * (`sin_zonas_configuradas`) y la pantalla decide qué campos mostrar. El aviso no se pinta
   * hasta que hay dirección (`hayDireccion`).
   */
  sondearSinDireccion?: boolean;
}) {
  const [estado, setEstado] = useState<EstadoPeticion>('inactivo');
  const [respuesta, setRespuesta] = useState<RespuestaCotizar | null>(null);
  const vuelta = useRef(0);
  const hayDireccion = hayDireccionParaCotizar(s.direccion);
  const clave = JSON.stringify([s.activo, s.sondearSinDireccion === true, s.branchId, s.canal, Math.round(s.subtotal), s.direccion, s.metodoPago ?? null, s.pesoKg ?? null, itemsParaCotizar(s.items)]);

  useEffect(() => {
    if (!s.activo || (!s.sondearSinDireccion && !hayDireccionParaCotizar(s.direccion))) {
      setEstado('inactivo');
      setRespuesta(null);
      return;
    }
    const mia = ++vuelta.current;
    const ctrl = new AbortController();
    setEstado('cargando');
    const t = setTimeout(() => {
      pedirCotizacion(s, ctrl.signal)
        .then((r) => {
          if (mia !== vuelta.current) return;
          setRespuesta(r);
          setEstado('listo');
        })
        .catch((err) => {
          if (mia !== vuelta.current || (err as { name?: string })?.name === 'AbortError') return;
          setRespuesta(null);
          setEstado('error');
        });
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // `clave` resume la solicitud: evita volver a cotizar por un objeto nuevo con los mismos datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return { estado, respuesta, hayDireccion, cotizacion: respuesta?.cotizacion ?? null, puedeEditarCargo: respuesta?.puedeEditarCargo === true };
}
