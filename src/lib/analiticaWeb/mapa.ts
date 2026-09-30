// ============================================================
// Analítica web — mapas (Figma 03 › 464:237485, «De dónde entran»): lógica pura.
//
// Agregación por país y por departamento, códigos ISO y escala de color de la
// coropleta. Sin React, sin d3 y sin geometrías: el componente del mapa carga
// las formas aparte (import diferido) y aquí solo se decide qué color lleva
// cada código.
//
// Códigos:
//   - País: ISO 3166-1 alfa-2 (`website_visits.country`, p. ej. «CO»). Las
//     geometrías de world-atlas vienen con el numérico ISO 3166-1 («170»):
//     `isoPaises.ts` los une.
//   - Departamento: ISO 3166-2 con país («CO-ANT»). `website_visits.region`
//     guarda la subdivisión SIN país («ANT», «DC»): `codigoRegionIso` la completa.
// ============================================================

import type { DatosAnalitica, FilaCiudad, FilaPais, FilaRegion } from './analiticaWeb';

// La tabla ISO 3166-1 numérico → alfa-2 vive en `isoPaises.ts`: solo la usa
// la carga diferida del mapa del mundo y así no pesa en el bundle de la pantalla.

/** Los 32 departamentos de Colombia y Bogotá D. C. (ISO 3166-2:CO). */
export const DEPARTAMENTOS_CO: ReadonlyArray<{ codigo: string; nombre: string }> = [
  { codigo: 'CO-AMA', nombre: 'Amazonas' },
  { codigo: 'CO-ANT', nombre: 'Antioquia' },
  { codigo: 'CO-ARA', nombre: 'Arauca' },
  { codigo: 'CO-ATL', nombre: 'Atlántico' },
  { codigo: 'CO-BOL', nombre: 'Bolívar' },
  { codigo: 'CO-BOY', nombre: 'Boyacá' },
  { codigo: 'CO-CAL', nombre: 'Caldas' },
  { codigo: 'CO-CAQ', nombre: 'Caquetá' },
  { codigo: 'CO-CAS', nombre: 'Casanare' },
  { codigo: 'CO-CAU', nombre: 'Cauca' },
  { codigo: 'CO-CES', nombre: 'Cesar' },
  { codigo: 'CO-CHO', nombre: 'Chocó' },
  { codigo: 'CO-COR', nombre: 'Córdoba' },
  { codigo: 'CO-CUN', nombre: 'Cundinamarca' },
  { codigo: 'CO-DC', nombre: 'Bogotá, D. C.' },
  { codigo: 'CO-GUA', nombre: 'Guainía' },
  { codigo: 'CO-GUV', nombre: 'Guaviare' },
  { codigo: 'CO-HUI', nombre: 'Huila' },
  { codigo: 'CO-LAG', nombre: 'La Guajira' },
  { codigo: 'CO-MAG', nombre: 'Magdalena' },
  { codigo: 'CO-MET', nombre: 'Meta' },
  { codigo: 'CO-NAR', nombre: 'Nariño' },
  { codigo: 'CO-NSA', nombre: 'Norte de Santander' },
  { codigo: 'CO-PUT', nombre: 'Putumayo' },
  { codigo: 'CO-QUI', nombre: 'Quindío' },
  { codigo: 'CO-RIS', nombre: 'Risaralda' },
  { codigo: 'CO-SAN', nombre: 'Santander' },
  { codigo: 'CO-SAP', nombre: 'San Andrés y Providencia' },
  { codigo: 'CO-SUC', nombre: 'Sucre' },
  { codigo: 'CO-TOL', nombre: 'Tolima' },
  { codigo: 'CO-VAC', nombre: 'Valle del Cauca' },
  { codigo: 'CO-VAU', nombre: 'Vaupés' },
  { codigo: 'CO-VID', nombre: 'Vichada' },
];

const NOMBRE_DEPARTAMENTO = new Map(DEPARTAMENTOS_CO.map((d) => [d.codigo, d.nombre]));

/** Alias que algunos proveedores de geolocalización usan para Bogotá. */
const ALIAS_REGION: Readonly<Record<string, string>> = { 'CO-BOG': 'CO-DC', 'CO-CUN-DC': 'CO-DC' };

