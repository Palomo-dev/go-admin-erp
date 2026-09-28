'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { claveStock, type FilaSerial } from './listadoSeriales';

/**
 * Seriales del producto y de sus variantes, con el nombre del cliente y de la
 * sucursal actual (mismos joins que `serialTrackingService.getSerials`), y el
 * stock por (producto, sucursal) para calcular el cupo de generación.
 *
 * Lectura con el cliente del navegador: RLS de `serial_numbers` y
 * `stock_levels` por pertenencia a la organización. Se pide por páginas de
 * 1000 porque PostgREST corta ahí.
 */

const PAGINA = 1000;
const MAX_PAGINAS = 50;

interface FilaBd {
  id: number;
  product_id: number;
  serial: string;
  status: string;
  branch_id: number | null;
  current_branch_id: number | null;
  sold_to_customer_id: string | null;
  sale_date: string | null;
  warranty_start: string | null;
  warranty_end: string | null;
  warranty_months: number | null;
  cost_at_purchase: number | string | null;
  price_at_sale: number | string | null;
  received_date: string | null;
  created_at: string;
  customers: { full_name: string | null } | { full_name: string | null }[] | null;
  current_branch: { name: string | null } | { name: string | null }[] | null;
}

const SELECT = `id, product_id, serial, status, branch_id, current_branch_id, sold_to_customer_id, sale_date,
  warranty_start, warranty_end, warranty_months, cost_at_purchase, price_at_sale, received_date, created_at,
  customers:sold_to_customer_id (full_name),
  current_branch:current_branch_id (name)`;

function uno<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function numero(v: number | string | null): number | null {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function aFila(r: FilaBd): FilaSerial {
  return {
    id: r.id,
    product_id: r.product_id,
    serial: r.serial,
    status: r.status,
    branch_id: r.branch_id,
    current_branch_id: r.current_branch_id,
    sold_to_customer_id: r.sold_to_customer_id,
    sale_date: r.sale_date,
    warranty_start: r.warranty_start,
    warranty_end: r.warranty_end,
    warranty_months: r.warranty_months,
    cost_at_purchase: numero(r.cost_at_purchase),
    price_at_sale: numero(r.price_at_sale),
    received_date: r.received_date,
    created_at: r.created_at,
    cliente: uno(r.customers)?.full_name ?? null,
    sucursal: uno(r.current_branch)?.name ?? null,
  };
}

async function leerSeriales(organizacionId: number, ids: number[]): Promise<FilaSerial[]> {
  const salida: FilaSerial[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * PAGINA;
    const { data, error } = await supabase
      .from('serial_numbers')
      .select(SELECT)
      .eq('organization_id', organizacionId)
      .in('product_id', ids)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const filas = (data ?? []) as unknown as FilaBd[];
    salida.push(...filas.map(aFila));
    if (filas.length < PAGINA) break;
  }
  return salida;
}

async function leerStock(ids: number[]): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('stock_levels').select('product_id, branch_id, qty_on_hand').in('product_id', ids);
  if (error) throw error;
  const mapa = new Map<string, number>();
  for (const s of (data ?? []) as { product_id: number; branch_id: number; qty_on_hand: number | string | null }[]) {
    const k = claveStock(Number(s.product_id), Number(s.branch_id));
    mapa.set(k, (mapa.get(k) ?? 0) + (Number(s.qty_on_hand) || 0));
  }
  return mapa;
}

export interface EstadoSerialesProducto {
  filas: FilaSerial[];
  /** Stock por `claveStock(producto, sucursal)`. */
  stock: Map<string, number>;
  cargando: boolean;
  error: boolean;
  recargar: () => Promise<void>;
}

export function useSerialesProducto(organizacionId: number, productIds: readonly number[], activo: boolean): EstadoSerialesProducto {
  const [filas, setFilas] = useState<FilaSerial[]>([]);
  const [stock, setStock] = useState<Map<string, number>>(() => new Map());
  const [cargando, setCargando] = useState(activo);
  const [error, setError] = useState(false);
  const turno = useRef(0);
  const clave = productIds.join(',');

  const recargar = useCallback(async () => {
    if (!activo || !clave) {
      setCargando(false);
      return;
    }
    const ids = clave.split(',').map(Number);
    const mio = ++turno.current;
    setCargando(true);
    try {
      const [s, st] = await Promise.all([leerSeriales(organizacionId, ids), leerStock(ids)]);
      if (mio !== turno.current) return;
      setFilas(s);
      setStock(st);
      setError(false);
    } catch (e) {
      if (mio !== turno.current) return;
      console.error('Error cargando seriales del producto:', e);
      setError(true);
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [organizacionId, clave, activo]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { filas, stock, cargando, error, recargar };
}
