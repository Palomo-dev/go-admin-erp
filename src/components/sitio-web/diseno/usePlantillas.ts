'use client';

/**
 * Plantillas del sitio (Figma A/06b-06e): catálogo por giro, la que está «En
 * uso» en el borrador y «Usar esta plantilla» en sus dos modos:
 * - «Solo estilo» (`usar`): colores y fuentes, conservando el contenido
 *   (`aplicarEstiloPlantilla`), guardado con el hook único del borrador
 *   (`useSitioV2().guardar`, compare-and-swap; la base exige `website.sites.edit`).
 * - «Plantilla completa» (`usarCompleta`): el servidor arma el sitio entero con
 *   los datos reales (`/api/sitio-web/paginas/plantilla`), deja el borrador
 *   anterior en el historial y devuelve su instantánea para «Deshacer».
 * Sin sitio V2 aún, `useContextoDiseno` lo crea al entrar si hay permiso.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  contarPorGiro,
  plantillaEnUso,
  plantillasDelGiro,
  type GiroCatalogo,
  type PlantillaCatalogo,
} from '@/lib/website/contrato/catalogoPlantillas';
import { tokensExtendidosDisponibles } from '@/lib/website/v2/tokensEstilo';
import { aplicarEstiloPlantilla } from '@/lib/website/v2/usarPlantilla';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { clienteSitiosV2 } from '@/lib/website/v2/clienteSitiosV2';
import type { ResumenPlantillaCompleta } from '@/lib/website/v2/plantillaCompleta';
import { apiPaginas, ErrorApiPaginas } from '../paginas/apiPaginas';
import { CATALOGO_SITIO } from './catalogo';
import type { ContextoDiseno } from './useContextoDiseno';

/**
 * Pestañas de A/06b; transporte y parqueadero aparecen solo si es el giro de la organización o de
 * la sede elegida (Figma «Plantillas por sede»).
 */
export const PESTANAS_GIRO_BASE: readonly GiroCatalogo[] = ['restaurante', 'tienda', 'hotel', 'servicios', 'gimnasio'];
export type PestanaGiro = GiroCatalogo | 'todas';

export function pestanasGiro(giroOrganizacion: GiroCatalogo | null, giroSede: GiroCatalogo | null = null): PestanaGiro[] {
  const giros: PestanaGiro[] = [...PESTANAS_GIRO_BASE];
  for (const g of [giroOrganizacion, giroSede]) if (g && !giros.includes(g)) giros.push(g);
  return [...giros, 'todas'];
}

/** Si falla, el motivo lo dice `useSitioV2` (`error` o `conflicto`, que abre su diálogo). */
export type ResultadoUso = { ok: boolean };

/** «Plantilla completa»: el resumen y la instantánea para deshacer; o el motivo del fallo. */
export type ResultadoUsoCompleto =
  | { ok: true; resumen: ResumenPlantillaCompleta; instantaneaId: string; sitioId: string; version: number }
  | { ok: false; conflicto: boolean; mensaje: string };

export interface Plantillas {
  contadores: Record<PestanaGiro, number>;
  delGiro: (giro: PestanaGiro) => PlantillaCatalogo[];
  enUso: PlantillaCatalogo | null;
  usando: string | null;
  usar: (plantilla: PlantillaCatalogo) => Promise<ResultadoUso>;
  usarCompleta: (plantilla: PlantillaCatalogo) => Promise<ResultadoUsoCompleto>;
  /** Vuelve al borrador anterior (la instantánea que dejó «Plantilla completa»). */
  deshacer: (r: { sitioId: string; instantaneaId: string; version: number }) => Promise<boolean>;
}

export function usePlantillas(ctx: ContextoDiseno): Plantillas {
  const { sitio } = ctx;
  const documento = sitio.documento;
  const [usando, setUsando] = useState<string | null>(null);
  const extendidos = tokensExtendidosDisponibles();

  const enUso = useMemo(
    () =>
      plantillaEnUso(CATALOGO_SITIO, {
        preset: valorCampo(documento?.tema.preset),
        plantillaBase: valorCampo(documento?.tema.plantillaBase),
        fuenteTitulos: valorCampo(documento?.tema.tipografia.titulos),
      }),
    [documento],
  );

  const guardar = sitio.guardar;
  const asegurar = sitio.asegurar;
  const usar = useCallback(
    async (plantilla: PlantillaCatalogo): Promise<ResultadoUso> => {
      setUsando(plantilla.id);
      try {
        if (!(await asegurar())) return { ok: false };
        // El cambio se calcula sobre el último borrador leído (lo decide `guardar`).
        return { ok: await guardar((d) => aplicarEstiloPlantilla(d, plantilla, extendidos)) };
      } finally {
        setUsando(null);
      }
    },
    [asegurar, guardar, extendidos],
  );

  const recargar = sitio.recargar;
  const branchId = sitio.sitio?.branchId ?? null;
  const versionBorrador = sitio.borrador?.version ?? null;
  const usarCompleta = useCallback(
    async (plantilla: PlantillaCatalogo): Promise<ResultadoUsoCompleto> => {
      setUsando(plantilla.id);
      try {
        const actual = await asegurar();
        if (!actual) return { ok: false, conflicto: false, mensaje: '' };
        const r = await apiPaginas.plantillaCompleta({ branchId, version: versionBorrador ?? actual.versionBorrador }, plantilla.id);
        await recargar();
        return { ok: true, resumen: r.resumen, instantaneaId: r.instantaneaId, sitioId: r.sitioId, version: r.version };
      } catch (error) {
        const conflicto = error instanceof ErrorApiPaginas && error.esConflicto;
        if (conflicto) await recargar();
        return { ok: false, conflicto, mensaje: error instanceof Error ? error.message : '' };
      } finally {
        setUsando(null);
      }
    },
    [asegurar, recargar, branchId, versionBorrador],
  );

  const deshacer = useCallback(
    async (r: { sitioId: string; instantaneaId: string; version: number }) => {
      try {
        await clienteSitiosV2.restaurarInstantanea(r.sitioId, r.instantaneaId, r.version);
        return true;
      } catch {
        return false;
      } finally {
        await recargar();
      }
    },
    [recargar],
  );

  return {
    contadores: contarPorGiro(CATALOGO_SITIO),
    delGiro: (giro) => plantillasDelGiro(CATALOGO_SITIO, giro),
    enUso,
    usando,
    usar,
    usarCompleta,
    deshacer,
  };
}
