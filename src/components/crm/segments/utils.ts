import { supabase } from "@/lib/supabase/config";

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: any;
  type: 'customer' | 'event';
}

export interface FilterGroup {
  id: string;
  operator: 'AND' | 'OR';
  rules: FilterRule[];
  groups: FilterGroup[];
}

export interface Segment {
  id: string;
  organization_id: number;
  name: string;
  description?: string;
  filter_json: FilterGroup;
  is_dynamic: boolean;
  customer_count: number;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * Utilidades para el builder de segmentos CRM
 */

/**
 * Genera un ID único para reglas y grupos de filtros
 */
export const generateFilterId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Valida si un filtro está completo y es válido
 */
export const validateFilter = (filter: FilterGroup): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const validateGroup = (group: FilterGroup, path = 'root'): void => {
    // Validar reglas del grupo
    group.rules.forEach((rule, index) => {
      if (!rule.field) {
        errors.push(`${path}.rules[${index}]: Campo requerido`);
      }
      if (!rule.operator) {
        errors.push(`${path}.rules[${index}]: Operador requerido`);
      }
      
      // Validar valor según el operador
      const needsValue = !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(rule.operator);
      if (needsValue && (rule.value === undefined || rule.value === null || rule.value === '')) {
        errors.push(`${path}.rules[${index}]: Valor requerido para el operador ${rule.operator}`);
      }
    });

    // Validar subgrupos recursivamente
    group.groups.forEach((subGroup, index) => {
      validateGroup(subGroup, `${path}.groups[${index}]`);
    });

    // Validar que el grupo tenga al menos una regla o subgrupo
    if (group.rules.length === 0 && group.groups.length === 0) {
      errors.push(`${path}: El grupo debe tener al menos una regla o subgrupo`);
    }
  };

