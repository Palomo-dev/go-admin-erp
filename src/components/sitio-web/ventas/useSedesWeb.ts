'use client';

/**
 * Hook ÚNICO de «Sedes en la web» (Figma B/11): lee `GET /api/sitio-web/sedes`,
 * lleva el borrador local (modo, interruptores, direcciones y fuentes de stock)
 * con su conteo de cambios para la SettingsSaveBar, y guarda en un lote con
 * `PUT /api/sitio-web/sedes`. El servidor valida y responde con lo guardado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { contarCambiosSedes, slugDesdeNombre, slugValido, type ModoSedes, type RespuestaSedesWeb, type SedeWebFila } from './sedesWeb';
import { ErrorApiVentas, pedirJson, type FalloVentas } from './useVentasSitio';

export const RUTA_API_SEDES = '/api/sitio-web/sedes';

export type ErrorSlug = 'invalido' | 'repetido' | 'requerido';

export interface SedesWebEstado {
  datos: RespuestaSedesWeb | null;
  cargando: boolean;
  fallo: FalloVentas | null;
  modo: ModoSedes;
  sedes: SedeWebFila[];
  cambios: number;
  guardando: boolean;
  erroresSlug: Record<number, ErrorSlug>;
  recargar: () => Promise<void>;
  cambiarModo: (m: ModoSedes) => void;
  publicar: (id: number, publicada: boolean) => void;
  cambiarSlug: (id: number, slug: string) => void;
  cambiarFuenteStock: (id: number, fuente: boolean) => void;
  descartar: () => void;
  guardar: () => Promise<void>;
}

/** Errores de dirección del borrador local (los mismos que valida el servidor). */
export function erroresDeSlugs(sedes: readonly SedeWebFila[]): Record<number, ErrorSlug> {
  const errores: Record<number, ErrorSlug> = {};
  const vistos = new Map<string, number>();
  for (const s of sedes) {
    const slug = s.slug?.trim() ?? '';
    if (slug === '') {
      if (s.publicada) errores[s.id] = 'requerido';
      continue;
    }
    if (!slugValido(slug)) errores[s.id] = 'invalido';
    else if (vistos.has(slug)) errores[s.id] = 'repetido';
    vistos.set(slug, s.id);
  }
  return errores;
}

export function useSedesWeb(): SedesWebEstado {
  const [datos, setDatos] = useState<RespuestaSedesWeb | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloVentas | null>(null);
  const [modo, setModo] = useState<ModoSedes>('selector');
  const [sedes, setSedes] = useState<SedeWebFila[]>([]);
  const [guardando, setGuardando] = useState(false);

  const aplicar = useCallback((r: RespuestaSedesWeb) => {
    setDatos(r);
    setModo(r.modo);
    setSedes(r.sedes);
  }, []);

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try {
      aplicar(await pedirJson<RespuestaSedesWeb>(RUTA_API_SEDES));
    } catch (error) {
      setDatos(null);
      setFallo(error instanceof ErrorApiVentas ? error.fallo : 'error');
    } finally {
      setCargando(false);
    }
  }, [aplicar]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const editar = (id: number, parche: Partial<SedeWebFila>) => setSedes((xs) => xs.map((s) => (s.id === id ? { ...s, ...parche } : s)));

  const publicar = useCallback((id: number, publicada: boolean) => {
    setSedes((xs) =>
      xs.map((s) => (s.id === id ? { ...s, publicada, slug: publicada && !s.slug ? s.slugSugerido || slugDesdeNombre(s.nombre) : s.slug } : s)),
    );
  }, []);

  const cambios = useMemo(() => (datos ? contarCambiosSedes(datos, modo, sedes) : 0), [datos, modo, sedes]);
  const erroresSlug = useMemo(() => erroresDeSlugs(sedes), [sedes]);

  const guardar = useCallback(async () => {
    if (!datos) return;
    setGuardando(true);
    try {
      const r = await pedirJson<RespuestaSedesWeb>(RUTA_API_SEDES, {
        method: 'PUT',
        cuerpo: {
          ...(modo !== datos.modo ? { modo } : {}),
          sedes: sedes.map((s) => ({ id: s.id, publicada: s.publicada, slug: s.slug?.trim() || null, fuenteStock: s.fuenteStock })),
        },
      });
      aplicar(r);
    } finally {
      setGuardando(false);
    }
  }, [aplicar, datos, modo, sedes]);

  return {
    datos,
    cargando,
    fallo,
    modo,
    sedes,
    cambios,
    guardando,
    erroresSlug,
    recargar,
    cambiarModo: setModo,
    publicar,
    cambiarSlug: (id, slug) => editar(id, { slug: slug.toLowerCase().replace(/\s+/g, '-') }),
    cambiarFuenteStock: (id, fuente) => editar(id, { fuenteStock: fuente }),
    descartar: () => datos && aplicar(datos),
    guardar,
  };
}
