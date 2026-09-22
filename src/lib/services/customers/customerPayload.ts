/**
 * Cliente: UNA sola traducción de "lo que escribe el usuario" a la fila de
 * `customers`.
 *
 * La usan el formulario de `/app/clientes/new` (`ClientForm`) y el asistente
 * (`create_customer`). Antes cada uno tenía su propio `insert` y divergían:
 * el asistente no sabía si era persona o empresa, usaba códigos de documento
 * distintos a los del formulario y no escribía roles ni responsabilidades
 * fiscales. Si hay que cambiar cómo se guarda un cliente, se cambia aquí y
 * cambia en todas partes.
 *
 * Sin dependencias de React ni de Supabase: es puro cálculo y se puede probar
 * sin nada más.
 */

export type CustomerType = 'person' | 'company';

/** Los valores del formulario, con los mismos nombres que usa `ClientForm`. */
export interface CustomerFormValues {
  customerType: CustomerType;
  firstName: string;
  lastName: string;
  companyName: string;
  tradeName: string;
  email: string;
  phone: string;
  /** Código de `country_identification_types` (`cc`, `nit`, `passport`…). */
  documentType: string;
  documentNumber: string;
  dv: string;
  address: string;
  /** Ciudad en texto libre; el municipio fiscal es otro campo. */
  city: string;
  municipalityId: string;
  notes: string;
  /** Separadas por coma, como en el formulario. */
  tags: string;
  roles: string[];
  fiscalResponsibilities: string[];
  parentCustomerId: string;
  currentSoftware: string;
}

export const DEFAULT_ROLES = ['cliente', 'huesped'];
export const DEFAULT_FISCAL = ['R-99-PN'];

export function emptyCustomerValues(): CustomerFormValues {
  return {
    customerType: 'person',
    firstName: '',
    lastName: '',
    companyName: '',
    tradeName: '',
    email: '',
    phone: '',
    documentType: '',
    documentNumber: '',
    dv: '',
    address: '',
    city: '',
    municipalityId: '',
    notes: '',
    tags: '',
    roles: [...DEFAULT_ROLES],
    fiscalResponsibilities: [...DEFAULT_FISCAL],
    parentCustomerId: '',
    currentSoftware: '',
  };
}

/** "Juan Camilo Gallego" → nombre "Juan Camilo", apellido "Gallego". */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  // Dos nombres y dos apellidos es lo habitual en Colombia; con tres partes,
  // un nombre y dos apellidos.
  const corte = parts.length >= 4 ? 2 : 1;
  return { firstName: parts.slice(0, corte).join(' '), lastName: parts.slice(corte).join(' ') };
}

/**
 * Códigos de documento como los escribe la gente (y como los escribía el
 * asistente antes) → códigos de `country_identification_types`. En la base
 * conviven `CC` (10 804 filas), `cc`, `NIT`, `nit`, `die`, `dni`: el
 * formulario guarda el código en minúsculas, así que eso es lo canónico.
 */
const DOC_ALIAS: Record<string, string> = {
  cc: 'cc',
  cedula: 'cc',
  cedulaciudadania: 'cc',
  cedulade: 'cc',
  nationalid: 'cc',
  ce: 'ce',
  cedulaextranjeria: 'ce',
  foreignid: 'ce',
  ti: 'ti',
  tarjetaidentidad: 'ti',
  nit: 'nit',
  taxid: 'nit',
  rut: 'rut',
  pasaporte: 'passport',
  passport: 'passport',
  pp: 'passport',
  die: 'die',
  pep: 'pep',
  nuip: 'nuip',
  rc: 'rc',
  registrocivil: 'rc',
  te: 'te',
  dni: 'dni',
  other: 'other',
  otro: 'other',
};

export function normalizeDocumentType(raw: string | null | undefined, customerType: CustomerType): string {
  const key = String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (!key) return '';
  const code = DOC_ALIAS[key] ?? key;
  // Una empresa con "cédula" es un error de dictado: en Colombia lleva NIT.
  if (customerType === 'company' && (code === 'cc' || code === 'ti')) return 'nit';
  return code;
}

/** Dígito de verificación del NIT colombiano (DIAN). */
export function nitCheckDigit(nit: string): number | null {
  const digits = nit.replace(/\D/g, '');
  if (!digits) return null;
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let suma = 0;
  const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length && i < pesos.length; i++) suma += Number(rev[i]) * pesos[i];
  const resto = suma % 11;
  return resto > 1 ? 11 - resto : resto;
}

/**
 * ¿Parece una empresa? Se usa cuando el usuario no lo dijo explícitamente:
 * "la ferretería del barrio es la empresa" o un NIT delatan a una empresa.
 */
