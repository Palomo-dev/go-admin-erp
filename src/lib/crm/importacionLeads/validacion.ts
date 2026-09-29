/**
 * Lectura, validación y deduplicación DENTRO DEL ARCHIVO del importador de leads.
 *
 * La misma función valida en el navegador (vista previa inmediata) y en el
 * servidor (que NUNCA confía en la validación del cliente: vuelve a normalizar
 * y validar cada fila antes de escribir).
 *
 * Reglas (las mismas del alta manual, `leadCustomer.resolveLeadCustomer`):
 *  - Hace falta un nombre: comercial, razón social o de contacto.
 *  - Hace falta una forma de contacto válida: teléfono o correo. Un teléfono
 *    que no es un número válido se descarta con aviso si hay correo, y es error
 *    si era la única forma de contacto (igual con el correo).
 *
 * Deduplicación en el archivo: la segunda fila con el mismo teléfono (E.164),
 * NIT o correo que una anterior se OMITE (se reporta con la fila original). El
 * contraste con la base lo hace el servidor (`leadsImportService`).
 */

import { CAMPOS_MULTIPLES, type CampoLead, type CampoSimple, type MapeoLead } from './campos';
import { filaVacia } from '@/lib/importacion/libro';
import {
  bandaDesdePrioridad,
  correoNormalizado,
  listaEtiquetas,
  nitNormalizado,
  telefonoE164,
  textoLimpio,
  urlNormalizada,
  valorNumerico,
} from './normalizacion';
import type { FilaLeadEntrada, FilaLeadNormalizada, FilaLeadValidada, MensajeImportacion, OpcionesImportacionLeads } from './tipos';

/** Límite por archivo (configurable en el servidor con `LEADS_IMPORT_MAX_FILAS`). */
export const MAX_FILAS_POR_ARCHIVO = 1000;
/** Filas por petición de `importar` (cada alta son ~10 consultas; el asistente manda bloques). */
export const TAMANO_BLOQUE_IMPORTAR = 25;
/** Máximo que acepta el servidor por petición de `importar`. */
export const MAX_FILAS_POR_BLOQUE = 50;

/** Filas del archivo (tras la cabecera) con el mapeo aplicado. Las filas vacías se saltan. */
export function leerFilasLeads(matriz: unknown[][], filaCabecera: number, mapeo: MapeoLead): FilaLeadEntrada[] {
  const filas: FilaLeadEntrada[] = [];
  for (let i = filaCabecera + 1; i < matriz.length; i++) {
    const celdas = matriz[i];
    if (filaVacia(celdas)) continue;
    const f: FilaLeadEntrada = { fila: i + 1, campos: {} };
    mapeo.forEach((campo, col) => {
      if (!campo) return;
      const v = textoLimpio(celdas[col]);
      if (!v) return;
      if (CAMPOS_MULTIPLES.has(campo)) {
        const lista = campo === 'fuente' ? (f.fuente ??= []) : (f.etiquetas ??= []);
        lista.push(v);
      } else {
        const simple = campo as CampoSimple;
        if (!f.campos[simple]) f.campos[simple] = v;
      }
    });
    filas.push(f);
  }
  return filas;
}

const m = (codigo: string, params?: Record<string, string | number>): MensajeImportacion => (params ? { codigo, params } : { codigo });

