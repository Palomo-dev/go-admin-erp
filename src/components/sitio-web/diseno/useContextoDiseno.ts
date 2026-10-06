'use client';

/**
 * Lo que Diseño y Plantillas leen del sitio, sin una consulta propia:
 * - `GET /api/sitio-web/resumen` (`useResumenSitio`): permisos resueltos en el
 *   servidor (`website.sites.edit` / `website.sites.publish`), giro, dirección
 *   real, página de inicio y cambios sin publicar (con su conteo y áreas).
 * - El borrador V2 (`useSitioV2`, el hook único del módulo): documento, guardar
 *   con compare-and-swap, publicar y conflicto.
 *
 * Con permiso de edición y sin sitio V2 aún (primera vez), el sitio se crea al
 * entrar (`crearSiFalta`: idempotente, importa el sitio actual y no cambia lo
 * que se ve en línea). Sin permiso, el borrador se lee pero nunca se crea.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useResumenSitio } from '../resumen/useResumenSitio';
import { useSitioV2, type SitioV2 } from '../useSitioV2';
import { resolverEstadoPublicacion, type EstadoPublicacion } from '../ui/estadoPublicacion';
import type { EstadoVistaSitio } from '../MarcoSitioWeb';
import type { ResumenSitioRespuesta } from '@/lib/website/resumenSitio';
import { giroCatalogoDeTipo, type GiroCatalogo } from '@/lib/website/contrato/catalogoPlantillas';

/** Espera tras el último guardado antes de volver a contar los cambios sin publicar. */
const ESPERA_RECUENTO_MS = 2500;

export interface ContextoDiseno {
  estado: EstadoVistaSitio;
  resumen: ResumenSitioRespuesta | null;
  sitio: SitioV2;
  permisos: { editar: boolean; publicar: boolean };
  giro: GiroCatalogo | null;
  host: string | null;
  url: string | null;
  paginaInicioId: string | null;
  estadoPublicacion: EstadoPublicacion;
  reintentar: () => void;
  /** Vuelve a contar los cambios sin publicar (silencioso). */
  recontar: () => void;
}

export function useContextoDiseno({ leerBorradorSinPermiso = false }: { leerBorradorSinPermiso?: boolean } = {}): ContextoDiseno {
  const r = useResumenSitio();
  const datos = r.datos;
  const permisos = datos?.permisos ?? { editar: false, publicar: false };
  const sitio = useSitioV2({
    crearSiFalta: permisos.editar,
    deshabilitado: !datos || (!permisos.editar && !leerBorradorSinPermiso),
  });

  // Cada guardado cambia `borradorActualizadoEn`: se recuenta en silencio un rato después.
  const recargarResumen = r.recargar;
  const marca = sitio.sitio?.borradorActualizadoEn ?? null;
  const ultimaMarca = useRef<string | null>(null);
  useEffect(() => {
    if (!marca || ultimaMarca.current === null) {
      ultimaMarca.current = marca;
      return;
    }
    if (marca === ultimaMarca.current) return;
    ultimaMarca.current = marca;
    const t = setTimeout(() => void recargarResumen(), ESPERA_RECUENTO_MS);
    return () => clearTimeout(t);
  }, [marca, recargarResumen]);

  let estado: EstadoVistaSitio = 'listo';
  if (r.cargando && !datos) estado = 'cargando';
  else if (r.fallo === 'sin_permiso') estado = 'sin_permiso';
  else if (r.fallo || !datos) estado = 'error';
  else if (!permisos.editar && !leerBorradorSinPermiso) estado = 'sin_permiso';
  else if (sitio.cargando && !sitio.borrador) estado = 'cargando';
  // Entre que llega el resumen y arranca la lectura del borrador hay un render sin datos: es carga, no error.
  else if (permisos.editar && !sitio.borrador) estado = sitio.error ? 'error' : 'cargando';

  const s = datos?.sitio;
  const cambios = s?.cambiosSinPublicar.cantidad ?? 0;
  const estadoPublicacion = useMemo(
    () =>
      resolverEstadoPublicacion({
        guardando: sitio.guardando || sitio.publicando,
        falloPublicacion: sitio.estadoPublicacion.tipo === 'error',
        publicadoEn: sitio.sitio?.revisionPublicadaId || s?.publicado ? s?.ultimaPublicacion?.en ?? 'publicado' : null,
        // Recién guardado y aún sin recontar: al menos un cambio (dato del borrador, no inventado).
        cambiosSinPublicar: sitio.sitio?.cambiosSinPublicar ? Math.max(cambios, 1) : cambios,
      }),
    [sitio.guardando, sitio.publicando, sitio.estadoPublicacion.tipo, sitio.sitio, s, cambios],
  );

  const recargarSitio = sitio.recargar;
  const reintentar = () => {
    void recargarResumen();
    if (datos) void recargarSitio();
  };

  return {
    estado,
    resumen: datos,
    sitio,
    permisos,
    giro: giroCatalogoDeTipo(datos?.typeId),
    host: s?.host ?? null,
    url: s?.url ?? null,
    paginaInicioId: s?.paginaInicioId ?? null,
    estadoPublicacion,
    reintentar,
    recontar: () => void recargarResumen(),
  };
}
