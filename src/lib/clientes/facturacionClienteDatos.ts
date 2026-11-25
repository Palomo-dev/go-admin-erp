/**
 * Datos de facturación electrónica del cliente: lectura y guardado desde el NAVEGADOR (cliente
 * Supabase de `@/lib/supabase/config`, con la sesión y RLS por pertenencia), igual que la ficha y
 * «Editar cliente». La revisión del documento de un pedido web va por la ruta del servidor
 * (`/api/web-orders/[id]/revision-factura`), que la aplica con la sesión en la base.
 *
 * Las reglas (DV, correo, IVA 48/49, estado de la tarjeta) viven en `facturacionElectronica.ts`.
 */
import { supabase } from '@/lib/supabase/config';
import {
  claveDocumento,
  conResponsabilidadIva,
  correoFacturaParaGuardar,
  dvAutomatico,
  esTipoNit,
  tributoIdDeIva,
  type ClienteFacturacion,
  type FormularioFacturacionValidable,
  type DecisionRevision,
  type ResultadoRevision,
} from './facturacionElectronica';

export interface FichaFacturacion extends ClienteFacturacion {
  id: string;
  organization_id: number;
  full_name?: string | null;
  trade_name?: string | null;
  tribute_id?: number | null;
  parent_customer_id?: string | null;
}

export interface MunicipioDian {
  id: string;
  nombre: string;
  codigo: string;
  departamento: string | null;
}

export interface EmpresaLigada {
  id: string;
  nombre: string;
  identification_type: string | null;
  identification_number: string | null;
  dv: number | null;
  cargo: string | null;
  principal: boolean;
}

export interface DatosFacturacionCliente {
  ficha: FichaFacturacion;
  municipio: MunicipioDian | null;
  /** Persona: empresas a cuyo nombre también puede facturar (la principal primero). */
  empresas: EmpresaLigada[];
  /** Empresa: cuántas personas facturan a su nombre (contactos ligados). */
  personasLigadas: number;
}

const COLUMNAS_FICHA =
  'id, organization_id, customer_type, identification_type, identification_number, dv, first_name, last_name, full_name, company_name, trade_name, email, billing_email, tribute_id, fiscal_municipality_id, fiscal_responsibilities, parent_customer_id';

type Uno<T> = T | T[] | null | undefined;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function municipioDian(id: string | null | undefined): Promise<MunicipioDian | null> {
  if (!id) return null;
  const { data } = await supabase.from('municipalities').select('id, name, code, state_name').eq('id', id).maybeSingle();
  const m = data as { id: string; name: string; code: string; state_name: string | null } | null;
  return m ? { id: m.id, nombre: m.name, codigo: m.code, departamento: m.state_name } : null;
}

/** Municipios de Colombia para el selector «Municipio (DIAN)» (la factura electrónica es de la DIAN). */
export async function municipiosDian(): Promise<MunicipioDian[]> {
  const { data } = await supabase.from('municipalities').select('id, name, code, state_name').eq('country_code', 'COL').order('name').limit(2000);
  return ((data ?? []) as Array<{ id: string; name: string; code: string; state_name: string | null }>).map((m) => ({
    id: m.id,
    nombre: m.name,
    codigo: m.code,
    departamento: m.state_name,
  }));
}

/** Catálogo de responsabilidades (casilla 53 del RUT). */
export async function catalogoResponsabilidades(): Promise<Array<{ code: string; description: string }>> {
  const { data } = await supabase.from('dian_fiscal_responsibilities').select('code, description').order('sort_order');
  return (data ?? []) as Array<{ code: string; description: string }>;
}

interface FilaEnlace {
  is_primary?: boolean | null;
  position?: string | null;
  company?: Uno<{ id: string; full_name?: string | null; company_name?: string | null; identification_type?: string | null; identification_number?: string | null; dv?: number | null }>;
}

