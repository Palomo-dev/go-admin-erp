/**
 * Datos de la importación que la ficha del cliente y el detalle del lead
 * muestran (bug «se pierden un montón de datos», 2026-10-06).
 *
 * Lo que tiene columna propia en `customers` (ciudad, dirección, teléfono,
 * correo, NIT, notas, etiquetas…) lo pinta la ficha desde esas columnas. Lo
 * que no la tiene vive en `metadata.importacion` (departamento, país, web,
 * cargo, fuentes, columnas adicionales…) y nadie lo mostraba: este módulo lo
 * lee. En un cliente que YA existía («ligar») la fila completa está en
 * `metadata.lead.importacion` y también se lee (sin pisar la ficha).
 *
 * Módulo puro: sin React ni Supabase. Las etiquetas las pone la interfaz
 * (`crm.datosImportados.campos.<clave>`); las fechas las formatea con
 * `formatPlain` (son días calendario, no instantes).
 */

import { urlNormalizada } from './normalizacion';

export type ClaveDatoImportado =
  | 'nombre'
  | 'razonSocial'
  | 'contacto'
  | 'cargo'
  | 'nit'
  | 'telefono'
  | 'telefonosAdicionales'
  | 'tipoTelefono'
  | 'correo'
  | 'correosAdicionales'
  | 'direccion'
  | 'barrio'
  | 'ciudad'
  | 'departamento'
  | 'pais'
  | 'zona'
  | 'sector'
  | 'subsector'
  | 'prioridad'
  | 'etapa'
  | 'plan'
  | 'valor'
  | 'valorOriginal'
  | 'web'
  | 'fuentes'
  | 'fuentesTexto'
  | 'horario'
  | 'verificacion'
  | 'fechaVerificacion'
  | 'fecha'
  | 'rneArchivo'
  | 'notas'
  | 'etiquetas';

export type DatoImportado =
  | { clave: ClaveDatoImportado; tipo: 'texto'; valor: string }
  | { clave: ClaveDatoImportado; tipo: 'lista'; valores: string[] }
  | { clave: ClaveDatoImportado; tipo: 'enlaces'; valores: string[] }
  /** Día calendario AAAA-MM-DD: se formatea con `formatPlain`, sin zona. */
  | { clave: ClaveDatoImportado; tipo: 'fecha'; valor: string }
  | { clave: ClaveDatoImportado; tipo: 'importe'; monto: number; moneda: string | null };

export interface OrigenImportacion {
  lote: string | null;
  archivo: string | null;
  fila: number | null;
  idExterno: string | null;
  /** Instante (timestamptz en ISO): se formatea en la zona de la organización. */
  importadoEn: string | null;
  rne: string | null;
}

export interface DatosImportados {
  datos: DatoImportado[];
  /** Columnas del archivo sin campo propio, con su encabezado original. */
  adicionales: { columna: string; valor: string }[];
  /** Valores que vinieron pero no se pudieron interpretar (teléfono, correo, NIT, web, valor). */
  descartados: { campo: string; valor: string }[];
  origen: OrigenImportacion;
}

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const txt = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
};
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(txt).filter((x): x is string => !!x) : []);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Claves de `metadata.importacion` (o `metadata.lead.importacion`) → dato, en el orden de la ficha. */
const TEXTOS: ReadonlyArray<[ClaveDatoImportado, string]> = [
  ['nombre', 'nombre'],
  ['razonSocial', 'razon_social'],
  ['contacto', 'contacto'],
  ['cargo', 'cargo'],
  ['nit', 'nit'],
  ['telefono', 'telefono'],
  ['telefonosAdicionales', 'telefonos_adicionales'],
  ['tipoTelefono', 'tipo_telefono'],
  ['correo', 'correo'],
  ['correosAdicionales', 'correos_adicionales'],
  ['direccion', 'direccion'],
  ['barrio', 'barrio'],
  ['ciudad', 'ciudad'],
  ['departamento', 'departamento'],
  ['pais', 'pais'],
  ['zona', 'zona'],
  ['sector', 'sector'],
  ['subsector', 'subsector'],
  ['prioridad', 'prioridad'],
  ['etapa', 'etapa'],
  ['plan', 'plan_probable'],
];
const LISTAS: ReadonlySet<ClaveDatoImportado> = new Set(['telefonosAdicionales', 'correosAdicionales', 'fuentesTexto', 'etiquetas']);
const DESPUES_DEL_VALOR: ReadonlyArray<[ClaveDatoImportado, string]> = [
  ['fuentesTexto', 'fuentes_texto'],
  ['horario', 'horario_contacto'],
  ['verificacion', 'verificacion'],
  ['fechaVerificacion', 'fecha_verificacion'],
  ['fecha', 'fecha_archivo'],
  ['rneArchivo', 'rne_archivo'],
  ['notas', 'notas'],
  ['etiquetas', 'etiquetas'],
];
const FECHAS: ReadonlySet<ClaveDatoImportado> = new Set(['fechaVerificacion', 'fecha']);
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function dato(clave: ClaveDatoImportado, v: unknown): DatoImportado | null {
  if (LISTAS.has(clave)) {
    const valores = Array.isArray(v) ? lista(v) : txt(v) ? [txt(v) as string] : [];
    return valores.length ? { clave, tipo: 'lista', valores } : null;
  }
  const s = txt(v);
  if (!s) return null;
  if (FECHAS.has(clave) && FECHA_RE.test(s)) return { clave, tipo: 'fecha', valor: s };
  return { clave, tipo: 'texto', valor: s };
}

