/**
 * Cómo se muestra la configuración contable: grupos de la pantalla y de dónde
 * sale el valor de cada clave. No decide ninguna cuenta del asiento.
 */
import { DEFINICIONES_CLAVE, type ClaveContable, type DefinicionClave, type FilaConfiguracion } from './configuracionContable';

export const GRUPOS_CONFIGURACION = ['tesoreria_cartera', 'ventas', 'inventario', 'impuestos', 'personal'] as const;
export type GrupoConfiguracion = (typeof GRUPOS_CONFIGURACION)[number];

/** Figma 2326:124894: estos dos abiertos, el resto plegado. */
export const GRUPOS_ABIERTOS: readonly GrupoConfiguracion[] = ['tesoreria_cartera', 'ventas'];

const GRUPO_DE: Record<string, GrupoConfiguracion> = {
  'Tesorería': 'tesoreria_cartera',
  'Cartera': 'tesoreria_cartera',
  'Ventas': 'ventas',
  'Inventario': 'inventario',
  'Impuestos': 'impuestos',
  'Personal': 'personal',
};

/** Una clave con un grupo desconocido no se pierde: cae en el último. */
export function definicionesPorGrupo(
  definiciones: readonly DefinicionClave[] = DEFINICIONES_CLAVE,
): { grupo: GrupoConfiguracion; definiciones: DefinicionClave[] }[] {
  return GRUPOS_CONFIGURACION.map((grupo) => ({
    grupo,
    definiciones: definiciones.filter((d) => (GRUPO_DE[d.grupo] ?? 'personal') === grupo),
  }));
}

export type OrigenClave = 'regla' | 'hereda' | 'sede' | 'sector' | 'contador';

/** La columna «Origen»: lo que hay guardado para ese alcance, sin resolver el asiento. */
export function origenDeClave(opciones: {
  clave: ClaveContable;
  valor: string | null;
  branchId: number | null;
  filas: readonly FilaConfiguracion[];
  propuesta: Partial<Record<ClaveContable, string>>;
}): OrigenClave {
  const { clave, valor, branchId, filas, propuesta } = opciones;
  if (!valor) {
    const deLaEmpresa = branchId != null && filas.some((f) => f.clave === clave && f.branch_id == null);
    return deLaEmpresa ? 'hereda' : 'regla';
  }
  if (branchId != null) return 'sede';
  return propuesta[clave] === valor ? 'sector' : 'contador';
}
