import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ReportSource {
  id: string;
  label: string;
  table: string;
  dateField: string;
  columns: ColumnDef[];
}

export interface ColumnDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean';
  aggregatable?: boolean;
}

export interface ReportFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'is_null';
  value: string;
}

export interface ReportConfig {
  sourceId: string;
  columns: string[];
  filters: ReportFilter[];
  groupBy: string | null;
  metric: 'count' | 'sum' | 'avg' | null;
  metricColumn: string | null;
  dateFrom: string;
  dateTo: string;
  limit: number;
}

export interface ReportResult {
  columns: string[];
  rows: Record<string, any>[];
  total: number;
  aggregated: boolean;
}

// ─── Fuentes disponibles ─────────────────────────────────────────────────────

export const REPORT_SOURCES: ReportSource[] = [
  {
    id: 'ventas', label: 'Ventas', table: 'sales', dateField: 'sale_date',
    columns: [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'sale_date', label: 'Fecha Venta', type: 'date' },
      { key: 'status', label: 'Estado', type: 'text' },
      { key: 'payment_status', label: 'Estado Pago', type: 'text' },
      { key: 'subtotal', label: 'Subtotal', type: 'number', aggregatable: true },
      { key: 'tax_total', label: 'Impuesto', type: 'number', aggregatable: true },
      { key: 'total', label: 'Total', type: 'number', aggregatable: true },
      { key: 'balance', label: 'Saldo', type: 'number', aggregatable: true },
      { key: 'branch_id', label: 'Sucursal ID', type: 'number' },
    ],
  },
  {
    id: 'productos', label: 'Productos', table: 'products', dateField: 'created_at',
    columns: [
      { key: 'id', label: 'ID', type: 'number' },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'status', label: 'Estado', type: 'text' },
      { key: 'category_id', label: 'Categoría ID', type: 'number' },
      { key: 'created_at', label: 'Creado', type: 'date' },
    ],
  },
  {
    id: 'movimientos', label: 'Movimientos Stock', table: 'stock_movements', dateField: 'created_at',
    columns: [
      { key: 'id', label: 'ID', type: 'number' },
      { key: 'product_id', label: 'Producto ID', type: 'number' },
      { key: 'branch_id', label: 'Sucursal ID', type: 'number' },
      { key: 'direction', label: 'Dirección', type: 'text' },
      { key: 'qty', label: 'Cantidad', type: 'number', aggregatable: true },
      { key: 'unit_cost', label: 'Costo Unit.', type: 'number', aggregatable: true },
      { key: 'source', label: 'Origen', type: 'text' },
      { key: 'created_at', label: 'Fecha', type: 'date' },
    ],
  },
  {
    id: 'reservas', label: 'Reservas PMS', table: 'reservations', dateField: 'checkin',
    columns: [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'checkin', label: 'Check-in', type: 'date' },
      { key: 'checkout', label: 'Check-out', type: 'date' },
      { key: 'status', label: 'Estado', type: 'text' },
      { key: 'channel', label: 'Canal', type: 'text' },
      { key: 'total_estimated', label: 'Total Estimado', type: 'number', aggregatable: true },
      { key: 'occupant_count', label: 'Ocupantes', type: 'number', aggregatable: true },
      { key: 'branch_id', label: 'Sucursal ID', type: 'number' },
    ],
  },
  {
    id: 'asistencia', label: 'Asistencia HRM', table: 'attendance_events', dateField: 'event_at',
    columns: [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'employment_id', label: 'Empleado ID', type: 'text' },
      { key: 'event_type', label: 'Tipo Evento', type: 'text' },
      { key: 'event_at', label: 'Fecha/Hora', type: 'date' },
      { key: 'source', label: 'Fuente', type: 'text' },
      { key: 'branch_id', label: 'Sucursal ID', type: 'number' },
      { key: 'is_manual_entry', label: 'Manual', type: 'boolean' },
    ],
  },
  {
    id: 'nomina', label: 'Nómina', table: 'payroll_slips', dateField: 'created_at',
    columns: [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'employment_id', label: 'Empleado ID', type: 'text' },
      { key: 'gross_pay', label: 'Pago Bruto', type: 'number', aggregatable: true },
      { key: 'net_pay', label: 'Pago Neto', type: 'number', aggregatable: true },
      { key: 'total_deductions', label: 'Deducciones', type: 'number', aggregatable: true },
      { key: 'total_employer_cost', label: 'Costo Empleador', type: 'number', aggregatable: true },
      { key: 'regular_hours', label: 'Horas Reg.', type: 'number', aggregatable: true },
      { key: 'status', label: 'Estado', type: 'text' },
      { key: 'created_at', label: 'Creado', type: 'date' },
    ],
  },
  {
    id: 'auditoria', label: 'Auditoría', table: 'ops_audit_log', dateField: 'created_at',
    columns: [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'entity_type', label: 'Entidad', type: 'text' },
      { key: 'action', label: 'Acción', type: 'text' },
      { key: 'user_id', label: 'Usuario ID', type: 'text' },
      { key: 'created_at', label: 'Fecha', type: 'date' },
      { key: 'ip_address', label: 'IP', type: 'text' },
      { key: 'branch_id', label: 'Sucursal ID', type: 'number' },
    ],
  },
  {
    id: 'facturas', label: 'Facturas', table: 'invoice_sales', dateField: 'issue_date',
    columns: [
      { key: 'id', label: 'ID', type: 'number' },
      { key: 'number', label: 'Número', type: 'text' },
      { key: 'issue_date', label: 'Emisión', type: 'date' },
      { key: 'due_date', label: 'Vencimiento', type: 'date' },
      { key: 'status', label: 'Estado', type: 'text' },
      { key: 'subtotal', label: 'Subtotal', type: 'number', aggregatable: true },
      { key: 'tax_total', label: 'Impuesto', type: 'number', aggregatable: true },
      { key: 'total', label: 'Total', type: 'number', aggregatable: true },
      { key: 'balance', label: 'Saldo', type: 'number', aggregatable: true },
      { key: 'branch_id', label: 'Sucursal ID', type: 'number' },
    ],
  },
];

