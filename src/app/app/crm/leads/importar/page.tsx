import { ImportarLeadsAsistente } from '@/components/crm/leads/importar/ImportarLeadsAsistente';

/**
 * CRM › Leads › Importar: asistente de archivo (CSV/XLS/XLSX) que crea, por
 * cada fila, la ficha de cliente (o usa la que ya existe) y su lead.
 * Guía: docs/crm-revenue-os/IMPORTAR-LEADS.md.
 */
export default function ImportarLeadsPage() {
  return (
    <div className="mx-auto min-h-full w-full max-w-6xl bg-canvas p-4 sm:p-6">
      <ImportarLeadsAsistente />
    </div>
  );
}
