export { finanzasReportService } from './finanzasReportService';
export type {
  FinanzasFilters,
  FinanzasKPI,
  FacturaResumen,
  PagoPorMetodo,
  PagoPorDia,
  AgingBucket,
  CxCResumen,
  CxPResumen,
} from './finanzasReportService';

export { FinanzasFilters as FinanzasFiltersComponent } from './FinanzasFilters';
export { FinanzasKPIs } from './FinanzasKPIs';
export { PagosPorDiaChart, FinanzasPagosPorMetodoChart, AgingChart } from './FinanzasCharts';
export { FinanzasTopCxC, FinanzasTopCxP } from './FinanzasCarteraLists';
export { FinanzasFacturasTable } from './FinanzasFacturasTable';
