'use client';

/**
 * Estado del asistente de importación (archivo y web comparten los pasos):
 *
 *   archivo: origen → mapeo      → validacion → vista → resultado
 *   web:     origen → seleccion  → validacion → vista → resultado
 *
 * Toda la lógica de negocio está en `src/lib/inventario/importacion/*` (pura,
 * con tests); aquí solo se orquesta: leer, validar contra el catálogo (ruta
 * del servidor) y enviar por lotes a la RPC.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { autoMapear, camposObligatoriosFaltantes, type Mapeo } from '@/lib/inventario/importacion/campos';
import { aplicarSaldos, detectarFormato, detectarVariantesPorSku, leerFilas, leerSaldos, parsearFormatoSistema, parsearFormatoSpace, type FormatoArchivo, type Matriz, type Saldo } from '@/lib/inventario/importacion/lector';
import { encontrarFilaCabecera } from '@/lib/inventario/importacion/campos';
import { validarFilas, resumirValidacion } from '@/lib/inventario/importacion/validacion';
import { dividirEnLotes, filasAImportar, TAMANO_LOTE } from '@/lib/inventario/importacion/payload';
import { productosWebAFilas, type ProductoWeb } from '@/lib/inventario/importacion/web';
import { OPCIONES_POR_DEFECTO, type FilaImport, type FilaValidada, type OpcionesImportacion, type ResultadoFila } from '@/lib/inventario/importacion/tipos';
import { enviarLote, pedirContexto, type ContextoServidor } from './apiImportacion';

export type Origen = 'archivo' | 'web';
export type Paso = 'origen' | 'mapeo' | 'seleccion' | 'validacion' | 'vista' | 'resultado';

export const PASOS_ARCHIVO: Paso[] = ['origen', 'mapeo', 'validacion', 'vista', 'resultado'];
export const PASOS_WEB: Paso[] = ['origen', 'seleccion', 'validacion', 'vista', 'resultado'];

/** Con imágenes que descargar, lotes más chicos para no rozar el límite de tiempo de la ruta. */
export const TAMANO_LOTE_CON_IMAGENES = 10;

export interface ArchivoLeido {
  nombre: string;
  matriz: Matriz;
  formato: FormatoArchivo;
  filaCabecera: number;
  mapeo: Mapeo;
}

export interface EstadoEjecucion {
  estado: 'corriendo' | 'terminado' | 'detenido';
  loteActual: number;
  totalLotes: number;
  procesadas: number;
  total: number;
  creados: number;
  actualizados: number;
  omitidos: number;
  fallidos: number;
  resultados: ResultadoFila[];
  erroresLote: { lote: number; mensaje: string; filas: number[] }[];
}

