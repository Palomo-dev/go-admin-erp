'use client';

/**
 * Plantillas del sitio (Figma A/06b-06e): catálogo por giro, la que está «En
 * uso» en el borrador y «Usar esta plantilla» (estilo + estructura de Inicio,
 * conservando el contenido: `usarPlantilla`), guardada con el hook único del
 * borrador (`useSitioV2().guardar`, compare-and-swap; la base exige
 * `website.sites.edit`). Sin sitio V2 aún, `useContextoDiseno` lo crea al
 * entrar si hay permiso.
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
import { usarPlantilla, type ResultadoUsarPlantilla } from '@/lib/website/v2/usarPlantilla';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { CATALOGO_SITIO } from './catalogo';
import type { ContextoDiseno } from './useContextoDiseno';

/** Pestañas de A/06b; transporte y parqueadero aparecen solo si es el giro de la organización. */
export const PESTANAS_GIRO_BASE: readonly GiroCatalogo[] = ['restaurante', 'tienda', 'hotel', 'servicios', 'gimnasio'];
export type PestanaGiro = GiroCatalogo | 'todas';

export function pestanasGiro(giroOrganizacion: GiroCatalogo | null): PestanaGiro[] {
  const giros: PestanaGiro[] = [...PESTANAS_GIRO_BASE];
  if (giroOrganizacion && !giros.includes(giroOrganizacion)) giros.push(giroOrganizacion);
  return [...giros, 'todas'];
}

/** Si falla, el motivo lo dice `useSitioV2` (`error` o `conflicto`, que abre su diálogo). */
export type ResultadoUso = { ok: true; resultado: ResultadoUsarPlantilla } | { ok: false };

export interface Plantillas {
  contadores: Record<PestanaGiro, number>;
  delGiro: (giro: PestanaGiro) => PlantillaCatalogo[];
  enUso: PlantillaCatalogo | null;
  usando: string | null;
  usar: (plantilla: PlantillaCatalogo) => Promise<ResultadoUso>;
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
        const caja: { resultado: ResultadoUsarPlantilla | null } = { resultado: null };
        const ok = await guardar((d) => {
          caja.resultado = usarPlantilla(d, plantilla, extendidos);
          return caja.resultado.documento;
        });
        return ok && caja.resultado ? { ok: true, resultado: caja.resultado } : { ok: false };
      } finally {
        setUsando(null);
      }
    },
    [asegurar, guardar, extendidos],
  );

  return {
    contadores: contarPorGiro(CATALOGO_SITIO),
    delGiro: (giro) => plantillasDelGiro(CATALOGO_SITIO, giro),
    enUso,
    usando,
    usar,
  };
}