/** Valida y normaliza una fila. `datos` es `null` si la fila tiene errores. */
export function validarFilaLead(entrada: FilaLeadEntrada, opciones: Pick<OpcionesImportacionLeads, 'pais' | 'tipoCliente'>): FilaLeadValidada {
  const c = entrada.campos ?? {};
  const errores: MensajeImportacion[] = [];
  const avisos: MensajeImportacion[] = [];
  const t = (k: CampoLead) => textoLimpio((c as Record<string, unknown>)[k]);

  const nombreComercial = t('nombre');
  const razonSocial = t('razonSocial');
  const contacto = t('contacto');
  const nombre = nombreComercial ?? razonSocial ?? contacto;
  if (!nombre) errores.push(m('sin_nombre'));

  const telefonoCrudo = t('telefono');
  const telefono = telefonoE164(telefonoCrudo, opciones.pais || 'CO');
  const correoCrudo = t('correo');
  const correo = correoNormalizado(correoCrudo);

  if (!telefono && !correo) {
    if (telefonoCrudo) errores.push(m('telefono_invalido', { valor: telefonoCrudo }));
    else if (correoCrudo) errores.push(m('correo_invalido', { valor: correoCrudo }));
    else errores.push(m('sin_contacto'));
  } else {
    if (telefonoCrudo && !telefono) avisos.push(m('telefono_descartado', { valor: telefonoCrudo }));
    if (correoCrudo && !correo) avisos.push(m('correo_descartado', { valor: correoCrudo }));
  }

  const nitCrudo = t('nit');
  const nit = nitNormalizado(nitCrudo, t('dv'));
  if (nitCrudo && !nit) avisos.push(m('nit_invalido', { valor: nitCrudo }));
  if (nit && nit.dvValido === false) avisos.push(m('nit_dv_invalido', { valor: nitCrudo ?? '' }));

  const valorCrudo = t('valor');
  const valor = valorNumerico(valorCrudo);
  if (valorCrudo && valor === null) avisos.push(m('valor_invalido', { valor: valorCrudo }));

  const webCruda = t('web');
  const web = urlNormalizada(webCruda);
  if (webCruda && !web) avisos.push(m('web_invalida', { valor: webCruda }));

  const prioridad = t('prioridad');
  const icpBand = bandaDesdePrioridad(prioridad);
  if (prioridad && !icpBand) avisos.push(m('prioridad_desconocida', { valor: prioridad }));

  if (opciones.tipoCliente === 'company' && !nombreComercial && !razonSocial) avisos.push(m('empresa_sin_nombre'));

  if (errores.length > 0 || !nombre) return { fila: entrada.fila, datos: null, errores, avisos };

  const fuentes = (entrada.fuente ?? []).map(urlNormalizada).filter((u): u is string => !!u);
  const datos: FilaLeadNormalizada = {
    fila: entrada.fila,
    idExterno: textoLimpio(c.idExterno, 120),
    nombre,
    razonSocial,
    contacto,
    nit: nit?.numero ?? null,
    dv: nit?.dv ?? null,
    telefono,
    tipoTelefono: t('tipoTelefono'),
    correo,
    web,
    direccion: t('direccion'),
    barrio: t('barrio'),
    ciudad: t('ciudad'),
    departamento: t('departamento'),
    zona: t('zona'),
    sector: t('sector'),
    subsector: t('subsector'),
    prioridad,
    icpBand,
    plan: t('plan'),
    valor,
    verificacion: t('verificacion'),
    fechaVerificacion: t('fechaVerificacion'),
    fuentes: Array.from(new Set(fuentes)),
    horario: t('horario'),
    notas: textoLimpio(c.notas, 2000),
    etiquetas: listaEtiquetas(entrada.etiquetas ?? []),
    rneArchivo: t('rne'),
  };
  return { fila: entrada.fila, datos, errores, avisos };
}

/** Claves de deduplicación de una fila normalizada (por organización). */
export function clavesDedupe(d: Pick<FilaLeadNormalizada, 'telefono' | 'nit' | 'correo'>): string[] {
  const claves: string[] = [];
  if (d.telefono) claves.push(`tel:${d.telefono}`);
  if (d.nit) claves.push(`nit:${d.nit}`);
  if (d.correo) claves.push(`correo:${d.correo}`);
  return claves;
}

/**
 * Deduplicación dentro del archivo: devuelve, para cada fila repetida, la fila
 * anterior con la que comparte teléfono, NIT o correo. La primera aparición
 * gana (es la que se importa).
 */
export function duplicadosEnArchivo(filas: readonly FilaLeadValidada[]): Map<number, number> {
  const primera = new Map<string, number>();
  const duplicadas = new Map<number, number>();
  for (const f of filas) {
    if (!f.datos) continue;
    const claves = clavesDedupe(f.datos);
    const previa = claves.map((k) => primera.get(k)).find((n): n is number => n !== undefined);
    if (previa !== undefined) {
      duplicadas.set(f.fila, previa);
      continue;
    }
    for (const k of claves) primera.set(k, f.fila);
  }
  return duplicadas;
}
