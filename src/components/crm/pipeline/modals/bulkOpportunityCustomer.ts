/**
 * Cliente de cada fila del alta masiva de oportunidades.
 *
 * Antes el diálogo insertaba en `customers` con `full_name`, que es una
 * columna GENERATED ALWAYS (verificado en information_schema el 2026-09-23):
 * el INSERT fallaba siempre, el error se tragaba y la fila contaba como
 * «fallida» sin explicación. Ahora el alta pasa por `resolveLeadCustomer`,
 * el mismo servicio que usan las altas de leads del CRM (parte el nombre en
 * first_name/last_name, exige correo o teléfono y detecta el correo repetido),
 * y el teléfono se valida y normaliza con las utilidades del PhoneInput.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveLeadCustomer, clean } from '@/lib/services/crm/leadCustomer';
import { mensajeErrorTelefono, normalizarTelefono, telefonoOpcionalValido } from '@/lib/utils/telefono';

export interface FilaCliente {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export type ClienteDeFila =
  | { tipo: 'ninguno' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'nuevo'; nombre: string; email: string | null; telefono: string | null };

/** Valida y normaliza los datos del cliente de una fila, sin tocar la BD. */
export function prepararClienteDeFila(fila: FilaCliente, isoPorDefecto?: string): ClienteDeFila {
  const nombre = clean(fila.customerName);
  if (!nombre) return { tipo: 'ninguno' };

  const telefonoCrudo = clean(fila.customerPhone);
  if (telefonoCrudo && !telefonoOpcionalValido(telefonoCrudo, isoPorDefecto)) {
    return {
      tipo: 'error',
      mensaje: mensajeErrorTelefono(telefonoCrudo, isoPorDefecto) ?? 'El teléfono no es válido.',
    };
  }

  return {
    tipo: 'nuevo',
    nombre,
    email: clean(fila.customerEmail),
    telefono: telefonoCrudo ? normalizarTelefono(telefonoCrudo, isoPorDefecto) || null : null,
  };
}

/** `%` y `_` escritos por el usuario se buscan literalmente en un ILIKE. */
function literalIlike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Devuelve el id del cliente de la fila: uno existente con el mismo nombre o
 * el mismo correo, o uno nuevo. `undefined` si la fila no trae cliente.
 * Lanza un Error con un mensaje legible si la fila no se puede resolver.
 */
export async function resolverClienteDeFila(
  supabase: SupabaseClient,
  organizationId: number,
  fila: FilaCliente,
  isoPorDefecto?: string,
): Promise<string | undefined> {
  const preparado = prepararClienteDeFila(fila, isoPorDefecto);
  if (preparado.tipo === 'ninguno') return undefined;
  if (preparado.tipo === 'error') throw new Error(preparado.mensaje);

  // Mismo nombre en la organización: se reutiliza (comportamiento previo).
  const { data: existentes, error: errorBusqueda } = await supabase
    .from('customers')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('full_name', literalIlike(preparado.nombre))
    .limit(1);
  if (errorBusqueda) throw errorBusqueda;
  if (existentes && existentes.length > 0) return existentes[0].id as string;

  const resultado = await resolveLeadCustomer(
    { supabase, organizationId },
    {
      new_customer: {
        full_name: preparado.nombre,
        email: preparado.email ?? undefined,
        phone: preparado.telefono ?? undefined,
      },
    },
    null,
  );
  if (resultado.ok) return resultado.customerId;

  // Correo ya usado en la organización: en un alta masiva se usa esa ficha.
  const existente = resultado.result.extra?.existing_customer as { id?: string } | null | undefined;
  if (resultado.result.status === 409 && existente?.id) return existente.id;

  throw new Error(resultado.result.error);
}
