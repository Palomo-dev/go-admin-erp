/**
 * Lógica de `CustomerLinkPicker` (Figma 761:23596), el vinculador único:
 * filtro Personas · Empresas · Todos, búsqueda en el servidor con debounce
 * (`GET /api/crm/customers/search`, RPC `fn_clientes_buscar`), «Ya vinculada»
 * deshabilitada, crear sin salir y paso de cargo + contacto principal solo en
 * persona ↔ empresa (`customer_company_links.position` / `is_primary`). Sin
 * React.
 *
 * `customers.full_name`, `doc_type` y `doc_number` son GENERATED: al crear se
 * escriben `first_name`/`last_name` (o `company_name`) e
 * `identification_type`/`identification_number`.
 */
export type FiltroCliente = 'todos' | 'personas' | 'empresas';
export type PasoVinculador = 'buscar' | 'crear' | 'cargo';

/** Mínimo de caracteres para buscar en el servidor. */
export const MIN_BUSQUEDA = 2;
export const DEBOUNCE_MS = 300;

/** Fila de resultado (columnas de `customers`). */
export interface ClienteVinculable {
  id: string;
  full_name: string | null;
  customer_type: 'person' | 'company' | string | null;
  doc_type?: string | null;
  doc_number?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  avatar_url?: string | null;
}

export function tipoDeFiltro(filtro: FiltroCliente): 'person' | 'company' | null {
  return filtro === 'personas' ? 'person' : filtro === 'empresas' ? 'company' : null;
}

export function debeBuscar(texto: string): boolean {
  return texto.trim().length >= MIN_BUSQUEDA;
}

/** Filtra en el cliente lo que el servidor devolvió (el RPC no filtra por tipo). */
export function filtrarResultados(filas: readonly ClienteVinculable[], filtro: FiltroCliente): ClienteVinculable[] {
  const tipo = tipoDeFiltro(filtro);
  return tipo ? filas.filter((f) => f.customer_type === tipo) : [...filas];
}

/** «CC 1.020.334.556 · ana@correo.co» (empresa: «NIT … · Medellín»). */
export function detalleFila(c: ClienteVinculable): string {
  const doc = [c.doc_type, c.doc_number].filter(Boolean).join(' ');
  const extra = c.customer_type === 'company' ? c.city || c.email || c.phone : c.email || c.phone || c.city;
  return [doc, extra].filter(Boolean).join(' · ');
}

const MARCAS_EMPRESA =
  /\b(s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?|ltda\.?|c[ií]a\.?|inc\.?|corp\.?|grupo|distribuciones|distribuidora|comercializadora|inversiones|ferreter[ií]a|constructora|industrias?)(?=\s|$)/i;

/** Tipo que propone «Crear … sin salir»: el del filtro o, en «Todos», el que sugiere el texto. */
export function tipoSugerido(texto: string, filtro: FiltroCliente): 'person' | 'company' {
  const tipo = tipoDeFiltro(filtro);
  if (tipo) return tipo;
  return MARCAS_EMPRESA.test(texto.trim()) ? 'company' : 'person';
}

/**
 * Tipo de documento del país de la organización (`country_identification_types`:
 * `code`, `name`, `for_person`, `for_company`). No se cablea: lo pasa la pantalla.
 */
export interface TipoDocumento {
  code: string;
  name: string;
  for_person?: boolean | null;
  for_company?: boolean | null;
}

/** Tipos que aplican a persona o a empresa, en el orden recibido. */
export function tiposDocumentoPara(tipos: readonly TipoDocumento[], tipo: 'person' | 'company'): TipoDocumento[] {
  return tipos.filter((t) => (tipo === 'person' ? t.for_person !== false : t.for_company !== false));
}

export interface ValoresCrearCliente {
  tipo: 'person' | 'company';
  first_name: string;
  last_name: string;
  company_name: string;
  identification_type: string;
  identification_number: string;
  email: string;
  phone: string;
}

/** Prellena desde lo buscado: «Ana G» → nombre «Ana», apellido «G». */
export function valoresCrear(texto: string, filtro: FiltroCliente, tipos: readonly TipoDocumento[] = []): ValoresCrearCliente {
  const tipo = tipoSugerido(texto, filtro);
  const limpio = texto.trim().replace(/\s+/g, ' ');
  const [nombre, ...resto] = limpio.split(' ');
  return {
    tipo,
    first_name: tipo === 'person' ? nombre ?? '' : '',
    last_name: tipo === 'person' ? resto.join(' ') : '',
    company_name: tipo === 'company' ? limpio : '',
    identification_type: tiposDocumentoPara(tipos, tipo)[0]?.code ?? '',
    identification_number: '',
    email: '',
    phone: '',
  };
}

export function validarCrear(v: ValoresCrearCliente): Partial<Record<keyof ValoresCrearCliente, 'obligatorio' | 'correoInvalido'>> {
  const e: Partial<Record<keyof ValoresCrearCliente, 'obligatorio' | 'correoInvalido'>> = {};
  if (v.tipo === 'person') {
    if (!v.first_name.trim()) e.first_name = 'obligatorio';
    if (!v.last_name.trim()) e.last_name = 'obligatorio';
  } else if (!v.company_name.trim()) e.company_name = 'obligatorio';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'correoInvalido';
  return e;
}

/** Cuerpo para crear el cliente (sin columnas GENERATED ni organización: esa sale de la sesión). */
export function datosCrear(v: ValoresCrearCliente) {
  const texto = (s: string) => s.trim() || null;
  return {
    customer_type: v.tipo,
    first_name: v.tipo === 'person' ? texto(v.first_name) : null,
    last_name: v.tipo === 'person' ? texto(v.last_name) : null,
    company_name: v.tipo === 'company' ? texto(v.company_name) : null,
    identification_type: v.identification_number.trim() && v.identification_type ? v.identification_type : null,
    identification_number: texto(v.identification_number),
    email: texto(v.email),
    phone: texto(v.phone),
  };
}

/** El paso de cargo aplica solo al vincular persona ↔ empresa. */
export function pideCargo(vinculo: 'persona_empresa' | 'ninguno', elegido: Pick<ClienteVinculable, 'customer_type'>): boolean {
  return vinculo === 'persona_empresa' && (elegido.customer_type === 'person' || elegido.customer_type === 'company');
}

/** Índice de la fila activa con flechas (se salta las ya vinculadas). */
export function filaSiguiente(actual: number, tecla: string, deshabilitadas: readonly boolean[]): number | null {
  const total = deshabilitadas.length;
  if (!total) return null;
  const paso = tecla === 'ArrowDown' ? 1 : tecla === 'ArrowUp' ? -1 : 0;
  if (!paso) return null;
  for (let i = 1; i <= total; i += 1) {
    const j = (actual + paso * i + total * 2) % total;
    if (!deshabilitadas[j]) return j;
  }
  return null;
}
