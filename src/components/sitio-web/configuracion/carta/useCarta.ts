'use client';

/**
 * Hooks ÚNICOS de la Carta del sitio (Figma B/13): la lista (`useCartas`), el
 * detalle de una carta (`useDetalleCarta`), las mesas de la Carta QR
 * (`useMesasQr`) y la vista previa «Ver como» (`useVistaPreviaCarta`). Todos
 * leen y escriben por `/api/sitio-web/carta/**`; ninguna pantalla consulta
 * Supabase desde el navegador ni calcula la vigencia: esa sale de la RPC
 * `get_public_menu` en el servidor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  copiarHorario,
  excepcionesDe,
  mover,
  type CategoriaCarta,
  type DetalleCarta,
  type GuardarCarta,
  type HorarioCarta,
  type IconoCarta,
  type RespuestaCartas,
  type RespuestaQr,
  type RespuestaVistaPrevia,
} from '@/lib/website/carta';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { sumarCambio, type CambioProducto, type FiltroCartaSede, type RespuestaListadoCartaSede } from '@/lib/services/website/cartaSede';
import { ErrorApiConfiguracion, RUTA_API_CARTA, falloDe, pedirApi, type FalloApi } from '../api';

// ---------------------------------------------------------------------------
// Escrituras (las comparten la lista y el detalle)
// ---------------------------------------------------------------------------

export type DatosNuevaCarta = { nombre: string; icono?: IconoCarta | null; duplicarDe?: string | null; todasLasCategorias?: boolean };

export const apiCarta = {
  crear: (d: DatosNuevaCarta) => pedirApi<{ id: string }>(RUTA_API_CARTA, { method: 'POST', body: d }).then((r) => r.id),
  eliminar: (id: string) => pedirApi(`${RUTA_API_CARTA}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  ordenar: (ids: string[]) => pedirApi(`${RUTA_API_CARTA}/orden`, { method: 'PATCH', body: { ids } }),
};

// ---------------------------------------------------------------------------
// Lista de cartas
// ---------------------------------------------------------------------------

export interface CartasSitio {
  datos: RespuestaCartas | null;
  cargando: boolean;
  fallo: FalloApi | null;
  ocupado: boolean;
  recargar: () => Promise<void>;
  crear: (datos: DatosNuevaCarta) => Promise<string | null>;
  eliminar: (id: string) => Promise<boolean>;
  /** Reordena en pantalla al instante y guarda; si falla, vuelve al orden anterior. */
  mover: (desde: number, hasta: number) => Promise<boolean>;
}

