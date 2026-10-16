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
  fechaDeCelda,
  listaEtiquetas,
  listaUnica,
  nitNormalizado,
  telefonoE164,
  telefonosDistintos,
  telefonosEnTexto,
  textoLimpio,
  urlNormalizada,
  valorNumerico,
} from './normalizacion';
import type { FilaLeadEntrada, FilaLeadNormalizada, FilaLeadValidada, MensajeImportacion, OpcionesImportacionLeads, ResultadoFilaLead, ResumenImportacionLeads } from './tipos';

/** Límite por archivo (configurable en el servidor con `LEADS_IMPORT_MAX_FILAS`, nunca por encima de este tope). */
export const MAX_FILAS_POR_ARCHIVO = 10_000;
/** Filas por petición de `validar`. El archivo cabe entero; cada petición se queda en el tamaño que ya aguantaba la vista previa. */
export const TAMANO_BLOQUE_VALIDAR = 1000;
/** Filas por petición de `importar` (cada alta son ~10 consultas; el asistente manda bloques). */
export const TAMANO_BLOQUE_IMPORTAR = 25;
/** Máximo que acepta el servidor por petición de `importar`. */
export const MAX_FILAS_POR_BLOQUE = 50;

/** Encabezado con el que se guarda un «Dato adicional» (único por fila: un repetido lleva « (2)»). */
export function nombresColumnas(cabeceras: readonly unknown[], ancho: number): string[] {
  const usados = new Map<string, number>();
  return Array.from({ length: ancho }, (_, col) => {
    const base = textoLimpio(cabeceras[col], 120) ?? `Columna ${col + 1}`;
    const n = (usados.get(base.toLowerCase()) ?? 0) + 1;
    usados.set(base.toLowerCase(), n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Filas del archivo (tras la cabecera) con el mapeo aplicado. Las filas vacías se saltan. */
export function leerFilasLeads(matriz: unknown[][], filaCabecera: number, mapeo: MapeoLead): FilaLeadEntrada[] {
  const filas: FilaLeadEntrada[] = [];
  const columnas = nombresColumnas(matriz[filaCabecera] ?? [], mapeo.length);
  for (let i = filaCabecera + 1; i < matriz.length; i++) {
    const celdas = matriz[i];
    if (filaVacia(celdas)) continue;
    const f: FilaLeadEntrada = { fila: i + 1, campos: {} };
    mapeo.forEach((campo, col) => {
      if (!campo) return;
      const v = textoLimpio(celdas[col], campo === 'notas' || campo === 'adicional' ? 2000 : undefined);
      if (!v) return;
      if (CAMPOS_MULTIPLES.has(campo)) {
        if (campo === 'adicional') (f.adicionales ??= []).push({ columna: columnas[col], valor: v });
        else if (campo === 'fuente') (f.fuente ??= []).push(v);
        else if (campo === 'etiquetas') (f.etiquetas ??= []).push(v);
        else if (campo === 'telefonoAdicional') (f.telefonosAdicionales ??= []).push(v);
        else (f.correosAdicionales ??= []).push(v);
      } else if (!f.campos[campo as CampoSimple]) {
        f.campos[campo as CampoSimple] = v;
      } else {
        // Dos columnas para el mismo campo simple (no pasa con el autodetector,
        // pero sí con un mapeo heredado): la segunda se guarda como adicional.
        (f.adicionales ??= []).push({ columna: columnas[col], valor: v });
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

  const pais = opciones.pais || 'CO';
  const telefonoCrudo = t('telefono');
  // Una celda puede traer varios «+57 …». El primero válido es el principal.
  const embebidosPrincipal = telefonosEnTexto(telefonoCrudo, pais);
  const telefono = telefonoE164(telefonoCrudo, pais) ?? embebidosPrincipal[0] ?? null;
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

  // Nada de lo que trae la fila se tira: lo que no se normaliza se guarda crudo.
  const descartados: FilaLeadNormalizada['descartados'] = {};
  if (telefonoCrudo && !telefono) descartados.telefono = telefonoCrudo;
  if (correoCrudo && !correo) descartados.correo = correoCrudo;
  if (nitCrudo && !nit) descartados.nit = nitCrudo;
  if (webCruda && !web) descartados.web = webCruda;
  if (valorCrudo && valor === null) descartados.valor = valorCrudo;

  const fuentes: string[] = [];
  const fuentesTexto: string[] = [];
  for (const crudo of entrada.fuente ?? []) {
    const u = urlNormalizada(crudo);
    if (u) fuentes.push(u);
    else if (textoLimpio(crudo)) fuentesTexto.push(textoLimpio(crudo) as string);
  }
  // Teléfonos/correos adicionales: normalizados si se puede; si no, tal cual.
  // Los que solo vienen escritos en las notas («otros teléfonos: +57 …») también
  // entran: antes se quedaban en el texto y la ficha mostraba un solo número.
  const desdeCeldas = (entrada.telefonosAdicionales ?? []).flatMap((x) => {
    const varios = telefonosEnTexto(x, pais);
    if (varios.length > 1) return varios;
    return [telefonoE164(x, pais) ?? x];
  });
  const telefonosAdicionales = telefonosDistintos(telefono, [desdeCeldas, telefonosEnTexto(c.notas, pais), embebidosPrincipal], pais);
  const correosAdicionales = listaUnica((entrada.correosAdicionales ?? []).map((x) => correoNormalizado(x) ?? x)).filter((x) => x !== correo);

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
    fechaVerificacion: fechaDeCelda(c.fechaVerificacion),
    fuentes: Array.from(new Set(fuentes)),
    horario: t('horario'),
    notas: textoLimpio(c.notas, 2000),
    etiquetas: listaEtiquetas(entrada.etiquetas ?? []),
    rneArchivo: t('rne'),
    pais: t('pais'),
    cargo: t('cargo'),
    etapa: t('etapa'),
    fecha: fechaDeCelda(c.fecha),
    telefonosAdicionales,
    correosAdicionales,
    fuentesTexto: listaUnica(fuentesTexto),
    adicionales: (entrada.adicionales ?? [])
      .map((a) => ({ columna: textoLimpio(a.columna, 120) ?? '', valor: textoLimpio(a.valor, 2000) ?? '' }))
      .filter((a) => a.columna && a.valor),
    descartados,
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

/** Cuenta acciones de la vista previa. Un `rne_excluido` en avisos cuenta como excluido; el resto de las que se escribirían, pendiente. */
export function resumirResultados(resultados: readonly ResultadoFilaLead[]): ResumenImportacionLeads {
  const r: ResumenImportacionLeads = { total: resultados.length, crear: 0, ligar: 0, omitir: 0, error: 0, rnePendiente: 0, rneExcluido: 0 };
  for (const x of resultados) {
    r[x.accion] += 1;
    if (x.accion === 'crear' || x.accion === 'ligar') {
      if (x.avisos.some((a) => a.codigo === 'rne_excluido')) r.rneExcluido += 1;
      else r.rnePendiente += 1;
    }
  }
  return r;
}

/**
 * Junta la vista previa pedida por bloques. La deduplicación del archivo es
 * del archivo entero: una repetición que cayó en otro bloque se omite aquí,
 * igual que si el servidor hubiera visto todas las filas juntas.
 */
export function unirValidacion(
  filas: readonly FilaLeadEntrada[],
  resultados: readonly ResultadoFilaLead[],
  opciones: Pick<OpcionesImportacionLeads, 'pais' | 'tipoCliente'>,
): { resultados: ResultadoFilaLead[]; resumen: ResumenImportacionLeads } {
  const dups = duplicadosEnArchivo(filas.map((f) => validarFilaLead(f, opciones)));
  const corregidos = resultados.map((r) => {
    const previa = dups.get(r.fila);
    if (previa === undefined || r.accion === 'error') return r;
    if (r.motivo === 'duplicado_archivo' && r.duplicadaDe === previa) return r;
    const copia: ResultadoFilaLead = { ...r, accion: 'omitir', motivo: 'duplicado_archivo', duplicadaDe: previa };
    delete copia.cliente;
    return copia;
  });
  return { resultados: corregidos, resumen: resumirResultados(corregidos) };
}
