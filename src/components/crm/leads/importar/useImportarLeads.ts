'use client';

/**
 * Estado del asistente «Importar leads»:
 *
 *   origen → mapeo → validacion → vista → resultado
 *
 * Sigue el patrón del importador de productos (`useAsistenteImportacion`). La
 * lógica de negocio vive en `src/lib/crm/importacionLeads/*` (pura, con tests)
 * y en el servidor (`POST /api/crm/leads/importar`): aquí solo se orquesta
 * leer, pedir la validación y enviar los bloques.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { LibroLeido, Matriz } from '@/lib/importacion/libro';
import { autoMapearLeads, cabeceraEnDolares, encontrarFilaCabeceraLeads, faltantesMapeoLead, type MapeoLead } from '@/lib/crm/importacionLeads/campos';
import { leerFilasLeads, TAMANO_BLOQUE_IMPORTAR } from '@/lib/crm/importacionLeads/validacion';
import type { OpcionesImportacionLeads, ResultadoFilaLead } from '@/lib/crm/importacionLeads/tipos';
import { importarBloqueLeads, validarLeads, type RespuestaValidacion } from './apiImportarLeads';

export type PasoLeads = 'origen' | 'mapeo' | 'validacion' | 'vista' | 'resultado';
export const PASOS_LEADS: PasoLeads[] = ['origen', 'mapeo', 'validacion', 'vista', 'resultado'];

export interface ArchivoLeads {
  nombre: string;
  libro: LibroLeido;
  hoja: string;
  matriz: Matriz;
  filaCabecera: number;
  mapeo: MapeoLead;
}

export interface EjecucionLeads {
  estado: 'corriendo' | 'terminado' | 'detenido';
  bloqueActual: number;
  totalBloques: number;
  procesadas: number;
  total: number;
  resultados: ResultadoFilaLead[];
  erroresBloque: { bloque: number; mensaje: string }[];
}

/** «tanda_01.xlsx» → «tanda_01». */
export function loteDesdeArchivo(nombre: string): string {
  return nombre.replace(/\.[^.]+$/, '').replace(/\s+/g, '_').slice(0, 60) || 'importacion';
}

/** La primera hoja cuya cabecera reconoce un nombre; si ninguna, la primera. */
function hojaPreferida(libro: LibroLeido): string {
  return libro.hojas.find((h) => encontrarFilaCabeceraLeads(libro.matriz(h)) >= 0) ?? libro.hojas[0] ?? '';
}

function monedaDeCabecera(matriz: Matriz, filaCabecera: number, mapeo: MapeoLead): string | null {
  const col = mapeo.indexOf('valor');
  return col >= 0 && cabeceraEnDolares(matriz[filaCabecera]?.[col]) ? 'USD' : null;
}

