/**
 * «Mis envíos» sin perfil de domiciliario (Figma «21 Logística» b1 v2 3238-19877 y b2 v2
 * 3238-19364; celular «18» y «19»). Puro.
 *
 * - b1: el cargo de la persona gestiona Logística (`fn_logistica_gestiona`, permiso
 *   `logistica.manage`): cifras del día, «Registrarme como domiciliario» (el mismo diálogo de
 *   Domiciliarios) y atajos a las pantallas de despacho que su menú ya le muestra.
 * - b2: sin ese permiso: qué es la página, quién la registra y atajos a lo que su menú le muestra.
 *
 * Los atajos salen SIEMPRE del menú visible de la persona (`seccionesVisiblesServidor`): nunca se
 * ofrece una página que su plan, su cargo o su organización le ocultan.
 */
import { RUTAS_LOGISTICA } from './rutas';
import { ESTADOS_CON_PAQUETE } from './misEnvios';
import { kpisDespacho, type FilaDespacho } from './despacho';

export interface PaginaAtajo {
  href: string;
  nombre: string;
}

/** Atajos de quien despacha, en el orden del diseño. */
export const ATAJOS_DESPACHO = [RUTAS_LOGISTICA.porDespachar, RUTAS_LOGISTICA.envios, RUTAS_LOGISTICA.cuadres, RUTAS_LOGISTICA.seguimiento] as const;

/** Cuántos atajos se ofrecen a quien no despacha. */
export const MAX_ATAJOS_OTROS = 3;

interface SeccionConPaginas {
  modulos: ReadonlyArray<{ paginas: ReadonlyArray<{ href: string; nombre: string; enMenu?: boolean }> }>;
}

/** Atajos a partir del menú visible: los de despacho (b1) o las primeras páginas del menú (b2). */
export function atajosSinPerfil(secciones: readonly SeccionConPaginas[], gestiona: boolean): PaginaAtajo[] {
  const visibles: PaginaAtajo[] = [];
  const vistos = new Set<string>();
  for (const s of secciones) {
    for (const m of s.modulos) {
      for (const p of m.paginas) {
        if (p.enMenu === false || vistos.has(p.href)) continue;
        vistos.add(p.href);
        visibles.push({ href: p.href, nombre: p.nombre });
      }
    }
  }
  if (gestiona) {
    return ATAJOS_DESPACHO.map((href) => visibles.find((p) => p.href === href)).filter((p): p is PaginaAtajo => !!p);
  }
  return visibles.filter((p) => p.href !== RUTAS_LOGISTICA.misEnvios).slice(0, MAX_ATAJOS_OTROS);
}

export interface KpisSinPerfil {
  porDespachar: number;
  sinDomiciliario: number;
  enRuta: number;
  domiciliariosEnCalle: number;
  novedades: number;
  porReprogramarHoy: number;
  porCuadrar: number;
  domiciliariosPorCuadrar: number;
}

const centavos = (v: unknown) => Math.round((Number(v) || 0) * 100);

/**
 * Cifras del día de quien despacha: por despachar (sin domiciliario), en ruta (paquetes encima y
 * domiciliarios en la calle), novedades (y cuántas vuelven hoy) y efectivo por cuadrar.
 */
export function kpisSinPerfil(p: {
  filas: readonly FilaDespacho[];
  envios: ReadonlyArray<{ driver_id: string; status: string }>;
  porCuadrar: ReadonlyArray<{ driver_id: string | null; cod_collected_amount?: number | string | null; cod_amount?: number | string | null }>;
  ahora: Date;
  zona: string;
  hoy: string;
}): KpisSinPerfil {
  const k = kpisDespacho(p.filas, p.ahora, p.zona);
  const enRuta = p.envios.filter((e) => ESTADOS_CON_PAQUETE.includes(e.status));
  const novedades = p.filas.filter((f) => f.status === 'failed_attempt');
  return {
    porDespachar: k.porDespachar,
    sinDomiciliario: k.sinDomiciliario,
    enRuta: enRuta.length,
    domiciliariosEnCalle: new Set(enRuta.map((e) => e.driver_id)).size,
    novedades: novedades.length,
    porReprogramarHoy: novedades.filter((f) => !f.fechaEsperada || f.fechaEsperada <= p.hoy).length,
    porCuadrar: p.porCuadrar.reduce((s, e) => s + centavos(e.cod_collected_amount ?? e.cod_amount), 0) / 100,
    domiciliariosPorCuadrar: new Set(p.porCuadrar.map((e) => e.driver_id).filter(Boolean)).size,
  };
}

/** Respuesta de `GET /api/logistica/mis-envios/perfil`. */
export interface PerfilMisEnvios {
  gestiona: boolean;
  correo: string | null;
  userId: string;
  atajos: PaginaAtajo[];
  kpis: KpisSinPerfil | null;
}