/** Une la importación de la ficha con la del lead: gana la de la ficha; la del lead completa. */
function fuentesDeDatos(importacion: unknown, lead: unknown): Obj | null {
  const deFicha = obj(importacion);
  const deLead = obj(obj(lead)?.importacion);
  if (!deFicha && !deLead) return null;
  return { ...(deLead ?? {}), ...(deFicha ?? {}) };
}

/**
 * Datos importados de una ficha. `importacion` = `metadata.importacion`,
 * `lead` = `metadata.lead`. `null` si la ficha no viene de una importación.
 */
export function datosImportadosDe(importacion: unknown, lead?: unknown): DatosImportados | null {
  const m = fuentesDeDatos(importacion, lead);
  if (!m) return null;
  const datos: DatoImportado[] = [];
  const empujar = (d: DatoImportado | null) => d && datos.push(d);

  for (const [clave, k] of TEXTOS) {
    if (clave === 'nit') {
      const nit = txt(m.nit);
      const dv = num(m.dv);
      empujar(nit ? { clave, tipo: 'texto', valor: dv === null ? nit : `${nit}-${dv}` } : null);
      continue;
    }
    empujar(dato(clave, m[k]));
  }

  const estimado = obj(obj(lead)?.valor_estimado);
  const monto = num(estimado?.monto);
  if (monto !== null) datos.push({ clave: 'valor', tipo: 'importe', monto, moneda: txt(estimado?.moneda) });
  const original = obj(m.valor_original);
  const montoOriginal = num(original?.monto);
  // El valor tal como vino en el archivo, solo si difiere del estimado (otra moneda o sin tasa).
  if (montoOriginal !== null && (monto === null || montoOriginal !== monto || txt(original?.moneda) !== txt(estimado?.moneda))) {
    datos.push({ clave: 'valorOriginal', tipo: 'importe', monto: montoOriginal, moneda: txt(original?.moneda) });
  }

  const web = urlNormalizada(txt(m.web));
  if (web) datos.push({ clave: 'web', tipo: 'enlaces', valores: [web] });
  const fuentes = lista(m.fuentes).map(urlNormalizada).filter((u): u is string => !!u);
  if (fuentes.length) datos.push({ clave: 'fuentes', tipo: 'enlaces', valores: fuentes });

  for (const [clave, k] of DESPUES_DEL_VALOR) empujar(dato(clave, m[k]));

  const adicionales = Object.entries(obj(m.adicionales) ?? {})
    .map(([columna, v]) => ({ columna, valor: txt(v) ?? '' }))
    .filter((a) => a.columna.trim() && a.valor);
  const descartados = Object.entries(obj(m.valores_descartados) ?? {})
    .map(([campo, v]) => ({ campo, valor: txt(v) ?? '' }))
    .filter((d) => d.valor);

  const filaNum = num(m.fila);
  return {
    datos,
    adicionales,
    descartados,
    origen: {
      lote: txt(m.lote),
      archivo: txt(m.archivo),
      fila: filaNum === null ? null : Math.trunc(filaNum),
      idExterno: txt(m.id_externo),
      importadoEn: txt(m.importado_en),
      rne: txt(m.rne),
    },
  };
}

/** ¿La ficha viene de una importación (en ella o, si ya existía, en `metadata.lead`)? */
export function tieneDatosImportados(importacion: unknown, lead?: unknown): boolean {
  return fuentesDeDatos(importacion, lead) !== null;
}

/** Departamento importado (para la tarjeta de dirección cuando no hay municipio fiscal). */
export function departamentoImportado(importacion: unknown, lead?: unknown): string | null {
  return txt(fuentesDeDatos(importacion, lead)?.departamento);
}

/** Cargo importado de la persona de contacto. */
export function cargoImportado(importacion: unknown, lead?: unknown): string | null {
  return txt(fuentesDeDatos(importacion, lead)?.cargo);
}