export function useCartas(): CartasSitio {
  const [datos, setDatos] = useState<RespuestaCartas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ref = useRef<RespuestaCartas | null>(null);
  ref.current = datos;

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try {
      setDatos(await pedirApi<RespuestaCartas>(RUTA_API_CARTA));
    } catch (error) {
      setDatos(null);
      setFallo(falloDe(error));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const crear = useCallback<CartasSitio['crear']>(
    async (d) => {
      setOcupado(true);
      try {
        const id = await apiCarta.crear(d);
        await recargar();
        return id;
      } catch {
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [recargar],
  );

  const eliminar = useCallback(
    async (id: string) => {
      setOcupado(true);
      try {
        await apiCarta.eliminar(id);
        await recargar();
        return true;
      } catch {
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [recargar],
  );

  const moverCarta = useCallback(async (desde: number, hasta: number) => {
    const antes = ref.current;
    if (!antes || !antes.disponible) return false;
    const cartas = mover(antes.cartas, desde, hasta);
    setDatos({ ...antes, cartas });
    try {
      await apiCarta.ordenar(cartas.map((c) => c.id));
      return true;
    } catch {
      setDatos(antes);
      return false;
    }
  }, []);

  return { datos, cargando, fallo, ocupado, recargar, crear, eliminar, mover: moverCarta };
}

// ---------------------------------------------------------------------------
// Detalle de una carta (un solo lote al guardar)
// ---------------------------------------------------------------------------

export interface BorradorCarta {
  nombre: string;
  horario: HorarioCarta;
  /** `null` = todas las sedes. */
  sedes: number[] | null;
  pdfUrl: string | null;
  categorias: CategoriaCarta[];
  /**
   * Pestaña «Por sede»: cambios sin guardar por sede y producto
   * (`website_branch_products`). Se guardan en el MISMO lote que el resto.
   */
  porSede?: Record<number, Record<number, CambioProducto>>;
}

function borradorDe(d: DetalleCarta): BorradorCarta {
  return {
    nombre: d.carta.nombre,
    horario: copiarHorario(d.carta.horario),
    sedes: d.carta.sedes ? [...d.carta.sedes] : null,
    pdfUrl: d.carta.pdfUrl,
    categorias: d.categorias.map((c) => ({ ...c, productos: c.productos.map((p) => ({ ...p })) })),
    porSede: {},
  };
}

/** Lotes de «Por sede» que van en el PUT (solo sedes con cambios). */
export function lotesPorSede(b: BorradorCarta): NonNullable<GuardarCarta['porSede']> {
  return Object.entries(b.porSede ?? {})
    .map(([sede, cambios]) => ({ branch_id: Number(sede), cambios: Object.values(cambios) as unknown as Record<string, unknown>[] }))
    .filter((l) => l.cambios.length > 0);
}

/** Productos con cambios en «Por sede», sumando todas las sedes. */
export function cambiosPorSede(b: BorradorCarta): number {
  return Object.values(b.porSede ?? {}).reduce((n, cambios) => n + Object.keys(cambios).length, 0);
}

/** Suma un cambio de «Por sede» al borrador (las reglas de fusión son las de Carta por sede). */
export function conCambioSede(b: BorradorCarta, sedeId: number, productoId: number, parche: Omit<CambioProducto, 'product_id'>): BorradorCarta {
  const sede = { ...(b.porSede?.[sedeId] ?? {}) };
  sede[productoId] = sumarCambio(sede[productoId], productoId, parche);
  return { ...b, porSede: { ...(b.porSede ?? {}), [sedeId]: sede } };
}

/** Lote para `PUT /api/sitio-web/carta/[menuId]` con solo lo que cambió. */
export function loteDe(original: BorradorCarta, actual: BorradorCarta): GuardarCarta {
  const lote: GuardarCarta = {};
  const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (original.nombre !== actual.nombre) lote.nombre = actual.nombre.trim();
  if (!igual(original.horario, actual.horario)) lote.horario = actual.horario as GuardarCarta['horario'];
  if (!igual(original.sedes, actual.sedes)) lote.sedes = actual.sedes;
  if (original.pdfUrl !== actual.pdfUrl) lote.pdfUrl = actual.pdfUrl;
  const ids = (b: BorradorCarta) => b.categorias.map((c) => c.id);
  if (!igual(ids(original), ids(actual))) lote.categorias = ids(actual);
  if (!igual(excepcionesDe(original.categorias), excepcionesDe(actual.categorias))) lote.excepciones = excepcionesDe(actual.categorias);
  const porSede = lotesPorSede(actual);
  if (porSede.length > 0) lote.porSede = porSede;
  return lote;
}

/** Cambios para la SettingsSaveBar: uno por bloque que cambió (nombre, horario, sedes, PDF, categorías, productos). */
export function contarCambiosCarta(original: BorradorCarta, actual: BorradorCarta): number {
  const lote = loteDe(original, actual);
  let n = Object.keys(lote).filter((k) => k !== 'excepciones' && k !== 'porSede').length + cambiosPorSede(actual);
  if (lote.excepciones) {
    const antes = new Map(excepcionesDe(original.categorias)?.map((e) => [e.productoId, JSON.stringify(e)]));
    n += (lote.excepciones ?? []).filter((e) => antes.get(e.productoId) !== JSON.stringify(e)).length || 1;
  }
  return n;
}

export interface DetalleCartaEstado {
  datos: DetalleCarta | null;
  cargando: boolean;
  fallo: FalloApi | null;
  borrador: BorradorCarta | null;
  cambios: number;
  guardando: boolean;
  errorGuardado: FalloApi | null;
  subiendoPdf: boolean;
  recargar: () => Promise<void>;
  editar: (cambiar: (b: BorradorCarta) => BorradorCarta) => void;
  descartar: () => void;
  guardar: () => Promise<boolean>;
  subirPdf: (archivo: File) => Promise<boolean>;
}

export function useDetalleCarta(menuId: string): DetalleCartaEstado {
  const [datos, setDatos] = useState<DetalleCarta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [original, setOriginal] = useState<BorradorCarta | null>(null);
  const [borrador, setBorrador] = useState<BorradorCarta | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<FalloApi | null>(null);
  const [subiendoPdf, setSubiendoPdf] = useState(false);
  const ruta = `${RUTA_API_CARTA}/${encodeURIComponent(menuId)}`;

  const aplicar = useCallback((d: DetalleCarta) => {
    setDatos(d);
    setOriginal(borradorDe(d));
    setBorrador(borradorDe(d));
  }, []);

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    setErrorGuardado(null);
    try {
      aplicar(await pedirApi<DetalleCarta>(ruta));
    } catch (error) {
      setDatos(null);
      setFallo(falloDe(error));
    } finally {
      setCargando(false);
    }
  }, [ruta, aplicar]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const cambios = useMemo(() => (original && borrador ? contarCambiosCarta(original, borrador) : 0), [original, borrador]);

  const guardar = useCallback(async () => {
    if (!original || !borrador) return false;
    const lote = loteDe(original, borrador);
    if (Object.keys(lote).length === 0) return true;
    setGuardando(true);
    setErrorGuardado(null);
    try {
      aplicar(await pedirApi<DetalleCarta>(ruta, { method: 'PUT', body: lote }));
      return true;
    } catch (error) {
      setErrorGuardado(error instanceof ErrorApiConfiguracion ? error.fallo : 'error');
      return false;
    } finally {
      setGuardando(false);
    }
  }, [original, borrador, ruta, aplicar]);

  const subirPdf = useCallback(async (archivo: File) => {
    setSubiendoPdf(true);
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      const org = getOrganizationId();
      const r = await fetch(`${RUTA_API_CARTA}/pdf`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
      });
      if (!r.ok) return false;
      const { url } = (await r.json()) as { url: string };
      setBorrador((b) => (b ? { ...b, pdfUrl: url } : b));
      return true;
    } catch {
      return false;
    } finally {
      setSubiendoPdf(false);
    }
  }, []);

  return {
    datos,
    cargando,
    fallo,
    borrador,
    cambios,
    guardando,
    errorGuardado,
    subiendoPdf,
    recargar,
    editar: (cambiar) => setBorrador((b) => (b ? cambiar(b) : b)),
    descartar: () => {
      setBorrador(original);
      setErrorGuardado(null);
    },
    guardar,
    subirPdf,
  };
}

// ---------------------------------------------------------------------------
// «Por sede» del detalle: listado de la sede (servicio único de Carta por sede)
// ---------------------------------------------------------------------------

const RUTA_API_CARTA_SEDE = '/api/website/carta-sede';

export interface FiltrosCartaSede {
  sedeId: number | null;
  categoriaId: number | null;
  busqueda: string;
  filtro: FiltroCartaSede;
  pagina: number;
  /** Cambia tras guardar el detalle para volver a leer los ajustes guardados. */
  recarga: unknown;
}

/** Productos de una categoría de la carta en una sede, con su ajuste y precio vigente. */
export function useListadoCartaSede({ sedeId, categoriaId, busqueda, filtro, pagina, recarga }: FiltrosCartaSede) {
  const [datos, setDatos] = useState<RespuestaListadoCartaSede | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!sedeId || !categoriaId) {
      setDatos(null);
      return;
    }
    let cancelado = false;
    const q = new URLSearchParams({ branch_id: String(sedeId), category_id: String(categoriaId), filtro, pagina: String(pagina) });
    if (busqueda.trim()) q.set('q', busqueda.trim());
    setCargando(true);
    setFallo(null);
    pedirApi<RespuestaListadoCartaSede>(`${RUTA_API_CARTA_SEDE}?${q.toString()}`)
      .then((r) => !cancelado && setDatos(r))
      .catch((e) => !cancelado && setFallo(falloDe(e)))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [sedeId, categoriaId, busqueda, filtro, pagina, recarga, intento]);

  return { datos, cargando, fallo, reintentar: () => setIntento((n) => n + 1) };
}

