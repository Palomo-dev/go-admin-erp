import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { crearClienteRapido } from '@/lib/services/documentos/edicionDocumento';
import type { ClienteVinculable } from '@/components/crm/kit/customerLinkPickerLogica';
import type { datosCrear } from '@/components/crm/kit/customerLinkPickerLogica';

/**
 * «Crear persona / Crear empresa» del vinculador de cliente (Figma CRM
 * 779:37686 y la hoja móvil 779:38675): el alta rápida ÚNICA de clientes
 * (`crearClienteRapido`, la misma fila que el formulario de Clientes y el
 * mismo control de duplicado por documento; CLAUDE.md regla 7). Si el
 * documento ya existe, el error sube y el vinculador muestra su aviso.
 */
export async function crearClienteDesdeVinculador(d: ReturnType<typeof datosCrear>): Promise<ClienteVinculable> {
  const org = getOrganizationId();
  if (!org) throw new Error('sin_organizacion');
  const empresa = d.customer_type === 'company';
  const fila = await crearClienteRapido(org, null, {
    tipo: empresa ? 'empresa' : 'persona',
    tipoDocumento: d.identification_type ?? '',
    numeroDocumento: d.identification_number ?? '',
    dv: '',
    nombres: d.first_name ?? '',
    apellidos: d.last_name ?? '',
    razonSocial: d.company_name ?? '',
    contacto: '',
    correo: d.email ?? '',
    telefono: d.phone ?? '',
    diasCredito: null,
  });
  const f = fila as unknown as { id: string; full_name?: string | null; email?: string | null; phone?: string | null };
  const nombre = empresa ? d.company_name : [d.first_name, d.last_name].filter(Boolean).join(' ');
  return { id: f.id, full_name: f.full_name ?? nombre ?? null, customer_type: d.customer_type, email: f.email ?? d.email, phone: f.phone ?? d.phone };
}
