/**
 * Validación por fila ANTES de importar (antes el importador validaba al
 * final y abortaba todo con un toast que citaba una sola fila).
 *
 * Cada fila sale con:
 *   - `estado`: listo · aviso · error (los errores no se importan);
 *   - `accion`: crear · actualizar · omitir, según el modo y lo que ya existe;
 *   - mensajes como código + parámetros (la UI los traduce).
 *
 * La decisión definitiva la vuelve a tomar la RPC con la base real (el
 * catálogo pudo cambiar entre la vista previa y el «Importar»); esto es lo que
 * el usuario ve y corrige.
 */

import { normalizarNombre } from './texto';
import { estacionDesdeTexto, estadoDesdeTexto, parsearModificadores, parsearVariante, separarUrls, unidadDesdeTexto } from './normalizacion';
import type { AccionFila, EstadoFila, FilaImport, FilaValidada, Mensaje, OpcionesImportacion } from './tipos';
import { crearGeneradorSku } from './lector';

export const MAX_NOMBRE = 200;

/** Mensajes que se muestran pero no convierten la fila en «Aviso» (son lo esperado en ese formato). */
export const AVISOS_INFORMATIVOS = new Set<string>(['skuGenerado', 'promoEnNotas']);

export interface ContextoValidacion {
  /** SKU existente (en mayúsculas) → id. */
  existentes: Map<string, number>;
  /**
   * Nombre normalizado → producto existente. Solo lo usa la importación web
   * (los productos de una tienda no traen nuestro SKU): una fila sin variantes
   * con el mismo nombre que un producto del catálogo se trata como ese producto.
   */
  existentesPorNombre?: Map<string, { id: number; sku: string }>;
  /** Nombres normalizados de categorías existentes (para avisar las nuevas). */
  categorias?: Set<string>;
  /** Nombres normalizados de impuestos de la organización (y sus tasas «19»). */
  impuestos?: Set<string>;
  opciones: OpcionesImportacion;
}

const claveSku = (s: string) => s.trim().toUpperCase();

/** `SKU-2`, `SKU-3`… el primero libre (y lo reserva). */
export function skuLibre(sku: string, ocupados: Set<string>): string {
  let n = 2;
  while (ocupados.has(claveSku(`${sku}-${n}`))) n++;
  const libre = `${sku}-${n}`;
  ocupados.add(claveSku(libre));
  return libre;
}

/** ¿El impuesto de la fila existe? Acepta el nombre («IVA 19%») o la tasa («19»). */
export function impuestoConocido(texto: string, impuestos: Set<string>): boolean {
  const n = normalizarNombre(texto);
  if (impuestos.has(n)) return true;
  const tasa = texto.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.');
  return !!tasa && impuestos.has(`tasa:${Number(tasa)}`);
}

