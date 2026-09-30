import { normalizePhoneDigits } from './phoneNormalize';
export const CAMPOS_FUSION = [
  'first_name',
  'last_name',
  'company_name',
  'trade_name',
  'identification_type',
  'identification_number',
  'email',
  'phone',
  'address',
  'city',
] as const;

export interface ClienteDuplicado {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  trade_name: string | null;
  identification_type: string | null;
  identification_number: string | null;
  address: string | null;
  city: string | null;
  conversations_count: number;
  opportunities_count: number;
}
export interface GrupoDuplicado {
  identity_type: string;
  identity_value: string;
  customers: ClienteDuplicado[];
}
export interface ParExcluido {
  customer_a: string;
  customer_b: string;
}

export function clavePar(a: string, b: string) {
  return [a, b].sort().join(':');
}

/** Los sufijos son solo candidatos SQL. Esta es la comparación telefónica
 * canónica, compartida con WhatsApp: no se fusiona por nombre ni por sufijo. */
export function confirmarDuplicados(
  candidates: GrupoDuplicado[],
  country: string,
): GrupoDuplicado[] {
  const result: GrupoDuplicado[] = [];
  for (const group of candidates) {
    if (group.identity_type !== 'phone') {
      result.push(group);
      continue;
    }
    const phones = new Map<string, ClienteDuplicado[]>();
    for (const customer of group.customers) {
      const key = normalizePhoneDigits(customer.phone ?? '', country);
      if (key) phones.set(key, [...(phones.get(key) ?? []), customer]);
    }
    for (const [key, customers] of phones) {
      if (customers.length > 1)
        result.push({ identity_type: 'phone', identity_value: key, customers });
    }
  }
  return result;
}

/** La lista ofrece pares, como la comparación de Figma. La paginación limita
 * la respuesta sin dejar de considerar a todos los contactos de cada grupo. */
export function paginaPares(
  groups: GrupoDuplicado[],
  exclusions: ParExcluido[],
  page: number,
  limit = 25,
) {
  const excluded = new Set(
    exclusions.map((p) => clavePar(p.customer_a, p.customer_b)),
  );
  const seen = new Set<string>();
  const result: GrupoDuplicado[] = [];
  let total = 0;
  for (const group of groups) {
    for (let a = 0; a < group.customers.length; a++)
      for (let b = a + 1; b < group.customers.length; b++) {
        const pair = clavePar(group.customers[a].id, group.customers[b].id);
        if (excluded.has(pair) || seen.has(pair)) continue;
        seen.add(pair);
        if (total >= (page - 1) * limit && total < page * limit)
          result.push({
            ...group,
            customers: [group.customers[a], group.customers[b]],
          });
        total++;
      }
  }
  return { data: result, total, page };
}
