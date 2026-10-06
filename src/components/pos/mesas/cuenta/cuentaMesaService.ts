/**
 * Datos de la cuenta de una mesa (Figma «POS — Mesas: flujo completo de
 * atención»). Cada acción va por su RPC transaccional
 * (`supabase/migrations/20261006164925_pos_mesas_flujo_atencion.sql`): la
 * organización la saca la base de la fila y exige pertenencia y sede.
 *
 * Mientras la migración no esté aplicada, cada acción cae a su respaldo de
 * siempre (los servicios que ya usaba la mesa) para que la pantalla no se
 * rompa: `esFuncionFaltante` decide cuándo.
 */
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { POSService } from '@/lib/services/posService';
import { getPublicUrl } from '@/lib/supabase/imageUtils';
import { PedidosService } from '@/components/pos/mesas/id/pedidosService';
import { MesasService } from '@/components/pos/mesas/mesasService';
import { reservasMesasService } from '@/components/pos/reservas-mesas/reservasMesasService';
import type { Product, CartItemModifier, Customer } from '@/components/pos/types';
import type { ProductToAdd, TableSessionWithDetails } from '@/components/pos/mesas/id/types';
import {
  aLineaMesa,
  escribirNotaMesa,
  leerNotaMesa,
  notasDeLinea,
  type ComandaMesa,
  type LineaGuardadaMesa,
  type LineaMesa,
  type NotaMesa,
} from './cuentaMesaLogica';

/** La función o la columna aún no existe (migración sin aplicar). */
export function esFuncionFaltante(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === 'PGRST202' ||
    e.code === '42883' ||
    e.code === 'PGRST204' ||
    e.code === '42703' ||
    /could not find the function|does not exist|schema cache/i.test(e.message ?? '')
  );
}

/** Código del error de la RPC («mesa_ocupada», «sin_acceso_sucursal»…). */
export function codigoError(error: unknown): string {
  const e = error as { message?: string; code?: string } | null;
  const m = (e?.message ?? '').trim();
  if (/^[a-z_]+$/i.test(m)) return m;
  if (e?.code === '42501') return 'sin_acceso';
  return 'error';
}

export interface MesaCuenta {
  id: string;
  nombre: string;
  zona: string | null;
  capacidad: number;
  estado: string;
  branchId: number | null;
}

export interface CuentaMesa {
  mesa: MesaCuenta;
  sesion: TableSessionWithDetails | null;
  lineas: LineaMesa[];
  comandas: ComandaMesa[];
  nota: NotaMesa;
  meseroNombre: string | null;
  cliente: Customer | null;
  /** Último movimiento de la cuenta (para «mesa abierta sin movimiento»). */
  ultimoMovimiento: string | null;
}

