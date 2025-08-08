"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  RefreshCw, 
  Lock, 
  Download, 
  Mail,
  Users,
  TrendingUp,
  Calendar,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/config";
import { Segment } from "./utils";

interface SegmentDetailProps {
  segmentId: string;
}

interface SegmentStats {
  currentSize: number;
  historicalSizes: Array<{ date: string; count: number }>;
  averageRevenue: number;
  totalRevenue: number;
  lastCalculated: string;
}

interface CustomerData {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  notes?: string;
  created_at?: string;
  identification_type?: string;
  identification_number?: string;
  doc_type?: string;
  doc_number?: string;
  is_registered?: boolean;
}

interface SaleData {
  total: string;
  customer_id: string;
}

export default function SegmentDetail({ segmentId }: SegmentDetailProps) {
  const router = useRouter();
  const [segment, setSegment] = useState<Segment | null>(null);
  const [stats, setStats] = useState<SegmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Obtener organización del storage
  const getOrganizationId = (): number => {
    const orgData = localStorage.getItem('selectedOrganization');
    if (orgData) {
      const parsed = JSON.parse(orgData);
      return parsed.id || 2;
    }
    return 2;
  };

  const organizationId = getOrganizationId();

  useEffect(() => {
    loadSegmentData();
  }, [segmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSegmentData = async () => {
    try {
      setLoading(true);

      // Cargar datos del segmento
      const { data: segmentData, error: segmentError } = await supabase
        .from('segments')
        .select('*')
        .eq('id', segmentId)
        .eq('organization_id', organizationId)
        .single();

      if (segmentError) {
        console.error('Error cargando segmento:', segmentError);
        toast.error('Error al cargar el segmento');
        return;
      }

      setSegment(segmentData);

      // Cargar estadísticas del segmento
      await loadSegmentStats(segmentData);

    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar los datos del segmento');
    } finally {
      setLoading(false);
    }
  };

  const loadSegmentStats = async (segmentData: Segment) => {
    try {
      console.log('🔄 Cargando estadísticas para segmento:', segmentData.name);
      
      // Obtener clientes actuales del segmento usando filtros nativos
      const customers = await getSegmentCustomers(segmentData.filter_json);
      const currentSize = customers.length;
      
      console.log('👥 Clientes encontrados:', currentSize);
      
      // Calcular histórico basado en fechas de creación de clientes
      const historicalSizes = await calculateHistoricalSizes(customers);
      
      // Calcular estadísticas de ingresos
      let averageRevenue = 0;
      let totalRevenue = 0;
      
      if (customers.length > 0) {
        const revenueStats = await calculateRevenueStats(customers);
        averageRevenue = revenueStats.averageRevenue;
        totalRevenue = revenueStats.totalRevenue;
      }
      
      console.log('💰 Estadísticas de ingresos:', { averageRevenue, totalRevenue });
      
      // Actualizar el conteo en la tabla segments si es diferente
      if (currentSize !== segmentData.customer_count) {
        console.log('🔄 Actualizando conteo de clientes en BD:', currentSize);
        await supabase
          .from('segments')
          .update({ 
            customer_count: currentSize,
            last_run_at: new Date().toISOString()
          })
          .eq('id', segmentId)
          .eq('organization_id', organizationId);
      }

      setStats({
        currentSize,
        historicalSizes,
        averageRevenue,
        totalRevenue,
        lastCalculated: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  // Función para calcular el histórico de tamaños basado en fechas de creación
  const calculateHistoricalSizes = async (customers: Array<{ id: string; created_at: string }>) => {
    try {
      if (customers.length === 0) {
        return [
          { date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], count: 0 },
          { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], count: 0 },
          { date: new Date().toISOString().split('T')[0], count: 0 }
        ];
      }

      // Obtener fechas de creación y ordenarlas
      const creationDates = customers
        .map(c => new Date(c.created_at))
        .sort((a, b) => a.getTime() - b.getTime());

      const now = new Date();
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Contar clientes creados hasta cada fecha
      const count60DaysAgo = creationDates.filter(date => date <= sixtyDaysAgo).length;
      const count30DaysAgo = creationDates.filter(date => date <= thirtyDaysAgo).length;
      const countToday = customers.length;

      return [
        { date: sixtyDaysAgo.toISOString().split('T')[0], count: count60DaysAgo },
        { date: thirtyDaysAgo.toISOString().split('T')[0], count: count30DaysAgo },
        { date: now.toISOString().split('T')[0], count: countToday }
      ];
    } catch (error) {
      console.error('Error calculando histórico:', error);
      return [];
    }
  };

  // Función para calcular estadísticas de ingresos
  const calculateRevenueStats = async (customers: Array<{ id: string }>) => {
    try {
      const customerIds = customers.map(c => c.id);
      
      // Consultar ventas de estos clientes
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('total, customer_id')
        .in('customer_id', customerIds)
        .eq('organization_id', organizationId);

      if (salesError) {
        console.warn('Error consultando ventas:', salesError);
        return { averageRevenue: 0, totalRevenue: 0 };
      }

      if (!salesData || salesData.length === 0) {
        console.log('No se encontraron ventas para los clientes del segmento');
        return { averageRevenue: 0, totalRevenue: 0 };
      }

      // Calcular ingresos totales
      const totalRevenue = (salesData as SaleData[]).reduce((sum, sale) => {
        const saleTotal = parseFloat(sale.total) || 0;
        return sum + saleTotal;
      }, 0);

      // Calcular ingreso promedio por cliente
      const averageRevenue = totalRevenue / customers.length;

      console.log(`📊 Ventas encontradas: ${salesData.length}, Total: $${totalRevenue.toFixed(2)}, Promedio: $${averageRevenue.toFixed(2)}`);

      return { averageRevenue, totalRevenue };
    } catch (error) {
      console.error('Error calculando estadísticas de ingresos:', error);
      return { averageRevenue: 0, totalRevenue: 0 };
    }
  };

  const getSegmentCustomers = async (filterJson: any) => {
    try {
      console.log('🔍 Obteniendo clientes del segmento con filtros:', filterJson);
      
      // Construir consulta básica con todos los campos necesarios
      let query = supabase
        .from('customers')
        .select('id, first_name, last_name, email, phone, city, address, notes, created_at')
        .eq('organization_id', organizationId);

      // Aplicar filtros del segmento si existen
      if (filterJson && filterJson.rules && Array.isArray(filterJson.rules)) {
        console.log('📋 Aplicando filtros:', filterJson.rules.length, 'reglas');
        
        for (const rule of filterJson.rules) {
          if (rule.type === 'customer' && rule.field && rule.operator && rule.value) {
            console.log('🔧 Aplicando filtro:', rule.field, rule.operator, rule.value);
            
            switch (rule.operator) {
              case 'equals':
                query = query.eq(rule.field, rule.value);
                break;
              case 'not_equals':
                query = query.neq(rule.field, rule.value);
                break;
              case 'contains':
                query = query.ilike(rule.field, `%${rule.value}%`);
                break;
              case 'not_contains':
                // Simplificado para evitar errores de sintaxis
                break;
              case 'starts_with':
                query = query.ilike(rule.field, `${rule.value}%`);
                break;
              case 'ends_with':
                query = query.ilike(rule.field, `%${rule.value}`);
                break;
              case 'is_empty':
                query = query.is(rule.field, null);
                break;
              case 'is_not_empty':
                query = query.not(rule.field, 'is', null);
                break;
              default:
                console.warn('⚠️ Operador no soportado:', rule.operator);
            }
          }
        }
      } else {
        console.log('📝 Sin filtros específicos, obteniendo todos los clientes de la organización');
      }

      const { data, error } = await query.limit(1000); // Límite de seguridad
      
      if (error) {
        console.error('❌ Error obteniendo clientes del segmento:', error);
        return [];
      }

      console.log('✅ Clientes obtenidos:', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('❌ Error en getSegmentCustomers:', error);
      return [];
    }
  };

  const handleRecalculate = async () => {
    if (!segment) return;

    try {
      setRecalculating(true);
      
      // Recalcular el conteo de clientes
      const customers = await getSegmentCustomers(segment.filter_json);
      const newCount = customers.length;

      // Actualizar el segmento en la base de datos
      const { error } = await supabase
        .from('segments')
        .update({
          customer_count: newCount,
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', segmentId);

      if (error) {
        console.error('Error actualizando segmento:', error);
        toast.error('Error al recalcular el segmento');
        return;
      }

      // Recargar datos
      await loadSegmentData();
      toast.success('Segmento recalculado exitosamente');

    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al recalcular el segmento');
    } finally {
      setRecalculating(false);
    }
  };

  const handleConvertToStatic = async () => {
    if (!segment) return;

    try {
      setConverting(true);

      const { error } = await supabase
        .from('segments')
        .update({
          is_dynamic: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', segmentId);

      if (error) {
        console.error('Error convirtiendo segmento:', error);
        toast.error('Error al convertir el segmento');
        return;
      }

      // Recargar datos
      await loadSegmentData();
      toast.success('Segmento convertido a estático exitosamente');

    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al convertir el segmento');
    } finally {
      setConverting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!segment) return;

    try {
      setExporting(true);

      // Obtener clientes del segmento
      const customers = await getSegmentCustomers(segment.filter_json);

      if (customers.length === 0) {
        toast.error('No hay clientes en este segmento para exportar');
        return;
      }

      console.log('📊 Exportando CSV para segmento:', segment.name, 'con', customers.length, 'clientes');

      // Crear contenido CSV con información completa
      const headers = [
        'ID Cliente',
        'Nombre',
        'Apellido',
        'Email',
        'Teléfono',
        'Ciudad',
        'Dirección',
        'Tipo Identificación',
        'Número Identificación',
        'Fecha Registro',
        'Está Registrado',
        'Notas'
      ];

      // Agregar información del segmento al inicio del CSV
      const segmentInfo = [
        '# INFORMACIÓN DEL SEGMENTO',
        `# Nombre: ${segment.name}`,
        `# Descripción: ${segment.description || 'Sin descripción'}`,
        `# Tipo: ${segment.is_dynamic ? 'Dinámico' : 'Estático'}`,
        `# Total de clientes: ${customers.length}`,
        `# Fecha de creación: ${formatDate(segment.created_at)}`,
        `# Última actualización: ${formatDate(segment.updated_at)}`,
        `# Ganancia media: ${stats ? formatCurrency(stats.averageRevenue) : 'No calculada'}`,
        `# Ingresos totales: ${stats ? formatCurrency(stats.totalRevenue) : 'No calculados'}`,
        '',
        '# DATOS DE CLIENTES'
      ];

      const csvContent = [
        ...segmentInfo,
        headers.join(','),
        ...customers.map((customer: CustomerData) => [
          customer.id || '',
          customer.first_name || '',
          customer.last_name || '',
          customer.email || '',
          customer.phone || '',
          customer.city || '',
          customer.address || '',
          customer.identification_type || customer.doc_type || '',
          customer.identification_number || customer.doc_number || '',
          customer.created_at ? new Date(customer.created_at).toLocaleDateString('es-CO') : '',
          customer.is_registered ? 'Sí' : 'No',
          customer.notes || ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      // Crear nombre de archivo seguro y descriptivo
      const safeSegmentName = segment.name
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remover caracteres especiales
        .replace(/\s+/g, '_') // Reemplazar espacios con guiones bajos
        .toLowerCase();
      
      const currentDate = new Date().toISOString().split('T')[0];
      const fileName = `segmento_${safeSegmentName}_${currentDate}.csv`;
      
      console.log('📁 Nombre del archivo CSV:', fileName);

      // Crear y descargar archivo con BOM para UTF-8
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      
      console.log('📁 Iniciando descarga del archivo:', fileName);
      console.log('📊 Tamaño del blob:', blob.size, 'bytes');
      
      // Método directo y robusto para descarga
      try {
        // Verificar si el navegador soporta la API moderna de descarga
        if ('showSaveFilePicker' in window) {
          // Usar File System Access API (Chrome/Edge moderno)
          try {
            const fileHandle = await (window as any).showSaveFilePicker({
              suggestedName: fileName,
              types: [{
                description: 'Archivos CSV',
                accept: { 'text/csv': ['.csv'] }
              }]
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            console.log('✅ Archivo guardado usando File System Access API');
          } catch (fsError) {
            console.warn('File System Access API falló, usando método tradicional:', fsError);
            throw fsError; // Forzar fallback
          }
        } else {
          throw new Error('File System Access API no disponible');
        }
      } catch (modernError) {
        // Fallback al método tradicional mejorado
        console.log('🔄 Usando método tradicional de descarga');
        
        if (window.navigator && (window.navigator as any).msSaveOrOpenBlob) {
          // Para Internet Explorer
          (window.navigator as any).msSaveOrOpenBlob(blob, fileName);
          console.log('✅ Descarga iniciada usando msSaveOrOpenBlob');
        } else {
          // Método tradicional pero más simple y directo
          const url = URL.createObjectURL(blob);
          
          // Crear enlace temporal
          const link = document.createElement('a');
          link.style.display = 'none';
          link.href = url;
          link.download = fileName;
          
          // Agregar al DOM, hacer clic inmediatamente y remover
          document.body.appendChild(link);
          
          // Usar setTimeout para asegurar que el DOM esté listo
          setTimeout(() => {
            console.log('🔗 Ejecutando descarga tradicional para:', fileName);
            link.click();
            
            // Cleanup inmediato
            setTimeout(() => {
              if (link.parentNode) {
                document.body.removeChild(link);
              }
              URL.revokeObjectURL(url);
              console.log('✅ Descarga tradicional completada y cleanup realizado');
            }, 100);
          }, 10);
        }
      }

      toast.success(`Archivo CSV exportado exitosamente con ${customers.length} clientes`);

    } catch (error) {
      console.error('Error exportando CSV:', error);
      toast.error('Error al exportar CSV: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setExporting(false);
    }
  };

  const handleCreateCampaign = () => {
    // Redirigir a la página de creación de campaña con el segmento preseleccionado
    router.push(`/app/crm/campanas/nueva?segment_id=${segmentId}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!segment) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Segmento no encontrado
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          El segmento solicitado no existe o no tienes permisos para verlo.
        </p>
        <Button 
          onClick={() => router.back()} 
          className="mt-4"
          variant="outline"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            onClick={() => router.back()} 
            variant="outline" 
            size="sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {segment.name}
            </h1>
            <div className="flex items-center space-x-2 mt-2">
              <Badge variant={segment.is_dynamic ? "default" : "secondary"}>
                {segment.is_dynamic ? "Dinámico" : "Estático"}
              </Badge>
              <span className="text-gray-600 dark:text-gray-400">
                {segment.description}
              </span>
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center space-x-2">
          <Button
            onClick={handleRecalculate}
            disabled={recalculating}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
            Recalcular
          </Button>

          {segment.is_dynamic && (
            <Button
              onClick={handleConvertToStatic}
              disabled={converting}
              variant="outline"
              size="sm"
            >
              <Lock className="w-4 h-4 mr-2" />
              Convertir a estático
            </Button>
          )}

          <Button
            onClick={handleExportCSV}
            disabled={exporting}
            variant="outline"
            size="sm"
          >
            <Download className={`w-4 h-4 mr-2 ${exporting ? 'animate-spin' : ''}`} />
            Exportar CSV
          </Button>

          <Button
            onClick={handleCreateCampaign}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            <Mail className="w-4 h-4 mr-2" />
            Crear campaña
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tamaño Actual</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats?.currentSize ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                clientes en el segmento
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ganancia Media</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(stats?.averageRevenue ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                por cliente
              </p>
              {stats?.currentSize === 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  Sin clientes para calcular
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCurrency(stats?.totalRevenue ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                del segmento
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Último Cálculo</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {stats?.lastCalculated ? formatDate(stats.lastCalculated) : 'Nunca calculado'}
              </div>
              <p className="text-xs text-muted-foreground">
                última actualización
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Histórico de tamaño */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <span>Tamaño Histórico</span>
          </CardTitle>
          <CardDescription>
            Evolución del número de clientes en el segmento a lo largo del tiempo
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-center justify-between py-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 h-2 bg-gray-200 rounded-full"></div>
                      <div className="h-4 bg-gray-200 rounded w-8"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : stats?.historicalSizes && stats.historicalSizes.length > 0 ? (
            <div className="space-y-4">
              {stats.historicalSizes.map((item, index) => {
                const maxCount = Math.max(...stats.historicalSizes.map(h => h.count));
                const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                
                return (
                  <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {new Date(item.date).toLocaleDateString('es-CO', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {index === 0 ? 'Hace 60 días' : index === 1 ? 'Hace 30 días' : 'Hoy'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-40 bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                          style={{ 
                            width: `${Math.max(5, percentage)}%` 
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400 w-12 text-right">
                        {item.count}
                      </span>
                      <span className="text-xs text-gray-500 w-16 text-right">
                        {percentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
              
              {/* Resumen de crecimiento */}
              {stats.historicalSizes.length >= 2 && (
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Crecimiento del Segmento
                      </h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Últimos 60 días
                      </p>
                    </div>
                    <div className="text-right">
                      {(() => {
                        const oldest = stats.historicalSizes[0]?.count || 0;
                        const newest = stats.historicalSizes[stats.historicalSizes.length - 1]?.count || 0;
                        const growth = newest - oldest;
                        const growthPercentage = oldest > 0 ? ((growth / oldest) * 100) : 0;
                        
                        return (
                          <>
                            <div className={`text-lg font-bold ${
                              growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              {growth >= 0 ? '+' : ''}{growth}
                            </div>
                            <div className={`text-xs ${
                              growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              {growthPercentage >= 0 ? '+' : ''}{growthPercentage.toFixed(1)}%
                            </div>
                          </>
                        );
                      })()} 
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Sin Datos Históricos
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                No hay suficientes datos para mostrar el histórico del segmento.
              </p>
              <Button 
                onClick={handleRecalculate}
                disabled={recalculating}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
                Calcular Estadísticas
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Información del segmento */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Segmento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Tipo
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {segment.is_dynamic ? 'Dinámico (se recalcula automáticamente)' : 'Estático (fotografía fija)'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Creado
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {formatDate(segment.created_at)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Última actualización
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {formatDate(segment.updated_at)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Filtros aplicados
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {segment.filter_json?.rules?.length || 0} reglas de filtrado
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
