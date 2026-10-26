import { InformeEstadosPage } from '@/components/finanzas/contabilidad/estados/InformeEstadosPage';

export default function Page() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <InformeEstadosPage informe="situacion-financiera" />
    </div>
  );
}
