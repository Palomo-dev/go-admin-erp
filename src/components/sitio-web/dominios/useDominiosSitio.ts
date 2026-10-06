'use client';

/**
 * Hook ÚNICO de los dominios del sitio (Figma B/07). Lo comparten la lista,
 * el detalle, los diálogos de conectar y comprar, y —cuando lo integren— el
 * Resumen (alertas), el asistente (paso 5) y Sedes en la web. Una sola
 * lectura (`GET /api/sitio-web/dominios`) y una sola forma de escribir.
 *
 * Tras cambiar el principal o el subdominio refresca también `useUrlSitio`
 * (cabecera del módulo, menú móvil): la dirección pública no se queda vieja.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useUrlSitio } from '../useUrlSitio';
import { apiDominios, ErrorApiDominios } from './apiDominios';
import type { DominioSitio, RespuestaConectar, RespuestaDominios, RespuestaVerificacion } from './tiposDominios';

export type FalloDominios = 'error' | 'sin_permiso';

export interface DominiosSitio {
  datos: RespuestaDominios | null;
  cargando: boolean;
  /** Recarga con la tabla visible (el icono del botón gira, B/07-01). */
  refrescando: boolean;
  fallo: FalloDominios | null;
  recargar: () => Promise<void>;
  conectar: (host: string, sedeId?: number | null) => Promise<RespuestaConectar>;
  verificar: (id: string) => Promise<RespuestaVerificacion>;
  hacerPrincipal: (id: string) => Promise<DominioSitio>;
  quitar: (id: string) => Promise<void>;
  cambiarSubdominio: (subdominio: string) => Promise<{ subdominio: string; host: string }>;
  autoRenovar: (id: string, encender: boolean) => Promise<DominioSitio>;
  solicitarCodigo: (id: string) => Promise<{ correo: string }>;
}

export function falloDe(error: unknown): FalloDominios {
  return error instanceof ErrorApiDominios && error.esSinPermiso ? 'sin_permiso' : 'error';
}

/**
 * @param opciones.sedeId sede preseleccionada (`?sede=` de la URL). Se manda en
 * la misma lectura y el servidor la resuelve con la organización de la sesión
 * (`datos.sede`): el navegador no consulta `branches` por su cuenta.
 */
export function useDominiosSitio(opciones: { sedeId?: number | null } = {}): DominiosSitio {
  const sedeId = opciones.sedeId ?? null;
  const { organization } = useOrganization();
  const url = useUrlSitio(organization?.id);
  const recargarUrl = url.recargar;
  const [datos, setDatos] = useState<RespuestaDominios | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [fallo, setFallo] = useState<FalloDominios | null>(null);
  const hayDatos = useRef(false);

  const recargar = useCallback(async () => {
    if (hayDatos.current) setRefrescando(true);
    else setCargando(true);
    try {
      const r = await apiDominios.listar(sedeId);
      hayDatos.current = true;
      setDatos(r);
      setFallo(null);
    } catch (error) {
      setFallo(falloDe(error));
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [sedeId]);

  useEffect(() => {
    void recargar();
  }, [recargar, organization?.id]);

  const conectar = useCallback(
    async (host: string, idSede?: number | null) => {
      const r = await apiDominios.conectar(host, idSede);
      void recargar();
      return r;
    },
    [recargar],
  );

  const verificar = useCallback(
    async (id: string) => {
      const r = await apiDominios.verificar(id);
      void recargar();
      if (r.resultado === 'activo') void recargarUrl();
      return r;
    },
    [recargar, recargarUrl],
  );

  const hacerPrincipal = useCallback(
    async (id: string) => {
      const r = await apiDominios.hacerPrincipal(id);
      await Promise.all([recargar(), recargarUrl()]);
      return r.dominio;
    },
    [recargar, recargarUrl],
  );

  const quitar = useCallback(
    async (id: string) => {
      await apiDominios.quitar(id);
      await Promise.all([recargar(), recargarUrl()]);
    },
    [recargar, recargarUrl],
  );

  const cambiarSubdominio = useCallback(
    async (subdominio: string) => {
      const r = await apiDominios.cambiarSubdominio(subdominio);
      await Promise.all([recargar(), recargarUrl()]);
      return r;
    },
    [recargar, recargarUrl],
  );

  const autoRenovar = useCallback(
    async (id: string, encender: boolean) => {
      const r = await apiDominios.autoRenovar(id, encender);
      void recargar();
      return r.dominio;
    },
    [recargar],
  );

  const solicitarCodigo = useCallback((id: string) => apiDominios.codigoTransferencia(id), []);

  return { datos, cargando, refrescando, fallo, recargar, conectar, verificar, hacerPrincipal, quitar, cambiarSubdominio, autoRenovar, solicitarCodigo };
}
