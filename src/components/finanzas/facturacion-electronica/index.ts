// Componentes de Facturación Electrónica.
// La bandeja de envíos vive en `./bandeja` (BandejaEnvios, DetalleEnvioPanel);
// `JobsTable`, `StatsCards`, `JobDetailDialog`, `JobFilters` y
// `JobEventsTimeline` se retiraron con ella (2026-11-07): solo los usaba la
// página vieja de la bandeja.

// Componentes de integración
export { FactusStatusBadge } from './FactusStatusBadge';
export { ElectronicInvoiceStatus } from './ElectronicInvoiceStatus';
export { SendToFactusButton } from './SendToFactusButton';
export { ElectronicInvoiceToggle } from './ElectronicInvoiceToggle';
