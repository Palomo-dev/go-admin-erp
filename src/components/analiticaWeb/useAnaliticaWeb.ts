'use client';

/**
 * Estado ÚNICO de la analítica web (Figma B/09-01, E-analitica): periodo,
 * sucursal, país elegido y las dos lecturas del servidor —
 * `GET /api/analitica-web` (KPIs, embudo, serie, geografía; RPC
 * `fn_analitica_web`) y `GET /api/sitio-web/analitica/trafico` (fuentes,
 * páginas y conversión; RPC `fn_analitica_web_trafico`)—, con el mismo periodo
 * y la misma regla de acceso. La pantalla y su cabecera lo consumen; nadie más
 * consulta estas rutas.
 *
 * - «Hoy» en la zona de la sucursal activa o, si no tiene, de la organización
 *   (`useFormatDate().getToday()`).
 * - Sucursal: la del header. Las visitas son de la tienda; los pedidos y la
 *   venta media respetan la sucursal.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RangoFechas } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { rangoDePeriodo, csvAnalitica, type DatosAnalitica, type PeriodoAnalitica } from '@/lib/analiticaWeb/analiticaWeb';
import { debeAbrirColombia } from '@/lib/analiticaWeb/mapa';
import type { TraficoAnalitica } from '@/lib/analiticaWeb/trafico';

export type EstadoAnalitica =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'sinPermiso' }
  | { tipo: 'listo'; datos: DatosAnalitica; puedeExportar: boolean };

export interface TraficoEstado {
  cargando: boolean;
  /** `false` si la base aún no tiene la función (migración pendiente) o falló. */
  disponible: boolean;
  datos: TraficoAnalitica | null;
  /** «Conversión a reserva»: misma visibilidad que «Carta» (lo decide el servidor). */
  conReservas: boolean;
}

export interface EncabezadosCsv {
  fecha: string;
  visitantes: string;
  pedidos: string;
  visitantesAnterior: string;
  pedidosAnterior: string;
  pais: string;
  sesiones: string;
}

export interface AnaliticaWebEstado {
  periodo: PeriodoAnalitica;
  setPeriodo: (p: PeriodoAnalitica) => void;
  rangoCustom: RangoFechas | null;
  setRangoCustom: (r: RangoFechas) => void;
  rango: { desde: string; hasta: string };
  hoy: string;
  estado: EstadoAnalitica;
  cargandoPais: boolean;
  elegirPais: (pais: string | null) => void;
  trafico: TraficoEstado;
  sucursal: number | null;
  nombreSucursal: string | undefined;
  numSucursales: number;
  /** Recarga todo (KPIs y tráfico). */
  actualizar: () => void;
  exportar: (encabezados: EncabezadosCsv) => void;
  /** Hay datos y no hay ninguna visita ni pedido en el periodo. */
  vacio: boolean;
}

export const RUTA_API_ANALITICA = '/api/analitica-web';
export const RUTA_API_TRAFICO = '/api/sitio-web/analitica/trafico';

