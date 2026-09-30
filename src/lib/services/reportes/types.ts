// ============================================================
// Tipos y contratos del módulo de Reportes
// Estructura unificada para todos los reportes de los 19 módulos
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Períodos de cierre soportados */
export type TipoCierre =
  | 'diario'
  | 'semanal'
  | 'quincenal'
  | 'mensual'
  | 'trimestral'
  | 'semestral'
  | 'anual'
  | 'personalizado';

/** Período de cierre resuelto con fechas concretas */
export interface PeriodoCierre {
  tipo: TipoCierre;
  fechaInicio: string; // ISO date (yyyy-mm-dd)
  fechaFin: string; // ISO date (yyyy-mm-dd)
  etiqueta: string; // "Cierre Diario — 03/08/2026" | "Q3 2026" | etc.
  // Horas opcionales para filtrar dentro del día (formato "HH:mm" 24h).
  // Si se definen, los reportes usan estas horas en vez del día completo.
  // Útil para empresas con horarios no estándar (ej: 8pm a 3am).
  horaInicio?: string | null; // "HH:mm" o null
  horaFin?: string | null;    // "HH:mm" o null
}

/** Tipo de dato de una columna de reporte */
export type TipoColumna = 'texto' | 'numero' | 'moneda' | 'porcentaje' | 'fecha';

/** Definición de una columna del reporte */
export interface ReporteColumna {
  key: string;
  titulo: string;
  tipo: TipoColumna;
  alinear?: 'left' | 'right' | 'center';
}

/** KPI del reporte */
export interface ReporteKPI {
  titulo: string;
  valor: string | number;
  formato?: 'moneda' | 'numero' | 'porcentaje';
}

/**
 * Otra forma de leer el mismo resultado (pestañas del visor: «Por tipo»,
 * «Por proveedor», «Por cuenta»…). La vista principal son `columnas`/`filas`
 * del propio `ReportData`; estas son las adicionales.
 */
export interface VistaReporte {
  id: string;
  titulo: string;
  columnas: ReporteColumna[];
  filas: Record<string, unknown>[];
  totales?: Record<string, unknown>;
}

/** Tono de una observación del panel «Lectura rápida». */
export type TonoLectura = 'bien' | 'aviso' | 'alerta' | 'info';

/**
 * Observación calculada sobre el resultado (no inventada): «3 facturas
 * vencidas a más de 90 días», «la caja de la sede Norte sigue abierta».
 */
export interface LecturaReporte {
  tono: TonoLectura;
  texto: string;
  /** Ruta de la app donde se resuelve (p. ej. la cartera vencida). */
  href?: string;
  etiquetaAccion?: string;
}

/** Estructura universal de datos de un reporte ejecutado */
export interface ReportData {
  id: string; // 'cierre-caja', 'estado-resultados', ...
  titulo: string;
  modulo: string; // código de módulo BD
  kpis: ReporteKPI[];
  columnas: ReporteColumna[];
  filas: Record<string, unknown>[];
  totales?: Record<string, unknown>; // fila de totales al pie
  generadoEn: string; // timestamp ISO
  periodo: PeriodoCierre;
  /** Título de la vista principal cuando hay `vistas` (p. ej. «Por tipo»). */
  vistaPrincipal?: string;
  vistas?: VistaReporte[];
  lectura?: LecturaReporte[];
}

/** Categoría del reporte para agrupación visual */
export type CategoriaReporte =
  | 'operativo'
  | 'financiero'
  | 'contable'
  | 'comercial'
  | 'personas'
  | 'sistema';

/**
 * Qué datos ve el reporte respecto a las sucursales.
 * - 'sucursal': filtra por la sucursal elegida; sin sucursal es el consolidado.
 * - 'organizacion': cifras de toda la organización, no se dividen por
 *   sucursal. Solo las ve quien tiene acceso a todas las sucursales; la RPC
 *   lo exige igual (`reporte_exigir_alcance_sucursal`).
 */
export type AlcanceReporte = 'sucursal' | 'organizacion';

