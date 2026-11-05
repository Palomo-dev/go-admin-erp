/**
 * Formulario de conexión de un proveedor (`integration_connectors.settings_schema`).
 *
 * Los campos salen de la documentación oficial (o del convenio, cuando no hay doc pública). Un
 * campo `secreto: true` va al Vault (fn_set_provider_secret) y nunca vuelve al navegador; los
 * demás van a `integration_connections.settings`.
 */
import type { Ambiente } from './tipos';

export type TipoCampo = 'texto' | 'secreto' | 'numero' | 'seleccion';

export interface CampoConexion {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido: boolean;
  secreto: boolean;
  ayuda?: string;
  opciones?: string[];
}

export interface EsquemaConexion {
  version: number;
  fuente?: string;
  /** Sin doc oficial: se pueden guardar los datos, pero no probar ni conectar. */
  doc_pendiente?: boolean;
  ambientes: Ambiente[];
  campos: CampoConexion[];
}

const CLAVE_VALIDA = /^[a-z][a-z0-9_]{0,40}$/;
const TIPOS: readonly TipoCampo[] = ['texto', 'secreto', 'numero', 'seleccion'];

/** Lee el JSON de la base; cualquier forma inválida → null (el conector no tiene formulario). */
export function leerEsquema(valor: unknown): EsquemaConexion | null {
  if (!valor || typeof valor !== 'object') return null;
  const v = valor as Record<string, unknown>;
  if (!Array.isArray(v.campos)) return null;
  const campos: CampoConexion[] = [];
  for (const c of v.campos as unknown[]) {
    if (!c || typeof c !== 'object') return null;
    const x = c as Record<string, unknown>;
    if (typeof x.clave !== 'string' || !CLAVE_VALIDA.test(x.clave)) return null;
    if (typeof x.etiqueta !== 'string' || !TIPOS.includes(x.tipo as TipoCampo)) return null;
    campos.push({
      clave: x.clave,
      etiqueta: x.etiqueta,
      tipo: x.tipo as TipoCampo,
      requerido: x.requerido === true,
      secreto: x.secreto === true || x.tipo === 'secreto',
      ...(typeof x.ayuda === 'string' ? { ayuda: x.ayuda } : {}),
      ...(Array.isArray(x.opciones) ? { opciones: (x.opciones as unknown[]).filter((o): o is string => typeof o === 'string') } : {}),
    });
  }
  const ambientes = Array.isArray(v.ambientes)
    ? (v.ambientes as unknown[]).filter((a): a is Ambiente => a === 'sandbox' || a === 'production')
    : [];
  return {
    version: typeof v.version === 'number' ? v.version : 1,
    ...(typeof v.fuente === 'string' ? { fuente: v.fuente } : {}),
    ...(v.doc_pendiente === true ? { doc_pendiente: true } : {}),
    ambientes: ambientes.length > 0 ? ambientes : ['production'],
    campos,
  };
}

export interface ValoresSeparados {
  /** clave → valor, para el Vault (purpose = clave). */
  secretos: Record<string, string>;
  /** clave → valor, para integration_connections.settings. */
  ajustes: Record<string, string | number>;
}

/**
 * Valida lo que llega del formulario contra el esquema y lo separa en secretos y ajustes.
 * `existentes` son las claves que ya tienen valor guardado: en una edición, un campo requerido
 * que ya existe puede venir vacío (no se cambia).
 */
export function validarValores(
  esquema: EsquemaConexion,
  valores: Record<string, unknown>,
  existentes: ReadonlySet<string> = new Set(),
): { ok: true; valores: ValoresSeparados } | { ok: false; errores: Record<string, string> } {
  const errores: Record<string, string> = {};
  const secretos: Record<string, string> = {};
  const ajustes: Record<string, string | number> = {};
  const conocidas = new Set(esquema.campos.map((c) => c.clave));
  for (const k of Object.keys(valores)) if (!conocidas.has(k)) errores[k] = 'Campo desconocido para este proveedor.';

  for (const campo of esquema.campos) {
    const crudo = valores[campo.clave];
    const texto = typeof crudo === 'number' ? String(crudo) : typeof crudo === 'string' ? crudo.trim() : '';
    if (texto === '') {
      if (campo.requerido && !existentes.has(campo.clave)) errores[campo.clave] = 'Obligatorio.';
      continue;
    }
    if (texto.length > 4096) { errores[campo.clave] = 'Demasiado largo.'; continue; }
    if (campo.tipo === 'numero') {
      if (!/^-?\d+(\.\d+)?$/.test(texto)) { errores[campo.clave] = 'Debe ser un número.'; continue; }
      if (campo.secreto) secretos[campo.clave] = texto; else ajustes[campo.clave] = Number(texto);
      continue;
    }
    if (campo.tipo === 'seleccion' && campo.opciones && !campo.opciones.includes(texto)) {
      errores[campo.clave] = 'Opción no válida.';
      continue;
    }
    if (campo.secreto) secretos[campo.clave] = texto; else ajustes[campo.clave] = texto;
  }
  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, valores: { secretos, ajustes } };
}

/** ¿Están todos los requeridos (guardados o recién enviados)? Requisito para «Probar conexión». */
export function faltanRequeridos(esquema: EsquemaConexion, conValor: ReadonlySet<string>): string[] {
  return esquema.campos.filter((c) => c.requerido && !conValor.has(c.clave)).map((c) => c.clave);
}
