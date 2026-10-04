import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError } from './crmErrors';
import { phoneSuffixPattern } from './phoneNormalize';
import { canCallCustomer } from './voiceAgent/canContact';
import { leerConteosSemana, numeroExcluido, zonaHorariaOrganizacion } from './voiceAgent/cumplimiento';
import { normalizarNumeroRne } from './voiceAgent/rne';
import { esNumeroPrueba, EXENCION_NUMERO_PRUEBA } from './voiceAgent/numerosPrueba';
import { decidirContactoLey2300, inicioSemanaLocal, inicioSemanaSiguienteLocal, zonaHorariaDestinatario, type ConteoSemana } from './voiceAgent/ley2300';

interface CustomerPhone { id: string; phone: string | null; timezone: string | null }
export interface HumanCallDecision { allowed: boolean; number: string; code: string | null; nextAt: string | null; timezone: string }

/** Adaptador humano: las reglas legales y de baja son las mismas que usa el agente. */
export async function checkHumanCallCompliance(client: SupabaseClient, org: number, raw: string,
  customerId?: string | null, now = new Date()): Promise<HumanCallDecision> {
  const number = normalizarNumeroRne(raw);
  if (!number || !/^\+[1-9]\d{6,14}$/.test(number)) throw new CrmHttpError(400, 'telefono_invalido', 'Introduce un número válido');
  const zone = await zonaHorariaOrganizacion(client, org);
  const deny = (code: string): HumanCallDecision => ({ allowed: false, number, code, nextAt: null, timezone: zone });
  if (await numeroExcluido(client, org, number)) return deny('numero_excluido');

  // El sufijo sólo limita la lectura; la igualdad se comprueba con el normalizador canónico.
  const { data, error } = await client.from('customers').select('id,phone,timezone')
    .eq('organization_id', org).filter('phone', 'imatch', phoneSuffixPattern(number.replace(/\D/g, ''))).limit(501);
  if (error) throw error;
  if (!Array.isArray(data) || data.length > 500) throw new CrmHttpError(503, 'contactos_inciertos', 'No pudimos verificar los contactos de este número');
  const customers = (data as CustomerPhone[]).filter((row) => normalizarNumeroRne(row.phone) === number);
  if (customerId && !customers.some((row) => row.id === customerId)) {
    throw new CrmHttpError(403, 'cliente_telefono_distinto', 'El número no corresponde al cliente de esta organización');
  }
  for (const customer of customers) {
    if (!(await canCallCustomer(org, customer.id, client))) return deny('contacto_no_autorizado');
  }
  const testNumber = await esNumeroPrueba(client, org, number);
  const customerZone = customers.find((row) => row.id === customerId)?.timezone ?? customers[0]?.timezone ?? zone;
  const recipientZone = zonaHorariaDestinatario(number, customerZone);
  const counts: ConteoSemana = {};
  if (!testNumber) {
    for (const customer of customers) {
      const previous = await leerConteosSemana(client, org, customer.id, recipientZone, now);
      for (const [channel, count] of Object.entries(previous)) counts[channel] = (counts[channel] ?? 0) + (count ?? 0);
    }
    // Las llamadas sin ficha también cuentan; asociar una ficha después no permite saltar el tope.
    const { data: calls, error: callsError } = await client.from('calls').select('to_number,duration_seconds')
      .eq('organization_id', org).eq('direction', 'outbound').is('customer_id', null)
      .gte('answered_at', inicioSemanaLocal(now, recipientZone).toISOString())
      .lt('answered_at', inicioSemanaSiguienteLocal(now, recipientZone).toISOString())
      .filter('to_number', 'imatch', phoneSuffixPattern(number.replace(/\D/g, ''))).limit(501);
    if (callsError) throw callsError;
    if (!Array.isArray(calls) || calls.length > 500) throw new CrmHttpError(503, 'contactos_inciertos', 'No pudimos verificar el historial del número');
    counts.voice = (counts.voice ?? 0) + calls.filter((row) => normalizarNumeroRne(row.to_number) === number && Number(row.duration_seconds) > 0).length;
  }
  const decision = decidirContactoLey2300({ ahora: now, telefonoE164: number, zonaCliente: customerZone,
    canal: 'voice', conteosSemana: counts, exencion: testNumber ? EXENCION_NUMERO_PRUEBA : null });
  return decision.accion === 'contactar'
    ? { allowed: true, number, code: null, nextAt: null, timezone: decision.zona }
    : { allowed: false, number, code: decision.motivo, nextAt: decision.en.toISOString(), timezone: decision.zona };
}

export async function requireHumanCallCompliance(client: SupabaseClient, org: number, number: string, customer?: string | null): Promise<string> {
  const decision = await checkHumanCallCompliance(client, org, number, customer);
  if (!decision.allowed) throw new CrmHttpError(409, decision.code ?? 'contacto_bloqueado', 'Este número no puede recibir una llamada ahora', {
    nextAt: decision.nextAt, timezone: decision.timezone,
  });
  return decision.number;
}
