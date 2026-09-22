export { ReportesPage } from './ReportesPage';
export { SatisfaccionPage } from './SatisfaccionPage';
export { ReportesService } from './reportesService';
export type { 
  SalesReport, 
  ProductReport, 
  PaymentMethodReport, 
  DailySalesData,
  ReportFilters,
  CashierReport
} from './reportesService';
export { aggregateSatisfaction, getSatisfactionReport } from './satisfaccionService';
export type { SatisfactionReport, SatisfactionGroup, SatisfactionRow } from './satisfaccionService';
