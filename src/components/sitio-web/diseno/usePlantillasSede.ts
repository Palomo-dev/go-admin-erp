'use client';

/**
 * Plantillas de una SEDE en Diseño › Plantillas (Figma «16 Sitio web» › «Plantillas por sede»):
 * - `sedes`: las sedes con sitio para el selector (`GET /api/sitio-web/plantillas/sedes`).
 * - `sitio`: el borrador V2 de la sede elegida, con el hook único del módulo (`useSitioV2`, solo
 *   lectura: nunca crea el sitio al entrar).
 * - `usar(plantilla, alcance)`: «Usar esta plantilla en <sede>», completa o solo estilo
 *   (`POST /api/sitio-web/sedes/<id>/plantilla`; el servidor valida el catálogo, el giro, que la
 *   sede sea de la organización y el permiso `website.sites.edit`).
 * - `heredar()`: «Volver a heredar el estilo del sitio principal».
 * Sin sede elegida no hace nada: la galería sigue con el sitio principal como antes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clienteSitiosV2, ErrorApiSitio } from '@/lib/website/v2/clienteSitiosV2';
import {
  plantillaEnUsoDeSede,
  tieneEstiloPropio,
  type AlcancePlantillaSede,
  type SedeParaPlantillas,
} from '@/lib/website/v2/plantillaSede';
import { plantillaPorId, type PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { useSitioV2, type SitioV2 } from '../useSitioV2';
import { CATALOGO_SITIO } from './catalogo';
import type { ResultadoUsoCompleto } from './usePlantillas';

export type ResultadoUsoSede = ResultadoUsoCompleto | { ok: true; resumen: null; instantaneaId: null; sitioId: string; version: number };

export interface PlantillasSede {
  sedes: SedeParaPlantillas[];
  cargandoSedes: boolean;
  /** La sede elegida (`null`: sitio principal o aún sin cargar). */
  sede: SedeParaPlantillas | null;
  sitio: SitioV2;
  /** Documento de la sede elegida (nunca el de otra sede que aún se esté cambiando). */
  documento: DocumentoSitio | null;
  estiloPropio: boolean;
  enUso: PlantillaCatalogo | null;
  usando: string | null;
  heredando: boolean;
  usar: (plantilla: PlantillaCatalogo, alcance: AlcancePlantillaSede) => Promise<ResultadoUsoSede>;
  heredar: () => Promise<{ ok: boolean; mensaje: string }>;
  deshacer: (r: { sitioId: string; instantaneaId: string; version: number }) => Promise<boolean>;
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

export function usePlantillasSede(branchId: number | null, habilitado: boolean): PlantillasSede {
  const [sedes, setSedes] = useState<SedeParaPlantillas[]>([]);
  const [cargandoSedes, setCargandoSedes] = useState(habilitado);
  const [usando, setUsando] = useState<string | null>(null);
  const [heredando, setHeredando] = useState(false);

  const recargarSedes = useCallback(async () => {
    try {
      setSedes(await clienteSitiosV2.sedesParaPlantillas());
    } catch {
      // Sin la lista no hay selector: la galería sigue con el sitio principal.
      setSedes([]);
    } finally {
      setCargandoSedes(false);
    }
  }, []);

  useEffect(() => {
    if (!habilitado) return;
    void recargarSedes();
  }, [habilitado, recargarSedes]);

  const sede = branchId === null ? null : sedes.find((s) => s.branchId === branchId) ?? null;
  const sitio = useSitioV2({ branchId, deshabilitado: !habilitado || sede === null });
  const propio = sitio.sitio?.branchId === branchId && sede !== null;
  const documento = propio ? sitio.documento : null;
  const version = propio ? sitio.borrador?.version ?? null : null;

  const estiloPropio = documento ? tieneEstiloPropio(documento) : Boolean(sede?.estiloPropio);
  const enUso = useMemo(() => {
    const id = documento ? plantillaEnUsoDeSede(documento) : sede?.plantillaEnUsoId ?? null;
    return plantillaPorId(CATALOGO_SITIO, id);
  }, [documento, sede]);

  const recargar = sitio.recargar;
  const despues = useCallback(async () => {
    await Promise.all([recargar(), recargarSedes()]);
  }, [recargar, recargarSedes]);

  const usar = useCallback(
    async (plantilla: PlantillaCatalogo, alcance: AlcancePlantillaSede): Promise<ResultadoUsoSede> => {
      if (branchId === null) return { ok: false, conflicto: false, mensaje: '' };
      setUsando(plantilla.id);
      try {
        const r = await clienteSitiosV2.usarPlantillaEnSede(branchId, plantilla.id, alcance, version);
        await despues();
        if (r.instantaneaId && r.resumen) {
          return { ok: true, resumen: r.resumen, instantaneaId: r.instantaneaId, sitioId: r.sitioId, version: r.version };
        }
        return { ok: true, resumen: null, instantaneaId: null, sitioId: r.sitioId, version: r.version };
      } catch (error) {
        const conflicto = error instanceof ErrorApiSitio && error.esConflicto;
        if (conflicto) await despues();
        return { ok: false, conflicto, mensaje: mensajeDe(error) };
      } finally {
        setUsando(null);
      }
    },
    [branchId, version, despues],
  );

  const heredar = useCallback(async () => {
    if (branchId === null) return { ok: false, mensaje: '' };
    setHeredando(true);
    try {
      await clienteSitiosV2.heredarEstiloSede(branchId, version);
      await despues();
      return { ok: true, mensaje: '' };
    } catch (error) {
      if (error instanceof ErrorApiSitio && error.esConflicto) await despues();
      return { ok: false, mensaje: mensajeDe(error) };
    } finally {
      setHeredando(false);
    }
  }, [branchId, version, despues]);

  const deshacer = useCallback(
    async (r: { sitioId: string; instantaneaId: string; version: number }) => {
      try {
        await clienteSitiosV2.restaurarInstantanea(r.sitioId, r.instantaneaId, r.version);
        return true;
      } catch {
        return false;
      } finally {
        await despues();
      }
    },
    [despues],
  );

  return { sedes, cargandoSedes, sede, sitio, documento, estiloPropio, enUso, usando, heredando, usar, heredar, deshacer };
}
