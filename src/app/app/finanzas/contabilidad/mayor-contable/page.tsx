import { MayorContablePage } from '@/components/finanzas/contabilidad/mayor-contable/MayorContablePage';

/**
 * Mayor contable: página de trabajo de Contabilidad (decisión 1 del dueño,
 * 2026-11-07). El reporte «Mayor por cuenta» de Reportes sigue existiendo y
 * pinta este mismo componente: los dos leen `ReportesContablesService.getLedger`.
 * `?cuenta=` (del plan de cuentas o de una tabla contable) abre esa cuenta.
 */
export default function Page() {
  return <MayorContablePage />;
}
