export { ventasReportService } from './ventasReportService';
export type {
  VentasFilters,
  VentasKPI,
  VentaPorDia,
  VentaPorSucursal,
  VentaPorMetodoPago,
  TopProductoVenta,
  TopClienteVenta,
  VentaDetalle,
  SavedReport,
  ReportExecution,
} from './ventasReportService';

export { VentasFilters as VentasFiltersComponent } from './VentasFilters';
export { VentasKPIs } from './VentasKPIs';
export { VentasPorDiaChart, VentasPorSucursalChart, PagosPorMetodoChart } from './VentasCharts';
export { VentasTopProductos, VentasTopClientes } from './VentasTopLists';
export { VentasTable } from './VentasTable';
