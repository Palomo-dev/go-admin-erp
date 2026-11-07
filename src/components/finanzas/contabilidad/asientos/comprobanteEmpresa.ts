/**
 * Encabezado del comprobante: nombre y NIT de la organización activa. Lectura
 * con el cliente del navegador (RLS por pertenencia); la organización sale de
 * la sesión del navegador, igual que el resto de Contabilidad.
 */
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface EmpresaComprobante {
  name: string | null;
  legal_name: string | null;
  nit: string | null;
  dv: string | null;
}

export async function datosEmpresaComprobante(): Promise<EmpresaComprobante | null> {
  const org = getOrganizationId();
  if (!org) return null;
  const { data, error } = await supabase
    .from('organizations')
    .select('name, legal_name, nit, dv')
    .eq('id', org)
    .maybeSingle();
  if (error) throw error;
  return (data as EmpresaComprobante | null) ?? null;
}

/** «900.000.000-1»: el NIT tal como está guardado más el dígito de verificación si no lo trae. */
export function nitConDigito(empresa: Pick<EmpresaComprobante, 'nit' | 'dv'>): string | null {
  const nit = (empresa.nit ?? '').trim();
  if (!nit) return null;
  const dv = String(empresa.dv ?? '').trim();
  return dv && !nit.includes('-') ? `${nit}-${dv}` : nit;
}