async function nombreDePerfil(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle();
  if (!data) return null;
  return `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || null;
}

function notaDeSesion(sesion: Record<string, unknown> | null): NotaMesa {
  if (!sesion) return leerNotaMesa(null);
  if (sesion.service_notes) return leerNotaMesa(sesion.service_notes);
  // Respaldo sin la columna: la nota viaja como JSON en `notes`.
  const notes = sesion.notes;
  if (typeof notes === 'string' && notes.trim().startsWith('{')) {
    try {
      return leerNotaMesa(JSON.parse(notes));
    } catch {
      return leerNotaMesa(null);
    }
  }
  return leerNotaMesa(null);
}

export async function cargarCuentaMesa(tableId: string): Promise<CuentaMesa> {
  const organizationId = getOrganizationId();
  const { data: mesaRow, error: mesaError } = await supabase
    .from('restaurant_tables')
    .select('id, name, zone, capacity, state, branch_id')
    .eq('id', tableId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (mesaError) throw mesaError;
  if (!mesaRow) throw Object.assign(new Error('mesa_no_encontrada'), { code: 'mesa_no_encontrada' });
  const mesa: MesaCuenta = {
    id: mesaRow.id,
    nombre: mesaRow.name,
    zona: mesaRow.zone,
    capacidad: Number(mesaRow.capacity) || 0,
    estado: mesaRow.state,
    branchId: mesaRow.branch_id ?? null,
  };

  const sesion = await PedidosService.obtenerDetalleMesa(tableId);
  if (!sesion) {
    return { mesa, sesion: null, lineas: [], comandas: [], nota: leerNotaMesa(null), meseroNombre: null, cliente: null, ultimoMovimiento: null };
  }

  const [comandasRes, meseroNombre, clienteRes] = await Promise.all([
    supabase
      .from('kitchen_tickets')
      .select('id, created_at, updated_at, status, ticket_type, round_key')
      .eq('table_session_id', sesion.id)
      .order('created_at', { ascending: true }),
    nombreDePerfil(sesion.server_id),
    sesion.sales?.customer_id
      ? supabase.from('customers').select('*').eq('id', sesion.sales.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const comandas = ((comandasRes as { data: ComandaMesa[] | null }).data ?? []) as ComandaMesa[];
  const lineas = ((sesion.sale_items ?? []) as unknown as LineaGuardadaMesa[]).map((l) =>
    aLineaMesa(l, comandas, (ruta) => getPublicUrl(ruta)),
  );
  const movimientos = [
    sesion.opened_at,
    ...((sesion.sale_items ?? []) as Array<{ updated_at?: string | null; created_at?: string | null }>).map((l) => l.updated_at ?? l.created_at ?? null),
    ...comandas.map((c) => c.updated_at ?? c.created_at),
  ].filter((v): v is string => !!v);
  return {
    mesa,
    sesion,
    lineas,
    comandas,
    nota: notaDeSesion(sesion as unknown as Record<string, unknown>),
    meseroNombre,
    cliente: ((clienteRes as { data: Customer | null }).data ?? null) as Customer | null,
    ultimoMovimiento: movimientos.sort().pop() ?? null,
  };
}

// ── Abrir la mesa (D1/T1) ────────────────────────────────────────────────────

export interface DatosAbrirMesa {
  mesaId: string;
  comensales: number;
  meseroId?: string | null;
  clienteId?: string | null;
  reservaId?: string | null;
}

export async function abrirMesa(d: DatosAbrirMesa): Promise<{ sesionId: string | null }> {
  const { data, error } = await supabase.rpc('pos_mesa_abrir', {
    p_table_id: d.mesaId,
    p_customers: d.comensales,
    p_server_id: d.meseroId ?? null,
    p_customer_id: d.clienteId ?? null,
    p_reservation_id: d.reservaId ?? null,
  });
  if (!error) return { sesionId: (data as { table_session_id?: string } | null)?.table_session_id ?? null };
  if (!esFuncionFaltante(error)) throw error;

  // Respaldo: los caminos de siempre (sentar la reserva o abrir la sesión).
  let sesionId: string | null = null;
  if (d.reservaId) {
    const r = await reservasMesasService.sentarReserva(d.reservaId, d.mesaId, d.comensales);
    sesionId = r?.tableSessionId ?? null;
  } else {
    const sesion = await MesasService.abrirSesion(d.mesaId, { customers: d.comensales, serverId: d.meseroId ?? undefined });
    sesionId = sesion.id;
  }
  if (sesionId && d.meseroId) await MesasService.cambiarMesero(sesionId, d.meseroId).catch(() => undefined);
  return { sesionId };
}

// ── Cliente (D2) ─────────────────────────────────────────────────────────────

export async function asignarClienteMesa(sesionId: string, saleId: string | null, clienteId: string | null): Promise<void> {
  const { error } = await supabase.rpc('pos_mesa_asignar_cliente', { p_session_id: sesionId, p_customer_id: clienteId });
  if (!error) return;
  if (!esFuncionFaltante(error)) throw error;
  // Respaldo: sin venta todavía, el cliente se guardará con la primera línea.
  if (!saleId) return;
  const { error: e2 } = await supabase
    .from('sales')
    .update({ customer_id: clienteId, updated_at: new Date().toISOString() })
    .eq('id', saleId)
    .eq('status', 'pending');
  if (e2) throw e2;
}

// ── Agregar productos (D3/D4): la línea nace «Por enviar» ─────────────────────

export async function agregarProductoMesa(
  sesionId: string,
  producto: Product,
  modificadores: CartItemModifier[] | undefined,
  cantidad: number,
  extra?: { comensal?: number | null; pesaje?: ProductToAdd['pesaje']; /** Precio ya resuelto con modificadores (la pesada lo trae). */ precio?: number },
): Promise<string[]> {
  const extraMods = (modificadores ?? []).reduce((s, m) => s + (Number(m.extraPrice) || 0), 0);
  let precio = 0;
  if (extra?.precio !== undefined) {
    precio = extra.precio - extraMods;
  } else {
    // Sin precio vigente no entra gratis: el error lo pinta la pantalla.
    precio = await POSService.precioVigenteProducto(producto.id, producto.name);
  }
  const linea: ProductToAdd = {
    product_id: producto.id,
    product_name: producto.name,
    quantity: cantidad,
    unit_price: precio + extraMods,
    notes: '',
    category_id: producto.category_id ?? null,
    parent_product_id: producto.parent_product_id ?? null,
    sale_mode: producto.sale_mode ?? null,
    qty_decimals: producto.qty_decimals ?? null,
    unit_code: producto.unit_code ?? null,
    ...(modificadores && modificadores.length > 0 ? { modifiers: modificadores } : {}),
    ...(extra?.comensal ? { guest_number: extra.comensal } : {}),
    ...(extra?.pesaje ? { pesaje: extra.pesaje } : {}),
  };
  return PedidosService.agregarProductos(sesionId, [linea], { porEnviar: true });
}

// ── Línea: comensal, nota y alergia (T3) ─────────────────────────────────────

export interface CambioLineaMesa {
  comensal?: number | null;
  notaCocina?: string | null;
  alergia?: boolean;
  notaCliente?: string | null;
}

export async function guardarLineaMesa(lineaId: string, cambio: CambioLineaMesa): Promise<void> {
  const { data, error } = await supabase.from('sale_items').select('notes').eq('id', lineaId).maybeSingle();
  if (error) throw error;
  const notas = { ...notasDeLinea((data?.notes ?? null) as LineaGuardadaMesa['notes']) };
  if (cambio.comensal !== undefined) {
    if (cambio.comensal) notas.guest_number = cambio.comensal;
    else delete notas.guest_number;
  }
  if (cambio.notaCocina !== undefined) {
    const t = (cambio.notaCocina ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (t) notas.extra = t;
    else delete notas.extra;
  }
  if (cambio.alergia !== undefined) {
    if (cambio.alergia && notas.extra) notas.is_allergy = true;
    else delete notas.is_allergy;
  }
  if (cambio.notaCliente !== undefined) {
    const t = (cambio.notaCliente ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (t) notas.customer_note = t;
    else delete notas.customer_note;
  }
  const { error: e2 } = await supabase.from('sale_items').update({ notes: notas, updated_at: new Date().toISOString() }).eq('id', lineaId);
  if (e2) throw e2;
}

// ── Nota de la mesa (D6) ─────────────────────────────────────────────────────

export async function guardarNotaMesa(sesionId: string, nota: NotaMesa, comensales: number): Promise<void> {
  const valor = escribirNotaMesa(nota);
  const { error } = await supabase
    .from('table_sessions')
    .update({ service_notes: valor, customers: comensales, updated_at: new Date().toISOString() })
    .eq('id', sesionId);
  if (!error) return;
  if (!esFuncionFaltante(error)) throw error;
  const { error: e2 } = await supabase
    .from('table_sessions')
    .update({ notes: JSON.stringify(valor), customers: comensales, updated_at: new Date().toISOString() })
    .eq('id', sesionId);
  if (e2) throw e2;
}

// ── Enviar la ronda (D5/T4) ──────────────────────────────────────────────────

export interface ResultadoRonda {
  ronda: number | null;
  lineas: number;
  estaciones: Array<{ station: string; lineas: number }>;
  yaEnviada: boolean;
}

export async function enviarRondaMesa(sesion: TableSessionWithDetails, roundKey: string): Promise<ResultadoRonda> {
  const { data, error } = await supabase.rpc('pos_mesa_enviar_ronda', { p_session_id: sesion.id, p_round_key: roundKey });
  if (!error) {
    const r = (data ?? {}) as { ronda?: number; lineas?: number; estaciones?: Array<{ station: string; lineas: number }>; ya_enviada?: boolean };
    return { ronda: r.ronda ?? null, lineas: r.lineas ?? 0, estaciones: r.estaciones ?? [], yaEnviada: !!r.ya_enviada };
  }
  if (!esFuncionFaltante(error)) throw error;
  return enviarRondaRespaldo(sesion, roundKey);
}

/**
 * Respaldo SIN la migración: lo mismo que hace la RPC, desde el navegador y
 * con la regla única de cocina (`fn_lineas_a_cocina`, ya aplicada). Es lo que
 * hacía la mesa antes (la comanda la creaba el navegador al agregar).
 */
async function enviarRondaRespaldo(sesion: TableSessionWithDetails, roundKey: string): Promise<ResultadoRonda> {
  const organizationId = getOrganizationId();
  if (!sesion.sale_id) return { ronda: null, lineas: 0, estaciones: [], yaEnviada: false };
  const { data: lineas, error } = await supabase
    .from('sale_items')
    .select('id, quantity, notes, created_at, product:products!sale_items_product_id_fkey(name, variant_data)')
    .eq('sale_id', sesion.sale_id)
    .is('paid_at', null);
  if (error) throw error;
  type Fila = { id: string; quantity: number; notes: Record<string, unknown> | null; product: { name?: string; variant_data?: Record<string, string> | null } | null };
  const filas = ((lineas ?? []) as unknown as Fila[]).filter((l) => l.notes?.por_enviar === true);
  if (filas.length === 0) return { ronda: null, lineas: 0, estaciones: [], yaEnviada: false };
  const rondaPrevia = ((sesion.sale_items ?? []) as unknown as LineaGuardadaMesa[])
    .map((l) => Number(notasDeLinea(l.notes).ronda) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const { count } = await supabase
    .from('kitchen_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('table_session_id', sesion.id)
    .eq('ticket_type', 'order');
  const ronda = Math.max(rondaPrevia, count ?? 0) + 1;
  const { data: aCocina } = await supabase.rpc('fn_lineas_a_cocina', {
    p_organization_id: organizationId,
    p_sale_item_ids: filas.map((f) => f.id),
  });
  const cocina = ((aCocina ?? []) as Array<{ sale_item_id: string; station: string | null }>);
  const estaciones = new Map<string, number>();
  if (cocina.length > 0) {
    const conAlergia = filas.some((f) => f.notes?.is_allergy === true && !!f.notes?.extra);
    const { data: ticket, error: eT } = await supabase
      .from('kitchen_tickets')
      .insert({
        organization_id: organizationId,
        branch_id: sesion.sales?.branch_id ?? null,
        table_session_id: sesion.id,
        sale_id: sesion.sale_id,
        status: 'new',
        priority: 0,
        source: 'pos',
        round_key: roundKey,
        ticket_type: 'order',
        has_allergy: conAlergia,
      })
      .select('id')
      .single();
    if (eT) throw eT;
    const items = cocina.map((c) => {
      const f = filas.find((x) => x.id === c.sale_item_id)!;
      const nota = typeof f.notes?.extra === 'string' ? f.notes.extra : null;
      const comensal = f.notes?.guest_number ? `Comensal ${f.notes.guest_number}` : null;
      estaciones.set(c.station ?? '', (estaciones.get(c.station ?? '') ?? 0) + 1);
      return {
        organization_id: organizationId,
        kitchen_ticket_id: ticket.id,
        sale_item_id: f.id,
        station: c.station,
        notes: [comensal, nota].filter(Boolean).join(' - ') || null,
        status: 'pending',
        product_name: (f.notes?.product_name as string) || f.product?.name || 'Producto',
        quantity: f.quantity,
        variant_data: f.product?.variant_data ?? null,
        modifiers: Array.isArray(f.notes?.modifiers) && (f.notes?.modifiers as unknown[]).length > 0
          ? (f.notes?.modifiers as Array<{ name: string; extraPrice?: number }>).map((m) => ({ name: m.name, extraPrice: Number(m.extraPrice) || 0 }))
          : null,
        is_allergy: f.notes?.is_allergy === true && !!nota,
      };
    });
    const { error: eI } = await supabase.from('kitchen_ticket_items').insert(items);
    if (eI) throw eI;
  }
  const ahora = new Date().toISOString();
  for (const f of filas) {
    const notas = { ...(f.notes ?? {}) };
    delete notas.por_enviar;
    notas.ronda = ronda;
    notas.round_key = roundKey;
    notas.enviada_at = ahora;
    const { error: eU } = await supabase.from('sale_items').update({ notes: notas }).eq('id', f.id);
    if (eU) throw eU;
  }
  return {
    ronda,
    lineas: filas.length,
    estaciones: Array.from(estaciones.entries()).map(([station, n]) => ({ station, lineas: n })),
    yaEnviada: false,
  };
}

// ── Servido (D6) ─────────────────────────────────────────────────────────────

export async function marcarServido(lineaIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('pos_mesa_marcar_servido', { p_sale_item_ids: lineaIds });
  if (!error) return;
  if (!esFuncionFaltante(error)) throw error;
  const { error: e2 } = await supabase
    .from('kitchen_ticket_items')
    .update({ status: 'delivered', updated_at: new Date().toISOString() })
    .in('sale_item_id', lineaIds)
    .not('status', 'in', '(delivered,cancelled)');
  if (e2) throw e2;
}

// ── Estado de la mesa: «Por limpiar» y «Lista» (D11/T8) ───────────────────────

/** Devuelve false si la base aún no conoce el estado (migración sin aplicar). */
export async function marcarEstadoMesa(tableId: string, estado: 'cleaning' | 'free'): Promise<boolean> {
  const { error } = await supabase.rpc('pos_mesa_marcar_estado', { p_table_id: tableId, p_estado: estado });
  if (!error) return true;
  if (esFuncionFaltante(error)) return false;
  throw error;
}

// ── Mover, unir o transferir (D7) ────────────────────────────────────────────

export type ModoMover = 'cuenta' | 'productos' | 'unir';

export async function moverMesa(
  sesionId: string,
  origenId: string,
  destinoId: string,
  modo: ModoMover,
  lineaIds: string[] = [],
): Promise<void> {
  const { error } = await supabase.rpc('pos_mesa_mover', {
    p_session_id: sesionId,
    p_table_destino: destinoId,
    p_modo: modo,
    p_sale_item_ids: modo === 'productos' ? lineaIds : null,
  });
  if (!error) return;
  if (!esFuncionFaltante(error)) throw error;
  // Respaldo: los servicios de siempre.
  if (modo === 'cuenta') {
    await MesasService.moverPedido(sesionId, destinoId);
  } else if (modo === 'unir') {
    await MesasService.combinarMesas(destinoId, [origenId]);
  } else {
    const destino = await PedidosService.obtenerDetalleMesa(destinoId);
    if (!destino) await MesasService.abrirSesion(destinoId, { customers: 1 });
    for (const id of lineaIds) {
      const { data } = await supabase.from('sale_items').select('quantity').eq('id', id).maybeSingle();
      await PedidosService.transferirItem(id, destinoId, Number(data?.quantity) || 1);
    }
  }
}

// ── Meseros de la organización (D1, «Cambiar mesero») ─────────────────────────

export interface OpcionMesero {
  id: string;
  nombre: string;
}

export async function listarMeseros(organizationId: number): Promise<OpcionMesero[]> {
  const { data, error } = await supabase.rpc('get_profiles_by_organization', { org_id: organizationId });
  if (error) throw error;
  const vistos = new Set<string>();
  const lista: OpcionMesero[] = [];
  for (const m of (data ?? []) as Array<{ user_id?: string; id?: string; first_name?: string; last_name?: string; email?: string; is_active?: boolean }>) {
    if (m.is_active === false) continue;
    const id = m.user_id || m.id;
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    lista.push({ id, nombre: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || id });
  }
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