export function validarFilas(filas: FilaImport[], ctx: ContextoValidacion): FilaValidada[] {
  const { opciones } = ctx;
  const ocupados = new Set<string>([...ctx.existentes.keys(), ...filas.map((f) => f.sku ?? '').filter(Boolean).map(claveSku)]);
  const generarSku = crearGeneradorSku('IMP', ocupados);
  const primeraFilaPorSku = new Map<string, number>();
  const skusArchivo = new Set(filas.map((f) => f.sku).filter((s): s is string => !!s).map(claveSku));

  return filas.map((original) => {
    const f: FilaImport = { ...original };
    const errores: Mensaje[] = [];
    const avisos: Mensaje[] = [...(f.avisosLectura ?? [])];

    // ── Nombre y SKU ────────────────────────────────────────────────────
    const nombre = f.name?.trim();
    if (!nombre) errores.push({ codigo: 'sinNombre' });
    else if (nombre.length > MAX_NOMBRE) errores.push({ codigo: 'nombreMuyLargo', params: { max: MAX_NOMBRE } });

    let productoId: number | undefined;
    let coincidePorNombre = false;
    if (!f.sku?.trim() && ctx.existentesPorNombre && nombre && !f.isParent && !f.parentSku) {
      const porNombre = ctx.existentesPorNombre.get(normalizarNombre(nombre));
      if (porNombre) {
        f.sku = porNombre.sku;
        coincidePorNombre = true;
      }
    }
    if (!f.sku?.trim()) {
      if (opciones.generarSku && nombre) {
        f.sku = generarSku(nombre, f.fila);
        f.skuGenerado = true;
        if (!avisos.some((a) => a.codigo === 'skuGenerado')) avisos.push({ codigo: 'skuGenerado' });
      } else {
        errores.push({ codigo: 'sinSku' });
      }
    }
    const sku = f.sku?.trim() ?? '';
    if (sku) {
      const k = claveSku(sku);
      const previa = primeraFilaPorSku.get(k);
      if (previa !== undefined) errores.push({ codigo: 'skuDuplicadoArchivo', params: { fila: previa } });
      else primeraFilaPorSku.set(k, f.fila);
      productoId = ctx.existentes.get(k);
    }
    if (coincidePorNombre && productoId) avisos.push({ codigo: 'coincidePorNombre', params: { sku } });

    // ── Números ─────────────────────────────────────────────────────────
    if (f.price !== undefined && f.price < 0) errores.push({ codigo: 'precioInvalido' });
    if (f.cost !== undefined && f.cost < 0) errores.push({ codigo: 'costoInvalido' });
    if (f.stock !== undefined && f.stock < 0) errores.push({ codigo: 'stockInvalido' });
    if (f.price && f.cost && f.cost > f.price && !avisos.some((a) => a.codigo === 'costoPrecioIntercambiados')) {
      avisos.push({ codigo: 'costoMayorPrecio' });
    }
    if (f.comparePrice && f.price && f.comparePrice <= f.price) avisos.push({ codigo: 'comparacionMenorPrecio' });

    // ── Acción según el modo ────────────────────────────────────────────
    let accion: AccionFila = productoId ? 'actualizar' : 'crear';
    if (productoId && opciones.modo === 'solo_crear') {
      accion = 'omitir';
      avisos.push({ codigo: 'existeOmitido' });
    } else if (!productoId && opciones.modo === 'solo_actualizar') {
      accion = 'omitir';
      avisos.push({ codigo: 'noExisteOmitido' });
    } else if (productoId && opciones.modo === 'duplicar') {
      accion = 'crear';
      const nuevo = skuLibre(sku, ocupados);
      avisos.push({ codigo: 'skuRenombrado', params: { sku: nuevo } });
      f.sku = nuevo;
      productoId = undefined;
    }

    // ── Stock ───────────────────────────────────────────────────────────
    const tipoServicio = /serv/i.test(f.type ?? '');
    const rastrea = f.trackStock ?? !tipoServicio;
    const entraStock = rastrea && (f.stock ?? 0) > 0 && (accion === 'crear' || opciones.stockExistentes === 'sumar');
    // En «sumar» sobre un existente, el costo puede salir del vigente en la base (lo resuelve la RPC).
    if (entraStock && accion === 'crear' && !(f.cost && f.cost > 0)) errores.push({ codigo: 'stockSinCosto' });
    if (accion === 'actualizar' && (f.stock ?? 0) > 0 && opciones.stockExistentes === 'ignorar') avisos.push({ codigo: 'stockIgnoradoExistente' });

    // ── Variantes ───────────────────────────────────────────────────────
    if (f.parentSku) {
      const k = claveSku(f.parentSku);
      if (!skusArchivo.has(k) && !ctx.existentes.has(k)) errores.push({ codigo: 'padreNoEncontrado', params: { sku: f.parentSku } });
    }
    if (f.variantData && parsearVariante(f.variantData) === null) avisos.push({ codigo: 'variantesSinFormato' });

    // ── Campos con catálogo cerrado ─────────────────────────────────────
    if (f.unit && !unidadDesdeTexto(f.unit).reconocida) avisos.push({ codigo: 'unidadDesconocida', params: { unidad: f.unit } });
    if (f.station && estacionDesdeTexto(f.station).desconocida) avisos.push({ codigo: 'estacionDesconocida', params: { estacion: f.station } });
    if (f.status && estadoDesdeTexto(f.status).desconocido) avisos.push({ codigo: 'estadoDesconocido', params: { estado: f.status } });
    if (f.tax && ctx.impuestos && !impuestoConocido(f.tax, ctx.impuestos)) avisos.push({ codigo: 'impuestoNoEncontrado', params: { impuesto: f.tax } });
    if (f.category && ctx.categorias && !ctx.categorias.has(normalizarNombre(f.category))) avisos.push({ codigo: 'categoriaNueva', params: { categoria: f.category } });
    if (f.modifiers && parsearModificadores(f.modifiers).length === 0) avisos.push({ codigo: 'modificadoresSinFormato' });
    if (f.imageUrls && opciones.importarImagenes) {
      const { invalidas } = separarUrls(f.imageUrls);
      if (invalidas.length > 0) avisos.push({ codigo: 'urlImagenInvalida', params: { cantidad: invalidas.length } });
    }

    const avisosReales = avisos.filter((a) => !AVISOS_INFORMATIVOS.has(a.codigo));
    const estado: EstadoFila = errores.length > 0 ? 'error' : avisosReales.length > 0 || accion === 'omitir' ? 'aviso' : 'listo';
    return { id: String(original.fila), datos: f, estado, accion, errores, avisos, productoId };
  });
}

export interface ResumenValidacion {
  total: number;
  listos: number;
  avisos: number;
  errores: number;
  crear: number;
  actualizar: number;
  omitir: number;
  /** Filas que se enviarán (sin error y sin «omitir»). */
  aImportar: number;
}

export function resumirValidacion(filas: FilaValidada[], excluidas: Set<string> = new Set()): ResumenValidacion {
  const r: ResumenValidacion = { total: filas.length, listos: 0, avisos: 0, errores: 0, crear: 0, actualizar: 0, omitir: 0, aImportar: 0 };
  for (const f of filas) {
    if (f.estado === 'listo') r.listos++;
    else if (f.estado === 'aviso') r.avisos++;
    else r.errores++;
    if (f.estado !== 'error' && !excluidas.has(f.id)) {
      r[f.accion]++;
      if (f.accion !== 'omitir') r.aImportar++;
    }
  }
  return r;
}

/** Aplica una edición en línea sobre los datos crudos (luego se vuelve a validar todo). */
export function editarFila(filas: FilaImport[], fila: number, cambios: Partial<FilaImport>): FilaImport[] {
  return filas.map((f) => (f.fila === fila ? { ...f, ...cambios } : f));
}
