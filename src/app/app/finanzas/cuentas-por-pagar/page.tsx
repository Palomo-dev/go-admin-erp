import CuentasPorPagarListado from '@/components/finanzas/cuentas-por-pagar/listado/CuentasPorPagarListado';

export default function CuentasPorPagarPageRoute() {
  return (
    // Mismo margen que el resto de pantallas rediseñadas (p-4 · sm:p-6): el
    // componente no lo trae y todo quedaba pegado al borde (2026-09-28).
    <div className="p-4 sm:p-6">
      <CuentasPorPagarListado />
    </div>
  );
}