  validateGroup(filter);

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Convierte filtros a SQL WHERE clause
 */
export const filtersToSQL = (filters: FilterGroup, organizationId: number): string => {
  const buildWhereClause = (group: FilterGroup): string => {
    const conditions: string[] = [];

    // Procesar reglas del grupo
    group.rules.forEach(rule => {
      if (!rule.field || !rule.operator) return;

      let condition = "";
      const field = rule.type === 'customer' ? `c.${rule.field}` : getEventField(rule.field);

      switch (rule.operator) {
        case 'equals':
          condition = `${field} = '${escapeSQL(rule.value)}'`;
          break;
        case 'not_equals':
          condition = `${field} != '${escapeSQL(rule.value)}'`;
          break;
        case 'contains':
          condition = `${field} ILIKE '%${escapeSQL(rule.value)}%'`;
          break;
        case 'not_contains':
          condition = `${field} NOT ILIKE '%${escapeSQL(rule.value)}%'`;
          break;
        case 'starts_with':
          condition = `${field} ILIKE '${escapeSQL(rule.value)}%'`;
          break;
        case 'ends_with':
          condition = `${field} ILIKE '%${escapeSQL(rule.value)}'`;
          break;
        case 'is_empty':
          condition = `(${field} IS NULL OR ${field} = '')`;
          break;
        case 'is_not_empty':
          condition = `(${field} IS NOT NULL AND ${field} != '')`;
          break;
        case 'greater_than':
          condition = `${field} > ${rule.value}`;
          break;
        case 'greater_than_or_equal':
          condition = `${field} >= ${rule.value}`;
          break;
        case 'less_than':
          condition = `${field} < ${rule.value}`;
          break;
        case 'less_than_or_equal':
          condition = `${field} <= ${rule.value}`;
          break;
        case 'before':
          condition = `${field} < '${rule.value}'`;
          break;
        case 'after':
          condition = `${field} > '${rule.value}'`;
          break;
        case 'last_days':
          condition = `${field} >= NOW() - INTERVAL '${parseInt(rule.value)} days'`;
          break;
        case 'next_days':
          condition = `${field} <= NOW() + INTERVAL '${parseInt(rule.value)} days'`;
          break;
        case 'is_true':
          condition = `${field} = true`;
          break;
        case 'is_false':
          condition = `${field} = false`;
          break;
        case 'between':
          if (Array.isArray(rule.value) && rule.value.length === 2) {
            condition = `${field} BETWEEN '${escapeSQL(rule.value[0])}' AND '${escapeSQL(rule.value[1])}'`;
          }
          break;
        default:
          return;
      }

      if (condition) {
        conditions.push(condition);
      }
    });

    // Procesar subgrupos
    group.groups.forEach(subGroup => {
      const subCondition = buildWhereClause(subGroup);
      if (subCondition) {
        conditions.push(`(${subCondition})`);
      }
    });

    return conditions.join(` ${group.operator} `);
  };

  const whereClause = buildWhereClause(filters);
  return whereClause || '1=1'; // Fallback para evitar SQL inválido
};

/**
 * Mapea campos de eventos a sus equivalentes SQL
 */
const getEventField = (field: string): string => {
  const eventFieldMap: Record<string, string> = {
    'purchase_count': '(SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id)',
    'total_spent': '(SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.customer_id = c.id)',
    'last_purchase_date': '(SELECT MAX(s.sale_date) FROM sales s WHERE s.customer_id = c.id)',
    'campaign_opened': '(SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.customer_id = c.id AND cc.opened = true)',
    'campaign_clicked': '(SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.customer_id = c.id AND cc.clicked = true)',
    'days_since_last_activity': `(EXTRACT(DAY FROM NOW() - c.updated_at))`
  };

  return eventFieldMap[field] || `c.${field}`;
};

/**
 * Escapa caracteres especiales para SQL
 */
const escapeSQL = (value: any): string => {
  if (typeof value !== 'string') return String(value);
  return value.replace(/'/g, "''");
};

/**
 * Ejecuta un segmento y retorna el conteo de contactos
 */
export const executeSegmentCount = async (
  filters: FilterGroup, 
  organizationId: number
): Promise<{ count: number; error?: string }> => {
  try {
    const whereClause = filtersToSQL(filters, organizationId);
    
    const sql = `
      SELECT COUNT(DISTINCT c.id) as count
      FROM customers c
      WHERE c.organization_id = ${organizationId}
        AND (${whereClause})
    `;

    const { data, error } = await supabase.rpc('execute_sql', {
      sql_query: sql
    });

    if (error) {
      console.error('Error ejecutando conteo de segmento:', error);
      return { count: 0, error: error.message };
    }

    return { count: data?.[0]?.count || 0 };
  } catch (error: any) {
    console.error('Error en executeSegmentCount:', error);
    return { count: 0, error: error.message };
  }
};

/**
 * Ejecuta un segmento y retorna una muestra de contactos
 */
export const executeSegmentPreview = async (
  filters: FilterGroup,
  organizationId: number,
  limit = 10
): Promise<{ customers: any[]; error?: string }> => {
  try {
    const whereClause = filtersToSQL(filters, organizationId);
    
    const sql = `
      SELECT DISTINCT c.id, c.first_name, c.last_name, c.email, c.phone, c.city, c.created_at, c.tags
      FROM customers c
      WHERE c.organization_id = ${organizationId}
        AND (${whereClause})
      ORDER BY c.created_at DESC
      LIMIT ${limit}
    `;

    const { data, error } = await supabase.rpc('execute_sql', {
      sql_query: sql
    });

    if (error) {
      console.error('Error ejecutando preview de segmento:', error);
      return { customers: [], error: error.message };
    }

    return { customers: data || [] };
  } catch (error: any) {
    console.error('Error en executeSegmentPreview:', error);
    return { customers: [], error: error.message };
  }
};

/**
 * Actualiza el conteo de un segmento en la base de datos
 */
export const updateSegmentCount = async (segmentId: string, count: number): Promise<void> => {
  try {
    const { error } = await supabase
      .from('segments')
      .update({ 
        customer_count: count,
        last_run_at: new Date().toISOString()
      })
      .eq('id', segmentId);

    if (error) {
      console.error('Error actualizando conteo de segmento:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error en updateSegmentCount:', error);
    throw error;
  }
};

/**
 * Exporta un segmento a diferentes formatos
 */
export const exportSegment = async (
  segment: Segment,
  format: 'json' | 'csv' | 'sql' = 'json'
): Promise<void> => {
  try {
    let content = '';
    let filename = '';
    let mimeType = '';

    switch (format) {
      case 'json':
        content = JSON.stringify(segment, null, 2);
        filename = `segmento_${segment.name.replace(/\s+/g, '_').toLowerCase()}.json`;
        mimeType = 'application/json';
        break;
      
      case 'sql':
        const sql = filtersToSQL(segment.filter_json, segment.organization_id);
        content = `-- Segmento: ${segment.name}\n-- Descripción: ${segment.description || 'Sin descripción'}\n-- Creado: ${segment.created_at}\n\nSELECT DISTINCT c.*\nFROM customers c\nWHERE c.organization_id = ${segment.organization_id}\n  AND (${sql})\nORDER BY c.created_at DESC;`;
        filename = `segmento_${segment.name.replace(/\s+/g, '_').toLowerCase()}.sql`;
        mimeType = 'text/sql';
        break;
      
      case 'csv':
        // Para CSV necesitaríamos ejecutar la consulta y obtener los datos
        throw new Error('Exportación CSV no implementada aún');
      
      default:
        throw new Error(`Formato de exportación no soportado: ${format}`);
    }

    // Crear y descargar el archivo
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Error exportando segmento:', error);
    throw error;
  }
};

/**
 * Clona un segmento con un nuevo nombre
 */
export const cloneSegment = async (
  originalSegment: Segment,
  newName: string,
  organizationId: number
): Promise<string> => {
  try {
    const { data, error } = await supabase
      .from('segments')
      .insert({
        organization_id: organizationId,
        name: newName,
        description: `Copia de: ${originalSegment.description || originalSegment.name}`,
        filter_json: originalSegment.filter_json,
        is_dynamic: originalSegment.is_dynamic,
        customer_count: 0 // Se recalculará
      })
      .select('id')
      .single();

    if (error) throw error;

    return data.id;
  } catch (error) {
    console.error('Error clonando segmento:', error);
    throw error;
  }
};
