'use client';

/**
 * «Pago contra entrega» de Ventas en línea: lee y guarda las condiciones por sede con
 * `/api/sitio-web/ventas/contraentrega` (servidor, organización de la sesión). El navegador no
 * escribe en la base.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CondicionesContraentrega } from '@/lib/contraentrega/reglaContraentrega';
import type { RespuestaContraentrega } from '@/lib/website/contraentregaSitio.server';
import { pedirJson } from '../useVentasSitio';

export const RUTA_API_CONTRAENTREGA = '/api/sitio-web/ventas/contraentrega';

export interface ContraentregaSitio {
  datos: RespuestaContraentrega | null;
  cargando: boolean;
  fallo: boolean;
  recargar: () => Promise<void>;
  guardar: (branchId: number, condiciones: CondicionesContraentrega | null) => Promise<void>;
  buscarProductos: (texto: string) => Promise<RespuestaContraentrega['productos']>;
}

export function useContraentregaSitio(activo = true): ContraentregaSitio {
  const [datos, setDatos] = useState<RespuestaContraentrega | null>(null);
  const [cargando, setCargando] = useState(activo);
  const [fallo, setFallo] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(false);
    try {
      setDatos(await pedirJson<RespuestaContraentrega>(RUTA_API_CONTRAENTREGA));
    } catch {
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  const guardar = useCallback(async (branchId: number, condiciones: CondicionesContraentrega | null) => {
    setDatos(await pedirJson<RespuestaContraentrega>(RUTA_API_CONTRAENTREGA, { method: 'PUT', cuerpo: { branchId, condiciones } }));
  }, []);

  const buscarProductos = useCallback(async (texto: string) => {
    const r = await pedirJson<{ productos: RespuestaContraentrega['productos'] }>(`${RUTA_API_CONTRAENTREGA}?buscar=${encodeURIComponent(texto)}`);
    return r.productos;
  }, []);

  return { datos, cargando, fallo, recargar, guardar, buscarProductos };
}