export function useAsistenteImportacion(orgId: number | undefined) {
  const [origen, setOrigen] = useState<Origen>('archivo');
  const [paso, setPaso] = useState<Paso>('origen');
  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null);
  const [saldos, setSaldos] = useState<{ nombre: string; datos: Map<string, Saldo> } | null>(null);
  const [web, setWeb] = useState<{ url: string; productos: ProductoWeb[]; seleccion: Set<number>; creditos: number; ia: boolean } | null>(null);
  const [ediciones, setEdiciones] = useState<Map<number, Partial<FilaImport>>>(new Map());
  const [opciones, setOpciones] = useState<OpcionesImportacion>(OPCIONES_POR_DEFECTO);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [contexto, setContexto] = useState<ContextoServidor | null>(null);
  const [cargandoContexto, setCargandoContexto] = useState(false);
  const [errorContexto, setErrorContexto] = useState<string | null>(null);
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [ejecucion, setEjecucion] = useState<EstadoEjecucion | null>(null);
  const detenerRef = useRef(false);

  /** Cambió lo leído: hay que volver a validar contra el catálogo. */
  const invalidarContexto = useCallback(() => {
    setContexto(null);
    setErrorContexto(null);
  }, []);

  const pasos = origen === 'web' ? PASOS_WEB : PASOS_ARCHIVO;

  // ── Filas crudas según el origen ────────────────────────────────────────
  const filasLeidas = useMemo<FilaImport[]>(() => {
    if (origen === 'web') {
      if (!web) return [];
      const elegidos = web.productos.filter((_, i) => web.seleccion.has(i));
      return productosWebAFilas(elegidos);
    }
    if (!archivo) return [];
    let filas: FilaImport[];
    if (archivo.formato === 'sistema') filas = parsearFormatoSistema(archivo.matriz, archivo.filaCabecera);
    else if (archivo.formato === 'space') filas = parsearFormatoSpace(archivo.matriz, archivo.filaCabecera);
    else if (archivo.filaCabecera < 0) filas = [];
    else {
      filas = leerFilas(archivo.matriz, archivo.filaCabecera, archivo.mapeo);
      detectarVariantesPorSku(filas);
    }
    aplicarSaldos(filas, saldos?.datos);
    return filas;
  }, [origen, web, archivo, saldos]);

  const variantesDetectadas = useMemo(() => filasLeidas.filter((f) => f.parentSku).length, [filasLeidas]);

  const filasBase = useMemo(() => (ediciones.size ? filasLeidas.map((f) => (ediciones.has(f.fila) ? { ...f, ...ediciones.get(f.fila) } : f)) : filasLeidas), [filasLeidas, ediciones]);

  const validadas = useMemo<FilaValidada[]>(() => {
    if (!contexto) return [];
    return validarFilas(filasBase, {
      existentes: new Map(Object.entries(contexto.existentes)),
      existentesPorNombre: origen === 'web' ? new Map(Object.entries(contexto.porNombre)) : undefined,
      categorias: new Set(contexto.categorias),
      impuestos: new Set(contexto.impuestos),
      opciones,
    });
  }, [filasBase, contexto, opciones, origen]);

  const resumen = useMemo(() => resumirValidacion(validadas, excluidas), [validadas, excluidas]);

  // ── Archivo ─────────────────────────────────────────────────────────────
  const cargarMatriz = useCallback((nombre: string, matriz: Matriz) => {
    const det = detectarFormato(matriz);
    const filaCabecera = det.formato === 'generico' ? encontrarFilaCabecera(matriz) : det.filaCabecera;
    const mapeo = det.formato === 'generico' && filaCabecera >= 0 ? autoMapear(matriz[filaCabecera] ?? []) : [];
    setArchivo({ nombre, matriz, formato: det.formato, filaCabecera, mapeo });
    setEdiciones(new Map());
    setExcluidas(new Set());
    invalidarContexto();
  }, [invalidarContexto]);

  const cargarSaldos = useCallback((nombre: string, matriz: Matriz): boolean => {
    const datos = leerSaldos(matriz);
    if (!datos) return false;
    setSaldos({ nombre, datos });
    invalidarContexto();
    return true;
  }, [invalidarContexto]);

  const cambiarMapeo = useCallback((mapeo: Mapeo) => {
    setArchivo((a) => (a ? { ...a, mapeo } : a));
    invalidarContexto();
  }, [invalidarContexto]);

  const cambiarFilaCabecera = useCallback((fila: number) => {
    setArchivo((a) => (a ? { ...a, filaCabecera: fila, mapeo: autoMapear(a.matriz[fila] ?? []) } : a));
    invalidarContexto();
  }, [invalidarContexto]);

  const faltantes = useMemo(() => (archivo && archivo.formato === 'generico' ? camposObligatoriosFaltantes(archivo.mapeo) : []), [archivo]);

  // ── Web ─────────────────────────────────────────────────────────────────
  const cargarWeb = useCallback((url: string, productos: ProductoWeb[], creditos: number, ia: boolean) => {
    setWeb({ url, productos, seleccion: new Set(productos.map((_, i) => i)), creditos, ia });
    setEdiciones(new Map());
    setExcluidas(new Set());
    invalidarContexto();
  }, [invalidarContexto]);

  const actualizarProductoWeb = useCallback((indice: number, cambios: Partial<ProductoWeb>) => {
    setWeb((w) => (w ? { ...w, productos: w.productos.map((p, i) => (i === indice ? { ...p, ...cambios } : p)) } : w));
    invalidarContexto();
  }, [invalidarContexto]);

  const alternarSeleccionWeb = useCallback((indice: number | 'todos') => {
    setWeb((w) => {
      if (!w) return w;
      if (indice === 'todos') return { ...w, seleccion: w.seleccion.size === w.productos.length ? new Set() : new Set(w.productos.map((_, i) => i)) };
      const s = new Set(w.seleccion);
      if (s.has(indice)) s.delete(indice);
      else s.add(indice);
      return { ...w, seleccion: s };
    });
    invalidarContexto();
  }, [invalidarContexto]);

  const sumarCreditosWeb = useCallback((n: number) => setWeb((w) => (w ? { ...w, creditos: w.creditos + n } : w)), []);

  // ── Validación contra el catálogo ───────────────────────────────────────
  const validarContraCatalogo = useCallback(async () => {
    setCargandoContexto(true);
    setErrorContexto(null);
    try {
      const skus = new Set<string>();
      for (const f of filasBase) {
        if (f.sku) skus.add(f.sku.trim());
        if (f.parentSku) skus.add(f.parentSku.trim());
      }
      const nombres = origen === 'web' ? filasBase.filter((f) => !f.parentSku && !f.isParent).map((f) => f.name ?? '') : [];
      setContexto(await pedirContexto(orgId, Array.from(skus), nombres));
      return true;
    } catch (e) {
      setErrorContexto(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setCargandoContexto(false);
    }
  }, [filasBase, orgId, origen]);

  const editarFila = useCallback((fila: number, cambios: Partial<FilaImport>) => {
    setEdiciones((prev) => {
      const m = new Map(prev);
      m.set(fila, { ...(m.get(fila) ?? {}), ...cambios });
      return m;
    });
  }, []);

  const alternarExclusion = useCallback((id: string) => {
    setExcluidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }, []);

  // ── Ejecución por lotes ─────────────────────────────────────────────────
  const importar = useCallback(async () => {
    if (!branchId) return;
    const filas = filasAImportar(validadas, excluidas, opciones);
    const conImagenes = opciones.importarImagenes && filas.some((f) => f.imagenes.length > 0 || f.imagenes_del_padre);
    const lotes = dividirEnLotes(filas, conImagenes ? TAMANO_LOTE_CON_IMAGENES : TAMANO_LOTE);
    detenerRef.current = false;
    const inicial: EstadoEjecucion = { estado: 'corriendo', loteActual: 0, totalLotes: lotes.length, procesadas: 0, total: filas.length, creados: 0, actualizados: 0, omitidos: 0, fallidos: 0, resultados: [], erroresLote: [] };
    setEjecucion(inicial);
    setPaso('resultado');
    let acumulado = inicial;
    for (let i = 0; i < lotes.length; i++) {
      if (detenerRef.current) {
        acumulado = { ...acumulado, estado: 'detenido' };
        setEjecucion(acumulado);
        return;
      }
      acumulado = { ...acumulado, loteActual: i + 1 };
      setEjecucion(acumulado);
      try {
        const r = await enviarLote(orgId, {
          modo: opciones.modo,
          branch_id: branchId,
          opciones: { stock_existentes: opciones.stockExistentes, importar_imagenes: opciones.importarImagenes, origen, fuente_url: origen === 'web' ? web?.url : undefined },
          filas: lotes[i],
        });
        acumulado = {
          ...acumulado,
          procesadas: acumulado.procesadas + lotes[i].length,
          creados: acumulado.creados + r.creados,
          actualizados: acumulado.actualizados + r.actualizados,
          omitidos: acumulado.omitidos + r.omitidos,
          fallidos: acumulado.fallidos + r.fallidos,
          resultados: [...acumulado.resultados, ...r.resultados],
        };
      } catch (e) {
        acumulado = {
          ...acumulado,
          procesadas: acumulado.procesadas + lotes[i].length,
          fallidos: acumulado.fallidos + lotes[i].length,
          erroresLote: [...acumulado.erroresLote, { lote: i + 1, mensaje: e instanceof Error ? e.message : String(e), filas: lotes[i].map((f) => f.fila) }],
          resultados: [...acumulado.resultados, ...lotes[i].map((f): ResultadoFila => ({ fila: f.fila, sku: f.sku, ok: false, error: 'LOTE' }))],
        };
      }
      setEjecucion(acumulado);
    }
    setEjecucion({ ...acumulado, estado: 'terminado' });
  }, [branchId, validadas, excluidas, opciones, orgId, origen, web?.url]);

  const detener = useCallback(() => {
    detenerRef.current = true;
  }, []);

  const reiniciar = useCallback(() => {
    setPaso('origen');
    setArchivo(null);
    setSaldos(null);
    setWeb(null);
    setEdiciones(new Map());
    setExcluidas(new Set());
    invalidarContexto();
    setEjecucion(null);
    setErrorContexto(null);
  }, [invalidarContexto]);

  const cambiarOrigen = useCallback(
    (o: Origen) => {
      setOrigen(o);
      setExcluidas(new Set());
      invalidarContexto();
    },
    [invalidarContexto],
  );

  return {
    origen,
    setOrigen: cambiarOrigen,
    paso,
    setPaso,
    pasos,
    archivo,
    cargarMatriz,
    cambiarMapeo,
    cambiarFilaCabecera,
    faltantes,
    saldos,
    cargarSaldos,
    quitarSaldos: () => setSaldos(null),
    web,
    cargarWeb,
    actualizarProductoWeb,
    alternarSeleccionWeb,
    sumarCreditosWeb,
    filasLeidas,
    variantesDetectadas,
    opciones,
    setOpciones: (o: Partial<OpcionesImportacion>) => setOpciones((prev) => ({ ...prev, ...o })),
    branchId,
    setBranchId,
    contexto,
    cargandoContexto,
    errorContexto,
    validarContraCatalogo,
    validadas,
    resumen,
    excluidas,
    alternarExclusion,
    excluirErrores: () => setExcluidas(new Set(validadas.filter((f) => f.estado === 'error').map((f) => f.id))),
    editarFila,
    ejecucion,
    importar,
    detener,
    reiniciar,
  };
}

export type AsistenteImportacion = ReturnType<typeof useAsistenteImportacion>;
