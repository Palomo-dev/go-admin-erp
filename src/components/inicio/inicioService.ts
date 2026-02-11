import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface DashboardKPIData {
  ventasHoy: number;
  ventasMes: number;
  clientesActivos: number;
  productosActivos: number;
  facturasHoy: number;
  empleadosActivos: number;
  reservasActivas: number;
  cuentasPorCobrar: number;
}

export interface ActividadReciente {
  id: string;
  tipo: 'venta' | 'factura' | 'cliente' | 'producto' | 'reserva';
  descripcion: string;
  monto?: number;
  fecha: string;
}

export interface OnboardingStep {
  id: string;
  titulo: string;
  descripcion: string;
  href: string;
  completado: boolean;
  icono: string;
}

export interface DashboardData {
  kpis: DashboardKPIData;
  actividad: ActividadReciente[];
  onboarding: OnboardingStep[];
  organizacionCreatedAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const inicioService = {
  async getDashboardData(organizationId: number): Promise<DashboardData> {
    const today = startOfToday();
    const last30Days = daysAgo(30);

    // Ejecutar queries en paralelo para mayor velocidad
    const [
      ventasHoyRes,
      ventasMesRes,
      clientesRes,
      productosRes,
      facturasHoyRes,
      empleadosRes,
      reservasRes,
      cuentasRes,
      actividadVentas,
      orgRes,
      branchesRes,
      membersRes,
      taxesRes,
    ] = await Promise.all([
      // Ventas hoy
      supabase
        .from('sales')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('sale_date', today)
        .in('status', ['paid', 'completed']),
      // Ventas últimos 30 días
      supabase
        .from('sales')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('sale_date', last30Days),
      // Clientes activos
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      // Productos activos
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'active'),
      // Facturas hoy
      supabase
        .from('invoice_sales')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('issue_date', today),
      // Miembros activos de la organización
      supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      // Reservas activas
      supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('status', ['confirmed', 'checked_in']),
      // Cuentas por cobrar
      supabase
        .from('accounts_receivable')
        .select('balance')
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'partial']),
      // Actividad reciente (últimas ventas)
      supabase
        .from('sales')
        .select('id, total, sale_date, status')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(5),
      // Organización (para onboarding)
      supabase
        .from('organizations')
        .select('created_at')
        .eq('id', organizationId)
        .single(),
      // Sucursales (para onboarding check)
      supabase
        .from('branches')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      // Miembros (para onboarding check)
      supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      // Impuestos (para onboarding check)
      supabase
        .from('organization_taxes')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
    ]);

    // KPIs
    const ventasHoy = (ventasHoyRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0);
    const ventasMes = (ventasMesRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0);
    const cuentasPorCobrar = (cuentasRes.data || []).reduce((s, c) => s + Number(c.balance || 0), 0);

    const kpis: DashboardKPIData = {
      ventasHoy,
      ventasMes,
      clientesActivos: clientesRes.count || 0,
      productosActivos: productosRes.count || 0,
      facturasHoy: facturasHoyRes.count || 0,
      empleadosActivos: empleadosRes.count || 0,
      reservasActivas: reservasRes.count || 0,
      cuentasPorCobrar,
    };

    // Actividad reciente
    const actividad: ActividadReciente[] = (actividadVentas.data || []).map((v) => ({
      id: v.id,
      tipo: 'venta' as const,
      descripcion: `Venta ${v.status === 'paid' ? 'completada' : v.status}`,
      monto: Number(v.total),
      fecha: v.sale_date,
    }));

    // Onboarding steps
    const onboarding: OnboardingStep[] = [
      {
        id: 'org',
        titulo: 'Configurar organización',
        descripcion: 'Completa los datos de tu empresa',
        href: '/app/organizacion',
        completado: true, // siempre completado si existe
        icono: 'Settings',
      },
      {
        id: 'branch',
        titulo: 'Crear sucursal',
        descripcion: 'Agrega al menos una sucursal',
        href: '/app/sucursales',
        completado: (branchesRes.count || 0) > 0,
        icono: 'Building2',
      },
      {
        id: 'team',
        titulo: 'Invitar equipo',
        descripcion: 'Agrega miembros a tu organización',
        href: '/app/organizacion/miembros',
        completado: (membersRes.count || 0) > 1,
        icono: 'Users',
      },
      {
        id: 'products',
        titulo: 'Agregar productos',
        descripcion: 'Crea tu catálogo de productos',
        href: '/app/inventario/productos',
        completado: (productosRes.count || 0) > 0,
        icono: 'Package',
      },
      {
        id: 'taxes',
        titulo: 'Configurar impuestos',
        descripcion: 'Configura los impuestos de tu país',
        href: '/app/finanzas/impuestos',
        completado: (taxesRes.count || 0) > 0,
        icono: 'Percent',
      },
      {
        id: 'customers',
        titulo: 'Registrar clientes',
        descripcion: 'Agrega tus primeros clientes',
        href: '/app/crm',
        completado: (clientesRes.count || 0) > 0,
        icono: 'UserPlus',
      },
    ];

    return {
      kpis,
      actividad,
      onboarding,
      organizacionCreatedAt: orgRes.data?.created_at || null,
    };
  },
};
