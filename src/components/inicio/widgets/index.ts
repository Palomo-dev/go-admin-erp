/**
 * F13 — widgets del vendedor para /app/inicio. Autocontenidos: reciben los
 * datos de `useSellerDashboard` y no dependen del estado de la página.
 * Se montan en `sections/SellerSection.tsx` (el dueño la cablea en `page.tsx`).
 */
export { QuotaProgressWidget } from './QuotaProgressWidget';
export { CommissionsWidget } from './CommissionsWidget';
export { SellerLeaderboardWidget } from './SellerLeaderboardWidget';
export { MyPipelineWidget } from './MyPipelineWidget';
export { WidgetCard } from './WidgetCard';
export { useSellerDashboard } from './useSellerDashboard';
export * from './widgetModels';
