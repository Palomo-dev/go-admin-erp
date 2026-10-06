/**
 * Sucursales de Organización › Sedes: estado del sitio web por sede, cifras de
 * la cabecera y exportación.
 *
 * El sitio web sale de `website_site_states` (editor V2): la fila con
 * `branch_id = NULL` es el sitio principal y una fila con `branch_id` es el
 * sitio propio de esa sede. Una sede «publicada» tiene su fila con revisión
 * publicada; una sede sin sitio propio pero marcada para la web
 * (`branches.is_web_published`) usa el del principal si este está publicado.
 */
import { cupoSucursales, type Cupo } from './cupo';
import { normalizar } from './invitaciones';
import { turnosDelDia } from './horarioSede';

export type EstadoSitioSede = 'publicado' | 'heredado' | 'sinSitio';

export interface EstadoSitioFila {
  branch_id: number | null;
  published_revision_id: string | null;
}

export interface SucursalBase {
  id: number;
  name: string;
  is_active?: boolean | null;
  is_main?: boolean | null;
  is_web_published?: boolean | null;
  manager_id?: string | null;
  city?: string | null;
}

export function estadoSitioSede(sede: SucursalBase, sitios: readonly EstadoSitioFila[]): EstadoSitioSede {
  const propio = sitios.find((s) => s.branch_id === sede.id);
  if (propio?.published_revision_id) return 'publicado';
  const principal = sitios.find((s) => s.branch_id === null);
  const principalPublicado = !!principal?.published_revision_id;
  // La sede principal no tiene sitio propio: el principal ES el suyo.
  if (sede.is_main && principalPublicado) return 'publicado';
  if (principalPublicado && sede.is_web_published) return 'heredado';
  return 'sinSitio';
}

export interface ResumenSucursales {
  total: number;
  activas: number;
  inactivas: number;
  sinGerente: number;
  conSitio: number;
  cupo: Cupo;
}

/**
 * Cifras de la cabecera. El cupo cuenta SOLO las activas, igual que
 * `GET /api/me/plan`, para que «6 de 15» diga lo mismo aquí y en Plan.
 */
export function resumenSucursales(
  sedes: readonly SucursalBase[],
  sitios: readonly EstadoSitioFila[],
  maximo: number | null,
): ResumenSucursales {
  const activas = sedes.filter((s) => s.is_active !== false);
  return {
    total: sedes.length,
    activas: activas.length,
    inactivas: sedes.length - activas.length,
    sinGerente: activas.filter((s) => !s.manager_id).length,
    conSitio: sedes.filter((s) => estadoSitioSede(s, sitios) !== 'sinSitio').length,
    cupo: cupoSucursales(activas.length, maximo),
  };
}

export type FiltroEstadoSede = 'todas' | 'activa' | 'inactiva';

export function filtrarSucursales<T extends SucursalBase & { address?: string | null; branch_code?: string | null }>(
  sedes: readonly T[],
  texto: string,
  estado: FiltroEstadoSede,
): T[] {
  const q = normalizar(texto);
  return sedes.filter((s) => {
    if (estado === 'activa' && s.is_active === false) return false;
    if (estado === 'inactiva' && s.is_active !== false) return false;
    if (!q) return true;
    return normalizar(`${s.name} ${s.city ?? ''} ${s.address ?? ''} ${s.branch_code ?? ''}`).includes(q);
  });
}

/** La principal primero; luego activas antes que inactivas; luego por nombre. */
export function ordenarSucursales<T extends SucursalBase>(sedes: readonly T[]): T[] {
  return [...sedes].sort((a, b) => {
    if (!!a.is_main !== !!b.is_main) return a.is_main ? -1 : 1;
    const ia = a.is_active === false ? 1 : 0;
    const ib = b.is_active === false ? 1 : 0;
    if (ia !== ib) return ia - ib;
    return a.name.localeCompare(b.name, 'es');
  });
}