export function useImportarLeads(orgId: number | undefined) {
  const [paso, setPaso] = useState<PasoLeads>('origen');
  const [archivo, setArchivo] = useState<ArchivoLeads | null>(null);
  const [opciones, setOpcionesState] = useState<OpcionesImportacionLeads>({ lote: '', tipoCliente: 'company', monedaValor: null, pais: 'CO', archivo: null });
  const [validacion, setValidacion] = useState<RespuestaValidacion | null>(null);
  const [validando, setValidando] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());
  const [ejecucion, setEjecucion] = useState<EjecucionLeads | null>(null);
  const detenerRef = useRef(false);

  const invalidar = useCallback(() => {
    setValidacion(null);
    setErrorValidacion(null);
    setExcluidas(new Set());
  }, []);

  const prepararHoja = useCallback((nombre: string, libro: LibroLeido, hoja: string) => {
    const matriz = libro.matriz(hoja);
    const filaCabecera = encontrarFilaCabeceraLeads(matriz);
    const mapeo = filaCabecera >= 0 ? autoMapearLeads(matriz[filaCabecera] ?? []) : [];
    setArchivo({ nombre, libro, hoja, matriz, filaCabecera, mapeo });
    setOpcionesState((o) => ({ ...o, archivo: nombre, lote: o.lote || loteDesdeArchivo(nombre), monedaValor: monedaDeCabecera(matriz, filaCabecera, mapeo) }));
  }, []);

  const cargarLibro = useCallback(
    (nombre: string, libro: LibroLeido) => {
      setOpcionesState((o) => ({ ...o, lote: loteDesdeArchivo(nombre) }));
      prepararHoja(nombre, libro, hojaPreferida(libro));
      invalidar();
    },
    [prepararHoja, invalidar],
  );

  const elegirHoja = useCallback(
    (hoja: string) => {
      if (!archivo) return;
      prepararHoja(archivo.nombre, archivo.libro, hoja);
      invalidar();
    },
    [archivo, prepararHoja, invalidar],
  );

  const cambiarMapeo = useCallback(
    (mapeo: MapeoLead) => {
      setArchivo((a) => (a ? { ...a, mapeo } : a));
      invalidar();
    },
    [invalidar],
  );

  const cambiarFilaCabecera = useCallback(
    (fila: number) => {
      setArchivo((a) => (a ? { ...a, filaCabecera: fila, mapeo: autoMapearLeads(a.matriz[fila] ?? []) } : a));
      invalidar();
    },
    [invalidar],
  );

  const setOpciones = useCallback(
    (cambios: Partial<OpcionesImportacionLeads>) => {
      setOpcionesState((o) => ({ ...o, ...cambios }));
      invalidar();
    },
    [invalidar],
  );

  const filas = useMemo(() => (archivo && archivo.filaCabecera >= 0 ? leerFilasLeads(archivo.matriz, archivo.filaCabecera, archivo.mapeo) : []), [archivo]);
  const faltantes = useMemo(() => (archivo ? faltantesMapeoLead(archivo.mapeo) : []), [archivo]);

  const validar = useCallback(async () => {
    setValidando(true);
    setErrorValidacion(null);
    try {
      setValidacion(await validarLeads(orgId, filas, opciones));
      setExcluidas(new Set());
    } catch (e) {
      setErrorValidacion(e instanceof Error ? e.message : String(e));
    } finally {
      setValidando(false);
    }
  }, [orgId, filas, opciones]);

  /** Filas que se envían: las que el servidor crearía o ligaría y no se excluyeron a mano. */
  const aImportar = useMemo(() => {
    if (!validacion) return [];
    const importables = new Set(validacion.resultados.filter((r) => (r.accion === 'crear' || r.accion === 'ligar') && !excluidas.has(r.fila)).map((r) => r.fila));
    return filas.filter((f) => importables.has(f.fila));
  }, [validacion, excluidas, filas]);

  const alternarExclusion = useCallback((fila: number) => {
    setExcluidas((prev) => {
      const s = new Set(prev);
      if (s.has(fila)) s.delete(fila);
      else s.add(fila);
      return s;
    });
  }, []);

  const importar = useCallback(async () => {
    const bloques: (typeof aImportar)[] = [];
    for (let i = 0; i < aImportar.length; i += TAMANO_BLOQUE_IMPORTAR) bloques.push(aImportar.slice(i, i + TAMANO_BLOQUE_IMPORTAR));
    detenerRef.current = false;
    let acc: EjecucionLeads = { estado: 'corriendo', bloqueActual: 0, totalBloques: bloques.length, procesadas: 0, total: aImportar.length, resultados: [], erroresBloque: [] };
    setEjecucion(acc);
    setPaso('resultado');
    for (let i = 0; i < bloques.length; i++) {
      if (detenerRef.current) {
        setEjecucion({ ...acc, estado: 'detenido' });
        return;
      }
      acc = { ...acc, bloqueActual: i + 1 };
      setEjecucion(acc);
      try {
        const r = await importarBloqueLeads(orgId, bloques[i], opciones);
        acc = { ...acc, procesadas: acc.procesadas + bloques[i].length, resultados: [...acc.resultados, ...r.resultados] };
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : String(e);
        // Reintentar el mismo bloque es seguro (idempotente): el usuario puede volver a importar.
        acc = {
          ...acc,
          procesadas: acc.procesadas + bloques[i].length,
          erroresBloque: [...acc.erroresBloque, { bloque: i + 1, mensaje }],
          resultados: [
            ...acc.resultados,
            ...bloques[i].map((f): ResultadoFilaLead => ({ fila: f.fila, nombre: f.campos.nombre ?? f.campos.razonSocial ?? '', telefono: f.campos.telefono ?? null, accion: 'error', errores: [{ codigo: 'bloque', params: { detalle: mensaje } }], avisos: [] })),
          ],
        };
      }
      setEjecucion(acc);
    }
    setEjecucion({ ...acc, estado: 'terminado' });
  }, [aImportar, orgId, opciones]);

  const detener = useCallback(() => {
    detenerRef.current = true;
  }, []);

  const reiniciar = useCallback(() => {
    setPaso('origen');
    setArchivo(null);
    setEjecucion(null);
    setOpcionesState({ lote: '', tipoCliente: 'company', monedaValor: null, pais: 'CO', archivo: null });
    invalidar();
  }, [invalidar]);

  return {
    paso,
    setPaso,
    pasos: PASOS_LEADS,
    archivo,
    cargarLibro,
    elegirHoja,
    cambiarMapeo,
    cambiarFilaCabecera,
    filas,
    faltantes,
    opciones,
    setOpciones,
    validacion,
    validando,
    errorValidacion,
    validar,
    excluidas,
    alternarExclusion,
    aImportar,
    ejecucion,
    importar,
    detener,
    reiniciar,
  };
}

export type ImportarLeads = ReturnType<typeof useImportarLeads>;
