"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, RefreshCw, Users, Code, Download, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/config";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean | string[] | null;
  type: 'customer' | 'event';
}

interface FilterGroup {
  id: string;
  operator: 'AND' | 'OR';
  rules: FilterRule[];
  groups: FilterGroup[];
}

interface SegmentPreviewProps {
  filterData: FilterGroup;
  organizationId: number | null;
  onCountChange: (count: number) => void;
}

interface CustomerPreview {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  city?: string;
  created_at: string;
  tags?: string[];
}

/**
 * Componente de vista previa en vivo para segmentos
 * Muestra el conteo de contactos y permite ver una muestra de los resultados
 */
export default function SegmentPreview({ filterData, organizationId, onCountChange }: SegmentPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [previewCustomers, setPreviewCustomers] = useState<CustomerPreview[]>([]);
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Función para escapar valores SQL
  const escapeSQL = (value: string | number | boolean | string[] | null): string => {
    if (value === null || value === undefined) return 'NULL';
    return String(value).replace(/'/g, "''");
  };

  // Función para generar SQL desde los filtros
  const generateSQL = useCallback((filters: FilterGroup): string => {
    if (!organizationId) return "";

    const buildWhereClause = (group: FilterGroup): string => {
      const conditions: string[] = [];

      // Procesar reglas del grupo
      group.rules.forEach(rule => {
        if (!rule.field || !rule.operator) return;

        let condition = "";
        const field = rule.type === 'customer' ? `c.${rule.field}` : `events.${rule.field}`;
        const escapedValue = escapeSQL(rule.value);

        switch (rule.operator) {
          case 'equals':
            condition = `${field} = '${escapedValue}'`;
            break;
          case 'not_equals':
            condition = `${field} != '${escapedValue}'`;
            break;
          case 'contains':
            condition = `${field} ILIKE '%${escapedValue}%'`;
            break;
          case 'not_contains':
            condition = `${field} NOT ILIKE '%${escapedValue}%'`;
            break;
          case 'starts_with':
            condition = `${field} ILIKE '${escapedValue}%'`;
            break;
          case 'ends_with':
            condition = `${field} ILIKE '%${escapedValue}'`;
            break;
          case 'is_empty':
            condition = `(${field} IS NULL OR ${field} = '')`;
            break;
          case 'is_not_empty':
            condition = `(${field} IS NOT NULL AND ${field} != '')`;
            break;
          case 'greater_than':
            condition = `${field} > ${escapedValue}`;
            break;
          case 'greater_than_or_equal':
            condition = `${field} >= ${escapedValue}`;
            break;
          case 'less_than':
            condition = `${field} < ${escapedValue}`;
            break;
          case 'less_than_or_equal':
            condition = `${field} <= ${escapedValue}`;
            break;
          case 'before':
            condition = `${field} < '${escapedValue}'`;
            break;
          case 'after':
            condition = `${field} > '${escapedValue}'`;
            break;
          case 'last_days':
            condition = `${field} >= NOW() - INTERVAL '${parseInt(String(rule.value))} days'`;
            break;
          case 'is_true':
            condition = `${field} = true`;
            break;
          case 'is_false':
            condition = `${field} = false`;
            break;
          case 'contains':
            if (rule.type === 'customer' && rule.field === 'tags') {
              condition = `'${escapedValue}' = ANY(${field})`;
            } else {
              condition = `${field} ILIKE '%${escapedValue}%'`;
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
    
    let sql = `SELECT DISTINCT c.id, c.first_name, c.last_name, c.email, c.phone, c.city, c.created_at, c.tags FROM customers c`;

    // Agregar joins si hay filtros de eventos
    const hasEventFilters = JSON.stringify(filters).includes('"type":"event"');
    if (hasEventFilters) {
      sql += `
LEFT JOIN sales s ON c.id = s.customer_id
LEFT JOIN campaign_contacts cc ON c.id = cc.customer_id`;
    }

    sql += `
WHERE c.organization_id = ${organizationId}`;

    if (whereClause) {
      sql += ` AND (${whereClause})`;
    }

    sql += `
ORDER BY c.created_at DESC`;

    return sql;
  }, [organizationId]);

  // Función para ejecutar la vista previa
  const executePreview = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    setError(null);

    try {
      const sql = generateSQL(filterData);
      setGeneratedSQL(sql);

      // Si no hay filtros, mostrar todos los clientes de la organización
      if (!sql || sql.trim() === '') {
        const { data, error } = await supabase
          .from('customers')
          .select('id, first_name, last_name, email, phone, city, created_at, tags')
          .eq('organization_id', organizationId)
          .limit(10);

        if (error) throw error;

        const { count } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId);

        setCount(count || 0);
        onCountChange(count || 0);
        setPreviewCustomers(data || []);
        return;
      }

      // Ejecutar consulta para obtener el conteo
      const countSQL = sql.replace(
        'SELECT DISTINCT c.id, c.first_name, c.last_name, c.email, c.phone, c.city, c.created_at, c.tags FROM customers c',
        'SELECT COUNT(DISTINCT c.id) as count FROM customers c'
      ).replace(/ORDER BY.*$/, '');

      console.log('Ejecutando consulta de conteo:', countSQL);

      const { data: countData, error: countError } = await supabase.rpc('execute_sql', {
        sql_query: countSQL
      });

      if (countError) {
        console.error('Error en consulta de conteo:', countError);
        throw new Error(`Error en consulta de conteo: ${countError.message || JSON.stringify(countError)}`);
      }

      console.log('Respuesta de conteo:', countData);
      
      // La función RPC devuelve un array con un objeto que contiene los resultados
      let totalCount = 0;
      if (Array.isArray(countData) && countData.length > 0) {
        const firstResult = countData[0];
        if (firstResult && typeof firstResult === 'object' && 'count' in firstResult) {
          totalCount = Number(firstResult.count) || 0;
        }
      }
      setCount(totalCount);
      onCountChange(totalCount);

      // Ejecutar consulta para obtener muestra de clientes (máximo 10)
      const previewSQL = sql + ' ORDER BY c.created_at DESC LIMIT 10';
      console.log('Ejecutando consulta de preview:', previewSQL);

      const { data: previewData, error: previewError } = await supabase.rpc('execute_sql', {
        sql_query: previewSQL
      });

      if (previewError) {
        console.error('Error en consulta de preview:', previewError);
        throw new Error(`Error en consulta de preview: ${previewError.message || JSON.stringify(previewError)}`);
      }

      console.log('Respuesta de preview:', previewData);
      
      // Procesar los datos de preview de manera segura
      const customers = Array.isArray(previewData) ? previewData : [];
      setPreviewCustomers(customers);

    } catch (error: unknown) {
      console.error('Error ejecutando vista previa:', {
        error,
        errorType: typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      const errorMessage = error instanceof Error ? error.message : 
        (typeof error === 'string' ? error : 'Error desconocido al ejecutar la vista previa');
      
      setError(errorMessage);
      setCount(0);
      onCountChange(0);
      setPreviewCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [filterData, organizationId, generateSQL, onCountChange]);

  // Ejecutar vista previa cuando cambien los filtros
  useEffect(() => {
    const timer = setTimeout(() => {
      if (organizationId && (filterData.rules.length > 0 || filterData.groups.length > 0)) {
        executePreview();
      } else {
        setCount(0);
        onCountChange(0);
        setPreviewCustomers([]);
        setGeneratedSQL("");
      }
    }, 500); // Debounce de 500ms

    return () => clearTimeout(timer);
  }, [filterData, organizationId, executePreview, onCountChange]);

  const handleExportCSV = () => {
    if (previewCustomers.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const headers = ['Nombre', 'Apellido', 'Email', 'Teléfono', 'Ciudad', 'Fecha de Registro'];
    const csvContent = [
      headers.join(','),
      ...previewCustomers.map(customer => [
        customer.first_name || '',
        customer.last_name || '',
        customer.email || '',
        customer.phone || '',
        customer.city || '',
        new Date(customer.created_at).toLocaleDateString()
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `segmento_preview_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Archivo CSV descargado exitosamente');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Eye className="h-5 w-5 text-blue-600" />
              <span>Vista Previa del Segmento</span>
            </CardTitle>
            <CardDescription>
              Visualiza en tiempo real cuántos contactos cumplen con los criterios definidos
            </CardDescription>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={executePreview}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Code className="h-4 w-4 mr-2" />
                  Ver SQL
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>SQL Generado</DialogTitle>
                  <DialogDescription>
                    Consulta SQL generada automáticamente a partir de los filtros configurados
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-96 w-full rounded-md border p-4">
                  <pre className="text-sm font-mono whitespace-pre-wrap">
                    {generatedSQL || 'No hay filtros configurados'}
                  </pre>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Estadísticas principales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <Users className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-600">Total de Contactos</span>
            </div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
              {loading ? '...' : count.toLocaleString()}
            </div>
          </div>
          
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <Eye className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-600">Muestra</span>
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">
              {previewCustomers.length}
            </div>
          </div>
          
          <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <Code className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-600">Filtros Activos</span>
            </div>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">
              {filterData.rules.length + filterData.groups.length}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          </div>
        )}

        {/* Lista de contactos de muestra */}
        {previewCustomers.length > 0 && (
          <>
            <Separator />
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Muestra de Contactos ({previewCustomers.length})</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {previewCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">
                          {customer.first_name} {customer.last_name}
                        </span>
                        {customer.tags && customer.tags.length > 0 && (
                          <div className="flex space-x-1">
                            {customer.tags.slice(0, 2).map((tag, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {customer.tags.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{customer.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {customer.email}
                        {customer.phone && ` • ${customer.phone}`}
                        {customer.city && ` • ${customer.city}`}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Mensaje cuando no hay resultados */}
        {!loading && count === 0 && (filterData.rules.length > 0 || filterData.groups.length > 0) && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No se encontraron contactos que cumplan con los criterios</p>
            <p className="text-sm">Intenta ajustar los filtros para obtener resultados</p>
          </div>
        )}

        {/* Mensaje cuando no hay filtros */}
        {filterData.rules.length === 0 && filterData.groups.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Configura filtros para ver la vista previa</p>
            <p className="text-sm">Los resultados aparecerán aquí en tiempo real</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
