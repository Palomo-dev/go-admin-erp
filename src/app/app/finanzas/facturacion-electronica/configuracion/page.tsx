import ConfiguracionServicioFE from '@/components/finanzas/facturacion-electronica/ConfiguracionServicioFE';

/** Configuración de facturación electrónica (la enlaza el botón «Configuración» de la bandeja). */
export default function ConfiguracionFacturacionElectronicaPage() {
  return (
    <div className="p-4 sm:p-6">
      <ConfiguracionServicioFE />
    </div>
  );
}