export function useAnaliticaWeb(): AnaliticaWebEstado {
  const { getToday } = useFormatDate();
  const sucursalCtx = useBranchOpcional();
  const [periodo, setPeriodo] = useState<PeriodoAnalitica>('30d');
  const [rangoCustom, setRangoCustom] = useState<RangoFechas | null>(null);
  const [pais, setPais] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoAnalitica>({ tipo: 'cargando' });
  const [cargandoPais, setCargandoPais] = useState(false);
  const [trafico, setTrafico] = useState<TraficoEstado>({ cargando: true, disponible: true, datos: null, conReservas: false });
  const pedido = useRef(0);
  const pedidoTrafico = useRef(0);

  const hoy = getToday();
  const sucursal = sucursalCtx?.branchFilter ?? null;
  const rango = useMemo(
    () => (periodo === 'personalizado' && rangoCustom ? rangoCustom : rangoDePeriodo(periodo === 'personalizado' ? '30d' : periodo, hoy)),
    [periodo, rangoCustom, hoy],
  );

  const cargar = useCallback(
    async (opciones?: { soloPais?: boolean }) => {
      const id = ++pedido.current;
      if (opciones?.soloPais) setCargandoPais(true);
      else setEstado({ tipo: 'cargando' });
      const qs = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
      if (sucursal !== null) qs.set('sucursal', String(sucursal));
      if (pais) qs.set('pais', pais);
      try {
        const res = await fetch(`${RUTA_API_ANALITICA}?${qs.toString()}`, { cache: 'no-store' });
        if (id !== pedido.current) return;
        if (res.status === 403) {
          setEstado({ tipo: 'sinPermiso' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { datos: DatosAnalitica; puedeExportar: boolean };
        if (id !== pedido.current) return;
        setEstado({ tipo: 'listo', datos: json.datos, puedeExportar: json.puedeExportar });
      } catch {
        if (id === pedido.current) setEstado({ tipo: 'error' });
      } finally {
        if (id === pedido.current) setCargandoPais(false);
      }
    },
    [rango.desde, rango.hasta, sucursal, pais],
  );

  const cargarTrafico = useCallback(async () => {
    const id = ++pedidoTrafico.current;
    setTrafico((t) => ({ ...t, cargando: true }));
    const qs = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
    if (sucursal !== null) qs.set('sucursal', String(sucursal));
    try {
      const res = await fetch(`${RUTA_API_TRAFICO}?${qs.toString()}`, { cache: 'no-store' });
      if (id !== pedidoTrafico.current) return;
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { disponible: boolean; trafico: TraficoAnalitica | null; conReservas?: boolean };
      if (id !== pedidoTrafico.current) return;
      setTrafico({ cargando: false, disponible: json.disponible && !!json.trafico, datos: json.trafico, conReservas: json.conReservas === true });
    } catch {
      if (id === pedidoTrafico.current) setTrafico({ cargando: false, disponible: false, datos: null, conReservas: false });
    }
  }, [rango.desde, rango.hasta, sucursal]);

  // Si la mayoría de los visitantes son de Colombia, se abre su mapa por
  // departamento, salvo que la persona ya haya elegido (o vuelto al mundo).
  const paisElegidoPorUsuario = useRef(false);
  const elegirPais = useCallback((p: string | null) => {
    paisElegidoPorUsuario.current = true;
    setPais(p);
  }, []);
  useEffect(() => {
    if (estado.tipo !== 'listo' || pais !== null || paisElegidoPorUsuario.current) return;
    if (debeAbrirColombia(estado.datos.paises)) {
      paisElegidoPorUsuario.current = true;
      setPais('CO');
    }
  }, [estado, pais]);

  // Periodo o sucursal: recarga completa (y el tráfico). País: solo la parte geográfica.
  const ultimaClave = useRef('');
  useEffect(() => {
    const clave = `${rango.desde}|${rango.hasta}|${sucursal ?? ''}`;
    const soloPais = clave === ultimaClave.current;
    ultimaClave.current = clave;
    void cargar({ soloPais });
  }, [cargar, rango.desde, rango.hasta, sucursal]);
  useEffect(() => {
    void cargarTrafico();
  }, [cargarTrafico]);

  const actualizar = useCallback(() => {
    void cargar();
    void cargarTrafico();
  }, [cargar, cargarTrafico]);

  const exportar = useCallback(
    (enc: EncabezadosCsv) => {
      if (estado.tipo !== 'listo') return;
      const csv = csvAnalitica(estado.datos, enc);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `analitica-web_${rango.desde}_${rango.hasta}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [estado, rango.desde, rango.hasta],
  );

  const vacio = estado.tipo === 'listo' && estado.datos.actual.visitantes === 0 && estado.datos.actual.pedidos === 0;

  return {
    periodo,
    setPeriodo,
    rangoCustom,
    setRangoCustom,
    rango,
    hoy,
    estado,
    cargandoPais,
    elegirPais,
    trafico,
    sucursal,
    nombreSucursal: sucursal !== null ? sucursalCtx?.branches.find((b) => Number(b.id) === sucursal)?.name : undefined,
    numSucursales: sucursalCtx?.branches.length ?? 0,
    actualizar,
    exportar,
    vacio,
  };
}