// ---------------------------------------------------------------------------
// Carta QR y vista previa
// ---------------------------------------------------------------------------

export function useMesasQr(sedeId: number | null) {
  const [datos, setDatos] = useState<RespuestaQr | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloApi | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try {
      setDatos(await pedirApi<RespuestaQr>(`${RUTA_API_CARTA}/qr${sedeId ? `?branch_id=${sedeId}` : ''}`));
    } catch (error) {
      setDatos(null);
      setFallo(falloDe(error));
    } finally {
      setCargando(false);
    }
  }, [sedeId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { datos, cargando, fallo, recargar };
}

export function useVistaPreviaCarta(params: { sedeId: number | null; fecha: string | null; hora: string | null }) {
  const [datos, setDatos] = useState<RespuestaVistaPrevia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const { sedeId, fecha, hora } = params;

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    const q = new URLSearchParams();
    if (sedeId) q.set('branch_id', String(sedeId));
    if (fecha) q.set('fecha', fecha);
    if (hora) q.set('hora', hora);
    try {
      setDatos(await pedirApi<RespuestaVistaPrevia>(`${RUTA_API_CARTA}/vista-previa?${q.toString()}`));
    } catch (error) {
      setDatos(null);
      setFallo(falloDe(error));
    } finally {
      setCargando(false);
    }
  }, [sedeId, fecha, hora]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { datos, cargando, fallo, recargar };
}
