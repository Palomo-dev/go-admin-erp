import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { esCuentaDeMovimiento } from '@/lib/finanzas/contabilidad/cuentaLinea';
import {
  aCuentaEfectiva,
  type ConsultaCuenta,
  type CuentaEfectiva,
  type DocumentoCuenta,
  type RolCuenta,
  type SugerenciaCuenta,
} from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { mensajeErrorAsiento } from '../ContabilidadService';

export interface CuentaDeMovimiento {
  account_code: string;
  name: string;
}

export interface PaginaCuentas {
  items: CuentaDeMovimiento[];
  total: number;
}

export interface CategoriaContable {
  id: number;
  name: string;
  parent_id: number | null;
  productos: number;
  cuenta_ingreso: string | null;
  cuenta_costo: string | null;
  cuenta_inventario: string | null;
  cuenta_devolucion: string | null;
}

const POR_PAGINA = 30;

function organizacionId(): number {
  const org = obtenerOrganizacionActiva();
  if (!org?.id) throw new Error('No hay una organización activa');
  return org.id;
}

function normalizar(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

let plan: { org: number; cuentas: Promise<CuentaDeMovimiento[]> } | null = null;

export function cuentasDeMovimiento(): Promise<CuentaDeMovimiento[]> {
  const org = organizacionId();
  if (plan?.org === org) return plan.cuentas;
  const cuentas = supabase
    .from('chart_of_accounts')
    .select('account_code, name, parent_code, is_active, es_movimiento')
    .eq('organization_id', org)
    .order('account_code')
    .then(({ data, error }) => {
      if (error) throw error;
      const todas = (data ?? []) as (CuentaDeMovimiento & { parent_code: string | null; is_active: boolean | null; es_movimiento: boolean | null })[];
      return todas.filter((c) => esCuentaDeMovimiento(c, todas)).map((c) => ({ account_code: c.account_code, name: c.name }));
    });
  plan = { org, cuentas: cuentas as Promise<CuentaDeMovimiento[]> };
  (cuentas as Promise<CuentaDeMovimiento[]>).catch(() => {
    plan = null;
  });
  return plan.cuentas;
}

/** Por código o por nombre. Solo salen cuentas de movimiento. */
export async function buscarCuentas(texto: string, desde: number): Promise<PaginaCuentas> {
  const q = normalizar(texto.trim());
  const cuentas = await cuentasDeMovimiento();
  const halladas = q
    ? cuentas.filter((c) => c.account_code.startsWith(q) || normalizar(c.name).includes(q))
    : cuentas;
  return { items: halladas.slice(desde, desde + POR_PAGINA), total: halladas.length };
}

export class CuentasAutomaticasService {
  static async efectivas(
    branchId: number | null | undefined,
    documento: DocumentoCuenta,
    consultas: readonly ConsultaCuenta[],
  ): Promise<CuentaEfectiva[]> {
    if (consultas.length === 0) return [];
    const { data, error } = await supabase.rpc('fn_cuentas_efectivas', {
      p_organization_id: organizacionId(),
      p_branch_id: branchId ?? null,
      p_documento: documento,
      p_consultas: consultas,
    });
    if (error) throw new Error(mensajeErrorAsiento(error));
    return ((data ?? []) as Record<string, unknown>[]).map(aCuentaEfectiva);
  }

  static async sugerida(proveedorId: number): Promise<SugerenciaCuenta | null> {
    const { data, error } = await supabase.rpc('fn_cuenta_sugerida_proveedor', {
      p_organization_id: organizacionId(),
      p_supplier_id: proveedorId,
    });
    if (error) throw new Error(mensajeErrorAsiento(error));
    const fila = ((data ?? []) as SugerenciaCuenta[])[0];
    return fila ? { cuenta: fila.cuenta, nombre: fila.nombre, veces: Number(fila.veces), compras: Number(fila.compras) } : null;
  }

  /** Cambia un solo rol. Los otros tres no se tocan: los conserva la base. */
  static async fijarEnCatalogo(tipo: 'producto' | 'categoria', id: number, rol: RolCuenta, cuenta: string | null): Promise<void> {
    const { error } = await supabase.rpc('fn_cuenta_catalogo_fijar', {
      p_organization_id: organizacionId(),
      p_tipo: tipo,
      p_id: id,
      p_rol: rol,
      p_cuenta: cuenta,
    });
    if (error) throw new Error(mensajeErrorAsiento(error));
  }

  static async verCuentas(): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_preferencia_ver_cuentas');
    if (error) throw error;
    return data === true;
  }

  static async guardarVerCuentas(valor: boolean): Promise<void> {
    const { error } = await supabase.rpc('fn_preferencia_ver_cuentas_guardar', { p_valor: valor });
    if (error) throw error;
  }

  static async productosDeCategoria(categoriaId: number): Promise<number> {
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizacionId())
      .eq('category_id', categoriaId)
      .neq('status', 'deleted');
    if (error) throw error;
    return count ?? 0;
  }

  static async categorias(): Promise<CategoriaContable[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, parent_id, cuenta_ingreso, cuenta_costo, cuenta_inventario, cuenta_devolucion, products(count)')
      .eq('organization_id', organizacionId())
      .neq('products.status', 'deleted')
      .order('name');
    if (error) throw error;
    return ((data ?? []) as (Omit<CategoriaContable, 'productos'> & { products: { count: number }[] | null })[]).map(({ products, ...c }) => ({
      ...c,
      productos: products?.[0]?.count ?? 0,
    }));
  }
}
