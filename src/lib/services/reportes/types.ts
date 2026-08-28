// ============================================================
// Tipos y contratos del módulo de Reportes
// Estructura unificada para todos los reportes de los 19 módulos
// ============================================================

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
}

/** Categoría del reporte para agrupación visual */
export type CategoriaReporte =
  | 'operativo'
  | 'financiero'
  | 'contable'
  | 'comercial'
  | 'personas'
  | 'sistema';

/** Definición (catálogo) de un reporte disponible */
export interface ReportDefinition {
  id: string;
  modulo: string; // 'pos' | 'finance' | 'crm' | ...
  titulo: string;
  descripcion: string;
  categoria: CategoriaReporte;
  periodosSugeridos: TipoCierre[];
  fetch: (orgId: number, periodo: PeriodoCierre) => Promise<ReportData>;
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