function celdaCsv(valor: unknown): string {
  const texto = valor == null ? '' : String(valor);
  // Una celda que empieza por = + - @ se ejecuta como fórmula en Excel.
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** CSV (UTF-8 con BOM para que Excel respete las tildes). */
export function sucursalesACsv(
  encabezados: readonly string[],
  filas: readonly (readonly unknown[])[],
): string {
  const lineas = [encabezados, ...filas].map((f) => f.map(celdaCsv).join(','));
  return `\uFEFF${lineas.join('\n')}`;
}

/** Dominio de los subdominios de sitios (`<sub>.goadmin.io`). Era un literal repetido en BranchesTab. */
export const DOMINIO_SITIOS = 'goadmin.io';

/**
 * URL pública de la sede, en el mismo orden en que el sitio la resuelve: dominio
 * propio, o la ruta de la sede bajo el dominio/subdominio de la organización.
 * `null` si no tiene.
 *
 * `branches.subdomain` NO cuenta: `https://<subdominio>.goadmin.io` el sitio lo
 * resuelve como OTRA organización (la de ese subdominio). El sitio sí resuelve
 * `<slug>.<org>.goadmin.io`, pero depende de un certificado comodín de dos
 * niveles; la ruta `/<slug>` funciona siempre.
 */
export function urlPublicaSede(
  sede: { custom_domain?: string | null; subdomain?: string | null; slug?: string | null },
  org: { subdominio?: string | null; dominio?: string | null },
): string | null {
  if (sede.custom_domain) return `https://${sede.custom_domain}`;
  if (!sede.slug) return null;
  if (org.dominio) return `https://${org.dominio}/${sede.slug}`;
  if (org.subdominio) return `https://${org.subdominio}.${DOMINIO_SITIOS}/${sede.slug}`;
  return null;
}

export interface HorarioDia {
  open?: string | null;
  close?: string | null;
  closed?: boolean | null;
  tramos?: { open: string; close: string }[] | null;
}

const DIAS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

/**
 * Horario en tramos legibles: días seguidos con el mismo horario se agrupan
 * («Lun–Vie 09:00–18:00», «Sáb 10:00–15:00»). `nombresDias` en el idioma
 * activo, de lunes a domingo. Sin horario o todo cerrado → lista vacía.
 */
export function resumenHorario(
  horario: Partial<Record<(typeof DIAS)[number], HorarioDia | null | undefined>> | null | undefined,
  nombresDias: readonly string[],
): string[] {
  if (!horario) return [];
  // Con turnos partidos: «12:00–15:00 · 19:00–23:00».
  const franja = (d: HorarioDia | null | undefined): string | null => {
    const turnos = turnosDelDia(d);
    return turnos.length > 0 ? turnos.map((t) => `${t.open}–${t.close}`).join(' · ') : null;
  };
  const tramos: { desde: number; hasta: number; franja: string }[] = [];
  DIAS.forEach((dia, i) => {
    const f = franja(horario[dia]);
    if (!f) return;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.hasta === i - 1 && ultimo.franja === f) ultimo.hasta = i;
    else tramos.push({ desde: i, hasta: i, franja: f });
  });
  return tramos.map((t) => {
    const dias = t.desde === t.hasta ? nombresDias[t.desde] : `${nombresDias[t.desde]}–${nombresDias[t.hasta]}`;
    return `${dias} ${t.franja}`;
  });
}

// ─── Importar (CSV con las mismas columnas que «Exportar») ─────────────────

/**
 * Lee un CSV (coma o punto y coma, comillas dobles, BOM). Devuelve las filas
 * como listas de celdas; descarta las filas vacías.
 */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else celda += c;
  }
  fila.push(celda);
  filas.push(fila);
  return filas.filter((f) => f.some((x) => x.trim() !== ''));
}

export type CampoImportable = 'name' | 'branch_code' | 'city' | 'address' | 'phone';

export interface SucursalImportada {
  /** Número de línea en el archivo (1 = encabezados). */
  linea: number;
  datos: Partial<Record<CampoImportable, string>>;
  /** Motivo por el que no se importa (`null` = válida). */
  error: 'sinNombre' | 'duplicada' | 'codigoRepetido' | null;
}

/** Quita el apóstrofo que `sucursalesACsv` antepone a las celdas tipo fórmula. */
function desescapar(valor: string): string {
  const v = valor.trim();
  return /^'[=+\-@]/.test(v) ? v.slice(1) : v;
}

/**
 * Del CSV a sucursales por crear. `encabezados` asocia cada campo a los
 * nombres de columna aceptados (los de «Exportar» en el idioma activo, más el
 * nombre técnico). Las columnas que no se reconocen se ignoran (gerente,
 * estado, sitio: se deciden en la app). Se marcan como no importables las
 * filas sin nombre, con un nombre que ya existe o repetido en el archivo, y
 * con un código que ya existe.
 */
export function prepararImportacion(
  filas: readonly (readonly string[])[],
  encabezados: Record<CampoImportable, readonly string[]>,
  existentes: readonly { name: string; branch_code?: string | null }[],
): { columnas: CampoImportable[]; sucursales: SucursalImportada[] } {
  const [cabecera = [], ...cuerpo] = filas;
  const indice = new Map<CampoImportable, number>();
  cabecera.forEach((h, i) => {
    const n = normalizar(h);
    for (const campo of Object.keys(encabezados) as CampoImportable[]) {
      if (!indice.has(campo) && encabezados[campo].some((e) => normalizar(e) === n)) indice.set(campo, i);
    }
  });
  const nombres = new Set(existentes.map((s) => normalizar(s.name)));
  const codigos = new Set(existentes.map((s) => normalizar(s.branch_code ?? '')).filter(Boolean));
  const sucursales = cuerpo.map((celdas, i): SucursalImportada => {
    const datos: Partial<Record<CampoImportable, string>> = {};
    for (const [campo, col] of indice) {
      const v = desescapar(celdas[col] ?? '');
      if (v) datos[campo] = v;
    }
    let error: SucursalImportada['error'] = null;
    const nombre = normalizar(datos.name ?? '');
    const codigo = normalizar(datos.branch_code ?? '');
    if (!nombre) error = 'sinNombre';
    else if (nombres.has(nombre)) error = 'duplicada';
    else if (codigo && codigos.has(codigo)) error = 'codigoRepetido';
    if (!error) {
      nombres.add(nombre);
      if (codigo) codigos.add(codigo);
    }
    return { linea: i + 2, datos, error };
  });
  return { columnas: [...indice.keys()], sucursales };
}

/** Cuántas válidas caben en el cupo (`null` = sin tope). */
export function cabenEnCupo(validas: number, restantes: number | null): number {
  return restantes === null ? validas : Math.max(0, Math.min(validas, restantes));
}