/**
 * `website_visits.region` → ISO 3166-2 con país. Acepta «ANT», «ant», « DC »
 * y también el código ya completo («CO-ANT»). Null si no tiene forma de código.
 */
export function codigoRegionIso(pais: string | null | undefined, region: string | null | undefined): string | null {
  if (!pais || !region) return null;
  const p = pais.trim().toUpperCase();
  const r = region.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(p) || r === '') return null;
  let codigo: string | null = null;
  if (r.startsWith(`${p}-`) && /^[A-Z0-9]{1,3}(-[A-Z0-9]{1,3})?$/.test(r.slice(3))) codigo = r;
  else if (/^[A-Z0-9]{1,3}$/.test(r)) codigo = `${p}-${r}`;
  if (!codigo) return null;
  return ALIAS_REGION[codigo] ?? codigo;
}

/** Nombre de un departamento de Colombia (o el código tal cual si no se conoce). */
export function nombreRegion(pais: string | null | undefined, region: string | null | undefined): string | null {
  const codigo = codigoRegionIso(pais, region);
  if (!codigo) return region ?? null;
  return NOMBRE_DEPARTAMENTO.get(codigo) ?? region ?? null;
}

export interface ValorRegion {
  codigo: string;
  visitantes: number;
  sesiones: number;
  /** Fracción (0–1) de los visitantes del mapa. */
  pct: number;
}

function conPorcentaje(acum: Map<string, { visitantes: number; sesiones: number }>): Map<string, ValorRegion> {
  let total = 0;
  acum.forEach((v) => {
    total += v.visitantes;
  });
  const salida = new Map<string, ValorRegion>();
  acum.forEach((v, codigo) => {
    salida.set(codigo, { codigo, visitantes: v.visitantes, sesiones: v.sesiones, pct: total > 0 ? v.visitantes / total : 0 });
  });
  return salida;
}

/** Visitantes por país (alfa-2 en mayúsculas). Filas repetidas se suman; vacías se ignoran. */
export function agregarPorPais(paises: readonly FilaPais[]): Map<string, ValorRegion> {
  const acum = new Map<string, { visitantes: number; sesiones: number }>();
  for (const p of paises) {
    const codigo = (p.pais ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(codigo) || p.visitantes <= 0) continue;
    const previo = acum.get(codigo) ?? { visitantes: 0, sesiones: 0 };
    acum.set(codigo, { visitantes: previo.visitantes + p.visitantes, sesiones: previo.sesiones + p.sesiones });
  }
  return conPorcentaje(acum);
}

/**
 * Respaldo de `valoresRegionMapa` cuando la RPC no trae `regiones`.
 * Visitantes por región (ISO 3166-2) a partir de las ciudades del país. La RPC
 * devuelve las 50 ciudades con más visitantes, así que con más ciudades el
 * departamento es una cota inferior (la UI lo avisa). `sinRegion`: visitantes
 * de ciudades sin región reconocible.
 */
export function agregarPorRegion(ciudades: readonly FilaCiudad[], pais: string): { valores: Map<string, ValorRegion>; sinRegion: number } {
  const acum = new Map<string, { visitantes: number; sesiones: number }>();
  let sinRegion = 0;
  for (const c of ciudades) {
    const codigo = codigoRegionIso(pais, c.region);
    if (!codigo) {
      sinRegion += c.visitantes;
      continue;
    }
    const previo = acum.get(codigo) ?? { visitantes: 0, sesiones: 0 };
    acum.set(codigo, { visitantes: previo.visitantes + c.visitantes, sesiones: previo.sesiones + c.sesiones });
  }
  return { valores: conPorcentaje(acum), sinRegion };
}

/**
 * Visitantes por región (ISO 3166-2) a partir de la clave `regiones` de la RPC
 * (ya agrupada por `website_visits.region`, sin tope de ciudades). Misma
 * normalización que desde ciudades (`codigoRegionIso`: «ant» → «CO-ANT»,
 * «BOG» → «CO-DC»); dos filas que caen en el mismo código se suman.
 */