/**
 * Cliente de Supabase con el que se ejecuta un reporte (F0-SEC r3, tester r2
 * fallo 3). En el navegador es el cliente browser con la sesión del usuario; en
 * un route handler es el cliente de sesión de `getServerOrgContext()`. Nunca el
 * service role.
 *
 * Aislamiento entre inquilinos (F-53, corregido el 2026-09-22 en
 * `20260922233000_reportes_cerrar_anon_y_guarda_pertenencia.sql`): las 21
 * `fn_reporte_*` son SECURITY DEFINER y reciben la organización por parámetro,
 * así que el aislamiento no lo da esta capa — lo da la propia RPC, con las dos
 * mitades juntas:
 *   (a) una guarda de pertenencia al principio del cuerpo, que exige que
 *       `auth.uid()` sea miembro activo del `p_organization_id` recibido y
 *       lanza 42501 si no lo es;
 *   (b) `EXECUTE` revocado a `anon` y a PUBLIC, conservado en `authenticated`
 *       y `service_role`.
 * Con el service role la guarda falla cerrada (`auth.uid()` es NULL), de ahí
 * que aquí nunca se pase ese cliente: no es una convención, es un requisito.
 * Antes de esa migración, 19 de las 21 no tenían ninguna de las dos mitades y
 * la sola clave publicable del navegador leía los datos de cualquier
 * organización cambiando un número. Ver `docs/hallazgos/F-53.md`.
 *
 * Cuidado al tocar estas funciones: un `DROP` + `CREATE` posterior reconstruye
 * los GRANT por defecto del esquema y reabre (b) sin avisar — ya pasó con
 * `20260922210000`. `seguridadRpc.test.ts` lee el estado efectivo de todas las
 * migraciones en orden justamente para que eso salga en rojo.
 */
export type ReportesClient = SupabaseClient;

/**
 * Tarjeta del centro de reportes. Es distinta de `modulo`: el módulo decide si
 * el plan de la organización incluye el reporte; el grupo, dónde se muestra
 * (Compras reúne reportes de Finanzas y de Inventario, por ejemplo).
 */
export type GrupoReporte =
  | 'contabilidad'
  | 'finanzas'
  | 'ventas'
  | 'inventario'
  | 'compras'
  | 'personas'
  | 'clientes'
  | 'atencion'
  | 'operacion'
  | 'hoteleria'
  | 'parqueadero'
  | 'membresias'
  | 'transporte';

/**
 * Filtros que el reporte admite además del periodo. La interfaz solo habilita
 * estos; los demás salen deshabilitados con el motivo. Declarar uno que la
 * consulta no aplica es mentirle al usuario: `catalogoV2.test.ts` lo vigila.
 * - `comparativo`: el reporte depende del periodo, así que se puede correr
 *   con el anterior y comparar.
 * - `sucursal`: filtra por la sucursal elegida (`alcance: 'sucursal'`).
 * - `franja`: la consulta usa instantes (`rangoDelPeriodo`), así que respeta
 *   la franja horaria; los reportes por día contable no.
 * - `centroCosto`: tiene la vista por centro de costo.
 */
export type FiltroReporte = 'comparativo' | 'sucursal' | 'franja' | 'centroCosto';

/** Definición tal como la escribe cada archivo de `modulos/`. */
export interface DefinicionModulo {
  id: string;
  modulo: string; // 'pos' | 'finance' | 'crm' | ...
  titulo: string;
  descripcion: string;
  categoria: CategoriaReporte;
  alcance: AlcanceReporte;
  periodosSugeridos: TipoCierre[];
  fetch: (orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient) => Promise<ReportData>;
}

/** Definición (catálogo) de un reporte disponible */
export interface ReportDefinition extends DefinicionModulo {
  grupo: GrupoReporte;
  filtros: FiltroReporte[];
  /** Etiqueta «Nuevo» en la lista (reportes de la v2). */
  nuevo?: boolean;
  /**
   * Reporte que ya no se lista porque quedó como vista de otro. Se conserva
   * para enlaces, favoritos y el asistente: abre `destino` en la vista `vista`.
   */
  alias?: { destino: string; vista: string };
}

/** Agrupación de reportes por módulo para la UI */
export interface ModuloReportes {
  code: string;
  nombre: string;
  icono: string; // nombre del icono lucide
  reportes: ReportDefinition[];
}

/** Códigos de módulos core (siempre visibles) */
export const MODULOS_CORE: string[] = ['organizations', 'clientes', 'roles'];