export async function cargarFacturacionCliente(organizationId: number, clienteId: string): Promise<DatosFacturacionCliente | null> {
  const { data, error } = await supabase.from('customers').select(COLUMNAS_FICHA).eq('id', clienteId).eq('organization_id', organizationId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const ficha = data as FichaFacturacion;
  const municipio = await municipioDian(ficha.fiscal_municipality_id);

  let empresas: EmpresaLigada[] = [];
  let personasLigadas = 0;
  if (ficha.customer_type === 'company') {
    const { count } = await supabase
      .from('customer_company_links')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('company_id', clienteId);
    personasLigadas = count ?? 0;
  } else {
    const { data: enlaces } = await supabase
      .from('customer_company_links')
      .select('is_primary, position, company:customers!customer_company_links_company_id_fkey(id, full_name, company_name, identification_type, identification_number, dv)')
      .eq('organization_id', organizationId)
      .eq('person_id', clienteId)
      .order('is_primary', { ascending: false });
    empresas = ((enlaces ?? []) as FilaEnlace[])
      .map((l) => {
        const c = uno(l.company);
        if (!c) return null;
        return {
          id: c.id,
          nombre: c.company_name || c.full_name || '',
          identification_type: c.identification_type ?? null,
          identification_number: c.identification_number ?? null,
          dv: c.dv ?? null,
          cargo: l.position ?? null,
          principal: l.is_primary === true || c.id === ficha.parent_customer_id,
        };
      })
      .filter((e): e is EmpresaLigada => e !== null);
    // La empresa del pedido web queda en parent_customer_id aunque no tenga enlace: también cuenta.
    if (ficha.parent_customer_id && !empresas.some((e) => e.id === ficha.parent_customer_id)) {
      const { data: padre } = await supabase
        .from('customers')
        .select('id, full_name, company_name, identification_type, identification_number, dv')
        .eq('id', ficha.parent_customer_id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      const p = padre as { id: string; full_name?: string | null; company_name?: string | null; identification_type?: string | null; identification_number?: string | null; dv?: number | null } | null;
      if (p) {
        empresas.unshift({
          id: p.id,
          nombre: p.company_name || p.full_name || '',
          identification_type: p.identification_type ?? null,
          identification_number: p.identification_number ?? null,
          dv: p.dv ?? null,
          cargo: null,
          principal: true,
        });
      }
    }
    empresas.sort((a, b) => Number(b.principal) - Number(a.principal));
  }
  return { ficha, municipio, empresas, personasLigadas };
}

// ─── Documento repetido ───────────────────────────────────────────────────────

export interface FichaConDocumento {
  id: string;
  nombre: string;
  customer_type: string | null;
  identification_type: string | null;
  identification_number: string | null;
  dv: number | null;
}

/**
 * Otra ficha de la organización con el mismo documento (la base no admite dos: índice único
 * `unique_customer_id_per_org`). Se prueban las escrituras habituales: solo dígitos, con DV pegado
 * y con guion.
 */
export async function fichaConDocumento(organizationId: number, numero: string, tipo: string, excluirId: string): Promise<FichaConDocumento | null> {
  const clave = claveDocumento(numero);
  if (!clave) return null;
  const dv = dvAutomatico(tipo, clave);
  const variantes = Array.from(new Set([numero.trim(), clave, ...(dv !== null ? [`${clave}${dv}`, `${clave}-${dv}`] : [])].filter(Boolean)));
  const { data } = await supabase
    .from('customers')
    .select('id, full_name, company_name, customer_type, identification_type, identification_number, dv')
    .eq('organization_id', organizationId)
    .in('identification_number', variantes)
    .neq('id', excluirId)
    .limit(1);
  const f = (data ?? [])[0] as { id: string; full_name?: string | null; company_name?: string | null; customer_type?: string | null; identification_type?: string | null; identification_number?: string | null; dv?: number | null } | undefined;
  if (!f) return null;
  return {
    id: f.id,
    nombre: f.company_name || f.full_name || '',
    customer_type: f.customer_type ?? null,
    identification_type: f.identification_type ?? null,
    identification_number: f.identification_number ?? null,
    dv: f.dv ?? null,
  };
}

/** Error de la base por documento repetido (`unique_customer_id_per_org`). */
export function esDocumentoRepetido(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; details?: string };
  return /unique_customer_id_per_org/.test(`${e.message ?? ''} ${e.details ?? ''}`) || (e.code === '23505' && /identification/i.test(`${e.message ?? ''} ${e.details ?? ''}`));
}

// ─── Guardar ─────────────────────────────────────────────────────────────────

export interface DatosFacturacionFormulario extends FormularioFacturacionValidable {
  nombreComercial: string;
  responsabilidades: string[];
  /** Persona: empresa ligada principal (opcional). */
  empresaLigadaId: string;
}

/** La fila que se escribe en `customers` (sin columnas GENERATED: full_name, doc_type, doc_number). */
export function filaFacturacion(d: DatosFacturacionFormulario): Record<string, unknown> {
  const empresa = d.tipoPersona === 'company';
  const numero = d.numero.trim();
  const responsabilidades = d.iva ? conResponsabilidadIva(d.responsabilidades, d.iva) : d.responsabilidades;
  return {
    customer_type: d.tipoPersona,
    identification_type: d.tipoDocumento || null,
    identification_number: numero || null,
    // DV siempre calculado, nunca escrito a mano.
    dv: esTipoNit(d.tipoDocumento) ? dvAutomatico(d.tipoDocumento, numero) : null,
    first_name: empresa ? d.razonSocial.trim() : d.nombres.trim(),
    last_name: empresa ? '' : d.apellidos.trim(),
    company_name: empresa ? d.razonSocial.trim() || null : undefined,
    trade_name: empresa ? d.nombreComercial.trim() || null : undefined,
    billing_email: correoFacturaParaGuardar(d.correoFactura),
    fiscal_municipality_id: d.municipioId || null,
    fiscal_responsibilities: responsabilidades,
    ...(d.iva ? { tribute_id: tributoIdDeIva(d.iva) } : {}),
    legal_organization_id: empresa ? 1 : 2,
    ...(empresa ? {} : { parent_customer_id: d.empresaLigadaId || null }),
    updated_at: new Date().toISOString(),
  };
}

export async function guardarFacturacionCliente(organizationId: number, clienteId: string, d: DatosFacturacionFormulario): Promise<void> {
  const fila = Object.fromEntries(Object.entries(filaFacturacion(d)).filter(([, v]) => v !== undefined));
  const { error } = await supabase.from('customers').update(fila).eq('id', clienteId).eq('organization_id', organizationId);
  if (error) throw error;
  if (d.tipoPersona === 'person' && d.empresaLigadaId) {
    await ligarComoContacto(organizationId, clienteId, d.empresaLigadaId);
  }
}

/** La persona queda como contacto de la empresa (si ya lo era, no pasa nada). */
export async function ligarComoContacto(organizationId: number, personaId: string, empresaId: string): Promise<void> {
  const { data: existente } = await supabase
    .from('customer_company_links')
    .select('id')
    .eq('person_id', personaId)
    .eq('company_id', empresaId)
    .maybeSingle();
  if (existente) return;
  const { count } = await supabase.from('customer_company_links').select('id', { count: 'exact', head: true }).eq('person_id', personaId);
  const { error } = await supabase.from('customer_company_links').insert({
    organization_id: organizationId,
    person_id: personaId,
    company_id: empresaId,
    is_primary: (count ?? 0) === 0,
  });
  if (error) throw error;
}

/** Empresas de la organización para «Empresa ligada (opcional)». */
export async function empresasDeLaOrganizacion(organizationId: number, excluirId: string): Promise<Array<{ id: string; nombre: string }>> {
  const { data } = await supabase
    .from('customers')
    .select('id, company_name, trade_name, full_name')
    .eq('organization_id', organizationId)
    .eq('customer_type', 'company')
    .order('company_name')
    .limit(1000);
  return ((data ?? []) as Array<{ id: string; company_name?: string | null; trade_name?: string | null; full_name?: string | null }>)
    .filter((c) => c.id !== excluirId)
    .map((c) => ({ id: c.id, nombre: c.company_name || c.trade_name || c.full_name || '' }));
}

// ─── Pedidos web para revisar ─────────────────────────────────────────────────

export interface PedidoParaRevisar {
  id: string;
  order_number: string;
  billing_data: Record<string, unknown>;
  created_at: string | null;
}

/** Pedidos del cliente con documento de factura distinto u ocupado, sin revisar (los más recientes). */
export async function pedidosParaRevisar(organizationId: number, clienteId: string): Promise<PedidoParaRevisar[]> {
  const { data, error } = await supabase
    .from('web_orders')
    .select('id, order_number, billing_data, created_at')
    .eq('organization_id', organizationId)
    .eq('customer_id', clienteId)
    .in('billing_data->>perfil', ['distinto', 'duplicado'])
    .is('billing_data->revision', null)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return [];
  return (data ?? []) as PedidoParaRevisar[];
}

export class RevisionFacturaError extends Error {
  constructor(public readonly codigo: string) {
    super(codigo);
    this.name = 'RevisionFacturaError';
  }
}

export async function revisarFacturaPedido(orderId: string, decision: DecisionRevision): Promise<{ estado: ResultadoRevision; customerId: string | null }> {
  const r = await fetch(`/api/web-orders/${encodeURIComponent(orderId)}/revision-factura`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  const cuerpo = (await r.json().catch(() => null)) as { error?: string; estado?: ResultadoRevision; customerId?: string | null } | null;
  if (!r.ok) throw new RevisionFacturaError(cuerpo?.error ?? 'desconocido');
  return { estado: cuerpo?.estado ?? 'no_aplica', customerId: cuerpo?.customerId ?? null };
}

/** Nombre de una ficha (la que factura un pedido). */
export async function nombreFicha(organizationId: number, id: string): Promise<{ id: string; nombre: string; identification_type: string | null; identification_number: string | null; dv: number | null } | null> {
  const { data } = await supabase
    .from('customers')
    .select('id, full_name, company_name, identification_type, identification_number, dv')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle();
  const f = data as { id: string; full_name?: string | null; company_name?: string | null; identification_type?: string | null; identification_number?: string | null; dv?: number | null } | null;
  return f ? { id: f.id, nombre: f.company_name || f.full_name || '', identification_type: f.identification_type ?? null, identification_number: f.identification_number ?? null, dv: f.dv ?? null } : null;
}
