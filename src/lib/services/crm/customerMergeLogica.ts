/**
 * Tipos y lógica pura de duplicados y fusión de clientes, compartidos por el
 * servidor (`customerMergeService`) y la pantalla (`identidades/*`). Sin
 * dependencias de servidor.
 */

/** Campos que el principal puede tomar del secundario (lista de la RPC). */
export const CAMPOS_FUSION = ['first_name', 'last_name', 'company_name', 'trade_name', 'identification_type', 'identification_number', 'email', 'phone', 'address', 'city'] as const;
export type CampoFusion = (typeof CAMPOS_FUSION)[number];

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
  created_at: string;
  conversations_count: number;
  opportunities_count: number;
}

export interface GrupoDuplicados {
  identity_type: 'phone' | 'email' | 'document';
  identity_value: string;
  customers: ClienteDuplicado[];
}

/** Quita los grupos de dos que alguien marcó como «no son el mismo». */
export function sinParejasExcluidas(grupos: readonly GrupoDuplicados[], excluidas: readonly { customer_a: string; customer_b: string }[]): GrupoDuplicados[] {
  const claves = new Set(excluidas.map((e) => [e.customer_a, e.customer_b].sort().join(':')));
  return grupos.filter((g) => !(g.customers.length === 2 && claves.has(g.customers.map((c) => c.id).sort().join(':'))));
}


/**
 * Filas de la comparación (Figma CRM 1436:843123 «Comparar y fusionar»). Cada
 * fila elige UN origen para todos sus campos: «Contacto» es nombre y apellido,
 * «Dirección» es dirección y ciudad. `opcional`: solo se dibuja si alguno de
 * los dos tiene el dato.
 */
export const GRUPOS_COMPARACION = [
  { id: 'razonSocial', campos: ['company_name'], separador: ' ' },
  { id: 'nombreComercial', campos: ['trade_name'], separador: ' ', opcional: true },
  { id: 'documento', campos: ['identification_number', 'identification_type'], separador: ' ' },
  { id: 'contacto', campos: ['first_name', 'last_name'], separador: ' ' },
  { id: 'telefono', campos: ['phone'], separador: ' ' },
  { id: 'correo', campos: ['email'], separador: ' ' },
  { id: 'direccion', campos: ['address', 'city'], separador: ', ' },
] as const satisfies readonly { id: string; campos: readonly CampoFusion[]; separador: string; opcional?: boolean }[];
export type GrupoComparacion = (typeof GRUPOS_COMPARACION)[number];
export type IdGrupoComparacion = GrupoComparacion['id'];

/** Tablas que la RPC mueve al principal (lista cerrada en el servidor). */
export const TABLAS_MOVIDAS = ['conversations', 'opportunities', 'calls', 'customer_channel_identities', 'invoice_sales', 'activities', 'campaign_contacts'] as const;
export type TablaMovida = (typeof TABLAS_MOVIDAS)[number];

/** Motivo que la RPC guarda en el snapshot (`reason`). */
export type MotivoFusion = 'document' | 'email' | 'phone' | 'manual';

/** Cliente de la comparación: los campos de la fusión más lo que se mueve y lo que se queda. */
export interface ClienteComparado extends ClienteDuplicado {
  customer_type: string | null;
  lead_source: string | null;
  /** Identidades de WhatsApp (valor) ligadas a este cliente. */
  whatsapp: string[];
  conteos: {
    conversaciones: number;
    oportunidades: number;
    llamadas: number;
    identidades: number;
    facturas: number;
    /** Facturas no borrador o enviadas a la DIAN: bloquean la fusión si están en el secundario. */
    facturasEmitidas: number;
    /** Lo que NO se mueve: queda en el registro archivado. */
    ventas: number;
    cartera: number;
  };
}

export type EstadoDeshacer = 'deshacible' | 'deshecha' | 'vencida' | 'dependiente' | 'soloAdministrador';

/** Días durante los que `crm_unmerge_customer` acepta deshacer. */
export const DIAS_DESHACER = 30;

/**
 * Lo mismo que comprueba `crm_unmerge_customer`, para decidir qué se pinta
 * (botón o badge). La RPC vuelve a comprobarlo todo: esto no autoriza nada.
 */
export function estadoDeshacer(
  f: { id: string; merged_at: string; undone_at: string | null },
  dependientesActivos: ReadonlySet<string>,
  esAdministrador: boolean,
  ahora: number = Date.now(),
): EstadoDeshacer {
  if (f.undone_at) return 'deshecha';
  if (ahora - Date.parse(f.merged_at) > DIAS_DESHACER * 86_400_000) return 'vencida';
  if (dependientesActivos.has(f.id)) return 'dependiente';
  return esAdministrador ? 'deshacible' : 'soloAdministrador';
}

/** Ids de las fusiones de las que depende alguna fusión activa (no deshecha). */
export function idsConDependientes(fusiones: readonly { undone_at: string | null; depends_on: readonly string[] | null }[]): Set<string> {
  return new Set(fusiones.filter((f) => !f.undone_at).flatMap((f) => f.depends_on ?? []));
}

export interface FusionHistorial {
  id: string;
  principal: { id: string; nombre: string | null };
  secundario: { id: string; nombre: string | null };
  motivo: MotivoFusion;
  movidos: { tabla: TablaMovida; n: number }[];
  quien: string | null;
  merged_at: string;
  undone_at: string | null;
  estado: EstadoDeshacer;
}