// ─── Servicio ────────────────────────────────────────────────────────────────

export const reportBuilderService = {

  getSources(): ReportSource[] {
    return REPORT_SOURCES;
  },

  getSource(sourceId: string): ReportSource | undefined {
    return REPORT_SOURCES.find((s) => s.id === sourceId);
  },

  async executeReport(
    organizationId: number,
    config: ReportConfig
  ): Promise<ReportResult> {
    const source = REPORT_SOURCES.find((s) => s.id === config.sourceId);
    if (!source) throw new Error('Fuente no encontrada');

    const selectCols = config.columns.length > 0 ? config.columns.join(',') : '*';

    let query = supabase
      .from(source.table)
      .select(selectCols, { count: 'exact' })
      .eq('organization_id', organizationId)
      .gte(source.dateField, config.dateFrom)
      .lte(source.dateField, config.dateTo + 'T23:59:59.999Z')
      .order(source.dateField, { ascending: false })
      .limit(config.limit || 100);

    // Aplicar filtros dinámicos
    for (const f of config.filters) {
      if (!f.column || !f.value) continue;
      switch (f.operator) {
        case 'eq': query = query.eq(f.column, f.value); break;
        case 'neq': query = query.neq(f.column, f.value); break;
        case 'gt': query = query.gt(f.column, f.value); break;
        case 'gte': query = query.gte(f.column, f.value); break;
        case 'lt': query = query.lt(f.column, f.value); break;
        case 'lte': query = query.lte(f.column, f.value); break;
        case 'like': query = query.ilike(f.column, `%${f.value}%`); break;
        case 'is_null': query = query.is(f.column, null); break;
      }
    }

    const { data, count, error } = await query;
    if (error) {
      console.error('Error ejecutando reporte:', error);
      throw new Error(error.message);
    }

    let rows: Record<string, any>[] = (data || []) as Record<string, any>[];
    let aggregated = false;

    // Agrupación client-side
    if (config.groupBy && config.metric && config.metricColumn) {
      aggregated = true;
      const groupByKey = config.groupBy;
      const metricCol = config.metricColumn;
      const grouped: Record<string, { group: string; values: number[] }> = {};
      for (const row of rows) {
        const groupVal = String((row as Record<string, any>)[groupByKey] ?? '(vacío)');
        if (!grouped[groupVal]) grouped[groupVal] = { group: groupVal, values: [] };
        grouped[groupVal].values.push(Number((row as Record<string, any>)[metricCol]) || 0);
      }

      const metricKey = `${config.metric}_${metricCol}`;
      rows = Object.values(grouped).map((g): Record<string, any> => {
        let metricValue = 0;
        if (config.metric === 'count') metricValue = g.values.length;
        else if (config.metric === 'sum') metricValue = g.values.reduce((a, b) => a + b, 0);
        else if (config.metric === 'avg') metricValue = g.values.length > 0 ? g.values.reduce((a, b) => a + b, 0) / g.values.length : 0;
        return {
          [groupByKey]: g.group,
          [metricKey]: metricValue,
          _count: g.values.length,
        };
      }).sort((a, b) => {
        const key = metricKey;
        return (b[key] as number) - (a[key] as number);
      });
    }

    const resultCols = rows.length > 0 ? Object.keys(rows[0]) : config.columns;

    return {
      columns: resultCols,
      rows,
      total: aggregated ? rows.length : (count || 0),
      aggregated,
    };
  },

  async saveReport(
    organizationId: number,
    userId: string,
    report: { name: string; config: ReportConfig }
  ) {
    const { data, error } = await supabase.from('saved_reports').insert({
      organization_id: organizationId, user_id: userId,
      name: report.name, module: 'personalizados',
      filters: report.config as any,
    }).select().single();
    if (error) { console.error('Error saving report:', error); return null; }
    return data;
  },

  async getSavedReports(organizationId: number) {
    const { data } = await supabase.from('saved_reports').select('*')
      .eq('organization_id', organizationId).eq('module', 'personalizados')
      .order('created_at', { ascending: false });
    return data || [];
  },

  async deleteSavedReport(reportId: string) {
    const { error } = await supabase.from('saved_reports').delete().eq('id', reportId);
    return !error;
  },
};