export function agregarRegiones(regiones: readonly FilaRegion[], pais: string): { valores: Map<string, ValorRegion>; sinRegion: number } {
  const acum = new Map<string, { visitantes: number; sesiones: number }>();
  let sinRegion = 0;
  for (const r of regiones) {
    const codigo = codigoRegionIso(pais, r.region);
    if (!codigo) {
      sinRegion += r.visitantes;
      continue;
    }
    if (r.visitantes <= 0) continue;
    const previo = acum.get(codigo) ?? { visitantes: 0, sesiones: 0 };
    acum.set(codigo, { visitantes: previo.visitantes + r.visitantes, sesiones: previo.sesiones + r.sesiones });
  }
  return { valores: conPorcentaje(acum), sinRegion };
}

/**
 * Valores del mapa por región. Usa `regiones` cuando la RPC la trae y, si no
 * (base sin la migración), agrega desde las ciudades. `parcial`: el valor es
 * una cota inferior porque salió de las 50 ciudades con más visitantes y hay
 * más ciudades (la UI lo avisa).
 */
export function valoresRegionMapa(
  datos: Pick<DatosAnalitica, 'ciudades' | 'ciudadesTotal' | 'regiones'>,
  pais: string,
): { valores: Map<string, ValorRegion>; sinRegion: number; parcial: boolean } {
  if (Array.isArray(datos.regiones)) return { ...agregarRegiones(datos.regiones, pais), parcial: false };
  return { ...agregarPorRegion(datos.ciudades, pais), parcial: datos.ciudadesTotal > datos.ciudades.length };
}

/** Ciudades de una región (código ISO 3166-2); sin región elegida, todas. */
export function filtrarCiudadesPorRegion<T extends Pick<FilaCiudad, 'region'>>(ciudades: readonly T[], pais: string, region: string | null): T[] {
  if (!region) return [...ciudades];
  return ciudades.filter((c) => codigoRegionIso(pais, c.region) === region);
}

/** ¿Se abre Colombia por defecto? Cuando más de la mitad de los visitantes ubicados son de CO. */
export function debeAbrirColombia(paises: readonly FilaPais[]): boolean {
  const co = agregarPorPais(paises).get('CO');
  return co !== undefined && co.pct > 0.5;
}

// ─── Escala de color ─────────────────────────────────────────────────────────

/** Pasos de la escala secuencial (sin contar «sin visitas»). */
export const PASOS_ESCALA = 5;

/**
 * Paso de la escala (0 = sin visitas, 1…5 = de menos a más). Escala
 * logarítmica: en una tienda un país suele concentrar casi todo y, en lineal,
 * el resto quedaría en el primer tono.
 */
export function pasoEscala(valor: number, max: number): number {
  if (!(valor > 0) || !(max > 0)) return 0;
  const v = Math.min(valor, max);
  const t = Math.log1p(v) / Math.log1p(max);
  return Math.min(PASOS_ESCALA, Math.max(1, Math.ceil(t * PASOS_ESCALA - 1e-9)));
}

const rgb = (token: string) => `rgb(var(--${token}))`;
const mezcla = (a: string, pctA: number, b: string) => `color-mix(in srgb, ${rgb(a)} ${pctA}%, ${rgb(b)})`;

/**
 * Relleno de cada paso con los tokens de la marca: tinte (#EEF1FE) → Azul GO
 * (#4361EE) → azul profundo (#2A3EA8). En modo oscuro los mismos tokens cambian
 * de valor (tokens.css `.dark`), así que la escala se adapta sola. El paso 0
 * («sin visitas») es el gris claro del borde por defecto.
 */
export const RELLENOS_ESCALA: readonly string[] = [
  rgb('border-default'),
  mezcla('brand-tint', 55, 'brand-primary'),
  mezcla('brand-tint', 25, 'brand-primary'),
  rgb('brand-primary'),
  mezcla('brand-primary', 50, 'brand-deep'),
  rgb('brand-deep'),
];

export function rellenoPaso(paso: number): string {
  return RELLENOS_ESCALA[Math.max(0, Math.min(PASOS_ESCALA, Math.round(paso)))];
}