export function inferCustomerType(values: { customerType?: string | null; documentType?: string | null; companyName?: string | null; fullName?: string | null }): CustomerType {
  if (values.customerType === 'company' || values.customerType === 'person') return values.customerType;
  const doc = normalizeDocumentType(values.documentType, 'person');
  if (doc === 'nit' || doc === 'nit_ext' || doc === 'rut' || doc === 'company_reg') return 'company';
  if (values.companyName && !values.fullName) return 'company';
  if (/\b(s\.?a\.?s?|ltda|s\.?a\.?|e\.?u\.?|s\.?c\.?a|inc|llc|cía|cia|compañ[ií]a)\b\.?$/i.test(values.fullName ?? '')) return 'company';
  return 'person';
}

export interface CustomerInsertRow {
  organization_id: number;
  branch_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  identification_type: string | null;
  identification_number: string | null;
  dv: number | null;
  company_name: string | null;
  trade_name: string | null;
  address: string | null;
  city: string | null;
  fiscal_municipality_id: string | null;
  notes: string | null;
  current_software: string | null;
  roles: string[];
  fiscal_responsibilities: string[];
  tags: string[];
  customer_type: CustomerType;
  parent_customer_id: string | null;
  created_at: string;
}

const nul = (v: string) => (v && v.trim() ? v.trim() : null);

/**
 * La fila de `customers`. `full_name`, `doc_type` y `doc_number` son
 * GENERATED ALWAYS: se escriben los campos base, nunca los generados.
 * Para una empresa, `first_name` lleva la razón social y `last_name` vacío,
 * igual que siempre hizo el formulario, para que `full_name` la muestre.
 */
export function buildCustomerInsert(
  values: CustomerFormValues,
  ctx: { organizationId: number; branchId: number | null }
): CustomerInsertRow {
  const esEmpresa = values.customerType === 'company';
  const dv = values.dv && /^\d$/.test(values.dv.trim()) ? parseInt(values.dv.trim(), 10) : null;
  return {
    organization_id: ctx.organizationId,
    branch_id: ctx.branchId ?? null,
    first_name: esEmpresa ? values.companyName.trim() : values.firstName.trim(),
    last_name: esEmpresa ? '' : values.lastName.trim(),
    email: nul(values.email),
    phone: nul(values.phone),
    identification_type: nul(values.documentType),
    identification_number: nul(values.documentNumber),
    dv,
    company_name: nul(values.companyName),
    trade_name: nul(values.tradeName),
    address: nul(values.address),
    city: nul(values.city),
    fiscal_municipality_id: nul(values.municipalityId),
    notes: nul(values.notes),
    current_software: nul(values.currentSoftware),
    roles: values.roles.length ? values.roles : [...DEFAULT_ROLES],
    fiscal_responsibilities: values.fiscalResponsibilities.length ? values.fiscalResponsibilities : [...DEFAULT_FISCAL],
    tags: values.tags
      ? values.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    customer_type: values.customerType,
    parent_customer_id: !esEmpresa && values.parentCustomerId ? values.parentCustomerId : null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Lo que el asistente extrajo del mensaje (campos de `create_customer`) →
 * valores del formulario. Es la misma traducción que hace un humano al
 * rellenar `/app/clientes/new`, así que aquí se decide persona/empresa, se
 * reparte el nombre y se normaliza el documento.
 */
export function customerValuesFromAction(fields: Record<string, unknown>): CustomerFormValues {
  const s = (k: string) => (typeof fields[k] === 'string' ? (fields[k] as string).trim() : '');
  const fullName = s('full_name');
  const companyName = s('company_name');
  const customerType = inferCustomerType({
    customerType: s('customer_type') || null,
    documentType: s('doc_type') || null,
    companyName: companyName || null,
    fullName: fullName || null,
  });
  const { firstName, lastName } = splitFullName(fullName);
  const documentType = normalizeDocumentType(s('doc_type'), customerType);
  const documentNumber = s('doc_number').replace(/[.\s]/g, '');
  let dv = s('dv');
  if (!dv && documentType === 'nit' && documentNumber) {
    const d = nitCheckDigit(documentNumber);
    if (d !== null) dv = String(d);
  }
  const base = emptyCustomerValues();
  return {
    ...base,
    customerType,
    firstName,
    lastName,
    // Si es empresa y solo dieron "nombre", ese nombre ES la razón social.
    companyName: companyName || (customerType === 'company' ? fullName : ''),
    tradeName: s('trade_name'),
    email: s('email'),
    phone: s('phone'),
    documentType,
    documentNumber,
    dv,
    address: s('address'),
    city: s('city'),
    notes: s('notes'),
    currentSoftware: s('current_software'),
  };
}
