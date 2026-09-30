/**
 * Búsqueda de clientes para los selectores del CRM (ola 3A) por la ruta del
 * servidor `GET /api/crm/customers/search`, que usa la búsqueda única
 * (`fn_clientes_buscar`): sin tildes, por palabras y por dígitos.
 */
import type { ClienteVinculable } from '@/components/crm/kit/customerLinkPickerLogica';
import { pedirCrm } from './apiCrm';

interface ClienteBuscado {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

export function aClienteVinculable(c: ClienteBuscado): ClienteVinculable {
  return {
    id: c.id,
    full_name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null,
    customer_type: null,
    email: c.email,
    phone: c.phone,
  };
}

export async function buscarClientesCrm(texto: string): Promise<ClienteVinculable[]> {
  const q = texto.trim();
  if (!q) return [];
  const { data } = await pedirCrm<ClienteBuscado[]>(`/api/crm/customers/search?q=${encodeURIComponent(q.slice(0, 60))}&limit=20`);
  return (data ?? []).map(aClienteVinculable);
}
