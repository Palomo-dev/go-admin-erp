"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { supabase } from "@/lib/supabase/config";
import { useOrganization } from "@/lib/hooks/useOrganization";
import ClientesTable from "@/components/clientes/ClientesTable";
import ClientesFilter from "@/components/clientes/ClientesFilter";
import ClientesActions from "@/components/clientes/ClientesActions";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, ShoppingCart, AlertTriangle, RefreshCw, Trash2, Tag, Download, X, Loader2, Tags, UserPlus, UserMinus, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  doc_type?: string;
  doc_number?: string;
  fiscal_municipality_id?: string;
  municipality_name?: string;
  roles?: string[];
  tags?: string[];
  is_active?: boolean;
  last_purchase_date?: string;
  balance?: number;
  days_overdue?: number;
  ar_status?: string | null;
  sales_count?: number;
  total_sales?: number;
}

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  
  // Paginación
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [count, setCount] = useState(0);
  
  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [balanceFilter, setBalanceFilter] = useState<string | null>(null); // 'all', 'pending', 'paid'
  const [sortOrder, setSortOrder] = useState<string | null>(null);
  
  // Selección masiva
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  
  // Ref para controlar que solo se cargue una vez
  const hasLoadedRef = useRef(false);
  const loadedOrgIdRef = useRef<number | null>(null);
  
  // Usamos el hook de sesión y organización
  const { session } = useSession();
  const organizationData = useOrganization();
  
  // Extraemos el estado de carga de la sesión para mejor manejo
  const { loading: sessionLoading } = useSession();
  
  useEffect(() => {
    async function loadOrganizationData() {
      // Si la sesión o la organización aún está cargando, esperamos
      if (sessionLoading || organizationData.isLoading) {
        // Mantenemos el estado de carga pero no mostramos mensajes de error durante la carga
        if (!hasLoadedRef.current) {
          setIsLoading(true);
        }
        setError("");
        return;
      }
      
      // Solo verificamos la sesión después de que termine de cargar
      if (!sessionLoading && !session) {
        console.log("Sesión verificada: No hay sesión activa después de carga completa");
        setError('No hay sesión activa. Por favor inicie sesión.');
        setIsLoading(false);
        return;
      }
      
      // Manejamos errores específicos de organización
      if (organizationData.error) {
        const errorMsg = typeof organizationData.error === 'string' 
          ? organizationData.error 
          : "Error cargando datos de la organización";
        
        console.log("Error de organización:", errorMsg);
        setError(errorMsg);
        setIsLoading(false);
        return;
      }
      
      // Si tenemos organización, procedemos a cargar los clientes
      if (organizationData.organization?.id) {
        const orgId = organizationData.organization.id;
        
        // Solo cargar si no se ha cargado antes o si cambió la organización
        if (!hasLoadedRef.current || loadedOrgIdRef.current !== orgId) {
          console.log("Organización encontrada, cargando clientes:", orgId);
          setOrganizationId(orgId);
          loadedOrgIdRef.current = orgId;
          await loadCustomers(orgId);
          hasLoadedRef.current = true;
        } else {
          // Ya se cargó antes, solo actualizar el estado
          setOrganizationId(orgId);
          setIsLoading(false);
        }
      } else {
        setError('No se encontró información de la organización');
        setIsLoading(false);
      }
    }
    
    loadOrganizationData();
  }, [session, sessionLoading, organizationData.isLoading, organizationData.error, organizationData.organization?.id]);


  // Función para cargar clientes con paginación y última fecha de compra
  async function loadCustomers(orgId: string | number) {
    setIsLoading(true);
    console.log("Iniciando carga de clientes para organización:", orgId);
    try {
      // Primero obtenemos el conteo total para la paginación
      const { count: totalCount, error: countError } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId);
        
      if (countError) {
        console.error("Error al contar clientes:", countError);
        throw countError;
      }
      
      console.log("Total de clientes encontrados:", totalCount);
      if (totalCount !== null) setCount(totalCount);
      
      // Si no hay clientes, terminamos el proceso aquí
      if (totalCount === 0) {
        console.log("No hay clientes para mostrar");
        setCustomers([]);
        setFilteredCustomers([]);
        setIsLoading(false);
        return;
      }
      
      // Obtenemos los clientes con paginación
      const { data: customersData, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", orgId)
        .range(page * pageSize, (page + 1) * pageSize - 1);
        
      if (error) throw error;
      
      // Obtenemos los saldos de cuentas por cobrar
      const customerIds = customersData.map(customer => customer.id);
      
      // Consulta para cuentas por cobrar usando función RPC (bypasea RLS)
      const { data: balances, error: balancesError } = await supabase
        .rpc('get_accounts_receivable_for_customers', {
          customer_ids: customerIds,
          org_id: orgId
        });
      if (balancesError) {
        console.warn("Error obteniendo saldos:", balancesError);
        // Continuamos sin datos de saldo en lugar de fallar toda la carga
      }
        
      // Consulta para ventas con información adicional
      const { data: salesData, error: purchasesError } = await supabase
        .from("sales")
        .select("customer_id, sale_date, total, balance, status, payment_status")
        .in("customer_id", customerIds)
        .eq("organization_id", orgId)
        .order('sale_date', { ascending: false });
        
      if (purchasesError) {
        console.warn("Error obteniendo historial de compras:", purchasesError);
        // Continuamos sin datos de historial en lugar de fallar toda la carga
      }
      
      // Crear mapas para almacenar los datos procesados por cliente
      const balanceMap = new Map();
      const lastPurchaseMap = new Map();
      const maxDaysOverdueMap = new Map();
      const salesCountMap = new Map();
      const totalSalesMap = new Map();
      const arStatusMap = new Map();
      
      // Procesar cuentas por cobrar - agrupar por cliente y obtener estadísticas
      if (balances) {
        balances.forEach((item: any) => {
          if (item.customer_id && item.balance !== undefined) {
            const customerId = item.customer_id.toString();
            
            // Convertir explícitamente balance a número y acumular
            const itemBalance = typeof item.balance === 'string' ? parseFloat(item.balance) : Number(item.balance);
            const currentBalance = balanceMap.get(customerId) || 0;
            const newBalance = currentBalance + itemBalance;
            balanceMap.set(customerId, newBalance);
            
            // Obtener días de vencimiento máximo
            if (item.days_overdue !== undefined && item.days_overdue !== null) {
              const daysOverdue = Number(item.days_overdue);
              const currentDaysOverdue = maxDaysOverdueMap.get(customerId) || 0;
              maxDaysOverdueMap.set(customerId, Math.max(currentDaysOverdue, daysOverdue));
            }
            
            // Almacenar estado de cuenta por cobrar con mayor riesgo (vencido > parcial > pendiente > pagado)
            const currentStatus = arStatusMap.get(customerId) || '';
            
            // Prioridad: overdue > partial > pending > paid
            const prioridadEstado: Record<string, number> = {
              'overdue': 4,
              'partial': 3,
              'pending': 2,
              'paid': 1,
              '': 0
            };
            
            // Verificar que el estado sea válido y tenga prioridad
            const estadoActual = item.status || '';
            const prioridadActual = prioridadEstado[estadoActual] || 0;
            const prioridadAlmacenada = prioridadEstado[currentStatus] || 0;
            
            // Si el estado actual tiene mayor prioridad que el almacenado, actualizamos
            if (prioridadActual > prioridadAlmacenada) {
              arStatusMap.set(customerId, estadoActual);
            }
          }
        });
      }
      
      // Procesar ventas - estadísticas y última fecha
      if (salesData) {
        // Para cada cliente, calcular totales y encontrar la venta más reciente
        salesData.forEach(item => {
          if (item.customer_id) {
            const customerId = item.customer_id.toString();
            
            // Conteo de ventas
            const currentCount = salesCountMap.get(customerId) || 0;
            salesCountMap.set(customerId, currentCount + 1);
            
            // Convertir explícitamente el total a número y sumarlo
            if (item.total !== undefined && item.total !== null) {
              const itemTotal = typeof item.total === 'string' ? parseFloat(item.total) : Number(item.total);
              const currentTotal = totalSalesMap.get(customerId) || 0;
              totalSalesMap.set(customerId, currentTotal + itemTotal);
            }
            
            // Actualizar última fecha de compra
            if (item.sale_date) {
              const currentDate = lastPurchaseMap.get(customerId);
              if (!currentDate || new Date(item.sale_date) > new Date(currentDate)) {
                lastPurchaseMap.set(customerId, item.sale_date);
              }
            }
          }
        });
      }
      
      // Obtener nombres de municipios para todos los clientes
      const municipalityIds = customersData
        .map((c: any) => c.fiscal_municipality_id)
        .filter((id: string | null, index: number, arr: (string | null)[]) => id && arr.indexOf(id) === index);
      const municipalityMap = new Map<string, string>();
      if (municipalityIds.length > 0) {
        const { data: munis } = await supabase
          .from('municipalities')
          .select('id, name, state_name')
          .in('id', municipalityIds);
        if (munis) {
          munis.forEach((m: any) => municipalityMap.set(m.id, `${m.name} - ${m.state_name}`));
        }
      }

      // Combinar datos asegurando compatibilidad de tipos entre UUIDs y strings
      const enhancedCustomers = customersData.map(customer => {
        const customerId = customer.id.toString();
        
        // Asegurar que todos los valores numéricos son de tipo number
        const rawBalance = balanceMap.get(customerId);
        const balance = Number(rawBalance || 0);
        const sales_count = Number(salesCountMap.get(customerId) || 0);
        const total_sales = Number(totalSalesMap.get(customerId) || 0);
        const days_overdue = Number(maxDaysOverdueMap.get(customerId) || 0);
        
        // Eliminar logs una vez que hayamos identificado el problema
        /* 
        console.log(`Cliente ${customer.full_name} (${customerId}):`); 
        console.log(`  - Balance: ${balance} (${typeof balance})`); 
        console.log(`  - Ventas: ${sales_count} compras por ${total_sales}`); 
        */
        
        return {
          ...customer,
          balance,
          last_purchase_date: lastPurchaseMap.get(customerId) || null,
          days_overdue,
          ar_status: arStatusMap.get(customerId) || null,
          sales_count, 
          total_sales,
          municipality_name: customer.fiscal_municipality_id ? municipalityMap.get(customer.fiscal_municipality_id) || null : null,
        };
      });
      
      console.log('Clientes cargados:', enhancedCustomers.length);
      
      setCustomers(enhancedCustomers);
      setFilteredCustomers(enhancedCustomers);
    } catch (error: any) {
      console.error("Error cargando clientes:", error);
      setError(error.message || "Error desconocido al cargar clientes");
      // Aseguramos que la pantalla de carga desaparezca incluso si hay error
      setCustomers([]);
      setFilteredCustomers([]);
    } finally {
      setIsLoading(false);
      console.log("Finalizada la carga de clientes, estado de carga:", isLoading);
    }
  }

  // Efecto para aplicar filtros cuando cambien
  useEffect(() => {
    let filtered = [...customers];
    
    // Filtro por búsqueda global
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(customer => 
        customer.full_name?.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.doc_number?.toLowerCase().includes(query) ||
        customer.phone?.toLowerCase().includes(query)
      );
    }
    
    // Filtro por rol (ignorar "all_roles")
    if (roleFilter && roleFilter !== "all_roles") {
      filtered = filtered.filter(customer => 
        customer.roles?.includes(roleFilter)
      );
    }
    
    // Filtro por etiqueta (ignorar "all_tags")
    if (tagFilter && tagFilter !== "all_tags") {
      filtered = filtered.filter(customer => 
        customer.tags?.includes(tagFilter)
      );
    }
    
    // Filtro por municipio (ignorar "all_cities")
    if (cityFilter && cityFilter !== "all_cities") {
      filtered = filtered.filter(customer => 
        customer.municipality_name === cityFilter
      );
    }
    
    // Filtro por saldo pendiente (ignorar "all_balances")
    if (balanceFilter && balanceFilter !== "all_balances") {
      if (balanceFilter === 'pending') {
        filtered = filtered.filter(customer => (customer.balance || 0) > 0);
      } else if (balanceFilter === 'paid') {
        filtered = filtered.filter(customer => (customer.balance || 0) === 0);
      }
    }
    
    // Aplicar ordenamiento (ignorar "no_sort")
    if (sortOrder && sortOrder !== "no_sort") {
      filtered = [...filtered].sort((a, b) => {
        switch(sortOrder) {
          case 'latest_purchase': 
            // Si no hay fecha de última compra, colocar al final
            if (!a.last_purchase_date) return 1;
            if (!b.last_purchase_date) return -1;
            return new Date(b.last_purchase_date).getTime() - new Date(a.last_purchase_date).getTime();
          case 'oldest_purchase': 
            if (!a.last_purchase_date) return 1;
            if (!b.last_purchase_date) return -1;
            return new Date(a.last_purchase_date).getTime() - new Date(b.last_purchase_date).getTime();
          case 'balance_desc':
            return (b.balance || 0) - (a.balance || 0);
          case 'balance_asc':
            return (a.balance || 0) - (b.balance || 0);
          default:
            return 0;
        }
      });
    }
    
    setFilteredCustomers(filtered);
  }, [customers, searchQuery, roleFilter, tagFilter, cityFilter, balanceFilter, sortOrder]);

  // Función para cambiar de página
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    if (organizationId) loadCustomers(organizationId);
  };

  // Función para exportar a CSV
  const handleExportCSV = () => {
    if (!filteredCustomers.length) return;
    
    const csvContent = [
      // Headers
      ["ID", "Nombre Completo", "Email", "Teléfono", "Tipo Documento", "Número Documento", "Municipio", "Roles", "Etiquetas", "Saldo CxC", "Última Compra"].join(","),
      // Rows
      ...filteredCustomers.map(customer => [
        customer.id,
        customer.full_name,
        customer.email || "",
        customer.phone || "",
        customer.doc_type || "",
        customer.doc_number || "",
        customer.municipality_name || "",
        (customer.roles || []).join(";"),
        (customer.tags || []).join(";"),
        customer.balance || 0,
        customer.last_purchase_date || ""
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `clientes_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Funciones de acciones masivas
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    if (!confirm(`¿Estás seguro de eliminar ${selectedIds.length} cliente(s)? Esta acción no se puede deshacer.`)) {
      return;
    }
    
    setIsBulkLoading(true);
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .in('id', selectedIds);
      
      if (error) throw error;
      
      toast.success(`${selectedIds.length} cliente(s) eliminado(s) correctamente`);
      setSelectedIds([]);
      if (organizationId) await loadCustomers(organizationId);
    } catch (err: any) {
      console.error('Error eliminando clientes:', err);
      toast.error(err.message || 'Error al eliminar clientes');
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkExport = () => {
    if (selectedIds.length === 0) return;
    
    const selectedCustomers = filteredCustomers.filter(c => selectedIds.includes(c.id));
    
    const csvContent = [
      ["ID", "Nombre Completo", "Email", "Teléfono", "Tipo Documento", "Número Documento", "Municipio", "Roles", "Etiquetas", "Saldo CxC", "Última Compra"].join(","),
      ...selectedCustomers.map(customer => [
        customer.id,
        customer.full_name,
        customer.email || "",
        customer.phone || "",
        customer.doc_type || "",
        customer.doc_number || "",
        customer.municipality_name || "",
        (customer.roles || []).join(";"),
        (customer.tags || []).join(";"),
        customer.balance || 0,
        customer.last_purchase_date || ""
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `clientes_seleccionados_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`${selectedIds.length} cliente(s) exportado(s)`);
  };

  const handleBulkAddTag = async () => {
    if (selectedIds.length === 0) return;
    
    const newTag = prompt('Ingresa la etiqueta a agregar:');
    if (!newTag || !newTag.trim()) return;
    
    setIsBulkLoading(true);
    try {
      for (const customerId of selectedIds) {
        const customer = customers.find(c => c.id === customerId);
        const currentTags = customer?.tags || [];
        if (!currentTags.includes(newTag.trim())) {
          await supabase
            .from('customers')
            .update({ tags: [...currentTags, newTag.trim()] })
            .eq('id', customerId);
        }
      }
      
      toast.success(`Etiqueta "${newTag.trim()}" agregada a ${selectedIds.length} cliente(s)`);
      setSelectedIds([]);
      if (organizationId) await loadCustomers(organizationId);
    } catch (err: any) {
      console.error('Error agregando etiqueta:', err);
      toast.error(err.message || 'Error al agregar etiqueta');
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkRemoveTag = async () => {
    if (selectedIds.length === 0) return;
    
    const tagToRemove = prompt('Ingresa la etiqueta a quitar:');
    if (!tagToRemove || !tagToRemove.trim()) return;
    
    setIsBulkLoading(true);
    try {
      for (const customerId of selectedIds) {
        const customer = customers.find(c => c.id === customerId);
        const currentTags = customer?.tags || [];
        if (currentTags.includes(tagToRemove.trim())) {
          await supabase
            .from('customers')
            .update({ tags: currentTags.filter(t => t !== tagToRemove.trim()) })
            .eq('id', customerId);
        }
      }
      
      toast.success(`Etiqueta "${tagToRemove.trim()}" removida de ${selectedIds.length} cliente(s)`);
      setSelectedIds([]);
      if (organizationId) await loadCustomers(organizationId);
    } catch (err: any) {
      console.error('Error removiendo etiqueta:', err);
      toast.error(err.message || 'Error al remover etiqueta');
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkChangeRole = async (role: string, action: 'add' | 'remove') => {
    if (selectedIds.length === 0) return;
    
    setIsBulkLoading(true);
    try {
      for (const customerId of selectedIds) {
        const customer = customers.find(c => c.id === customerId);
        const currentRoles = customer?.roles || [];
        
        let updatedRoles: string[];
        if (action === 'add') {
          updatedRoles = currentRoles.includes(role) ? currentRoles : [...currentRoles, role];
        } else {
          updatedRoles = currentRoles.filter(r => r !== role);
        }
        
        if (JSON.stringify(currentRoles) !== JSON.stringify(updatedRoles)) {
          await supabase
            .from('customers')
            .update({ roles: updatedRoles })
            .eq('id', customerId);
        }
      }
      
      const actionLabel = action === 'add' ? 'agregado' : 'removido';
      toast.success(`Rol "${role}" ${actionLabel} en ${selectedIds.length} cliente(s)`);
      setSelectedIds([]);
      if (organizationId) await loadCustomers(organizationId);
    } catch (err: any) {
      console.error('Error cambiando roles:', err);
      toast.error(err.message || 'Error al cambiar roles');
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
  };

  // Calcular estadísticas
  const stats = {
    totalClientes: count,
    clientesConSaldo: customers.filter(c => (c.balance || 0) > 0).length,
    totalCuentasPorCobrar: customers.reduce((sum, c) => sum + (c.balance || 0), 0),
    clientesVencidos: customers.filter(c => (c.days_overdue || 0) > 0 || c.ar_status === 'overdue').length,
  };

  // Función para formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading && !organizationId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Cargando clientes...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            Gestión de Clientes
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Administra tu cartera de clientes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => organizationId && loadCustomers(organizationId)}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <ClientesActions 
            onExportCSV={handleExportCSV}
            selectedCustomers={selectedIds}
            onRefresh={() => { setSelectedIds([]); organizationId && loadCustomers(organizationId); }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-medium text-red-700 dark:text-red-300">Error</p>
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => {
                  setError("");
                  setIsLoading(true);
                  if (organizationData.organization?.id) {
                    loadCustomers(organizationData.organization.id)
                      .catch(err => {
                        setError(err.message || "Error desconocido");
                        setIsLoading(false);
                      });
                  } else {
                    window.location.reload();
                  }
                }}
              >
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Clientes</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalClientes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Con Saldo</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.clientesConSaldo}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cuentas x Cobrar</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(stats.totalCuentasPorCobrar)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cuentas Vencidas</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.clientesVencidos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de acciones masivas */}
      {selectedIds.length > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {selectedIds.length} cliente(s) seleccionado(s)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                  className="h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-100 dark:text-blue-400"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isBulkLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkExport}
                  disabled={isBulkLoading}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Exportar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkAddTag}
                  disabled={isBulkLoading}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
                >
                  <Tag className="h-4 w-4 mr-1" />
                  Etiquetar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkRemoveTag}
                  disabled={isBulkLoading}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
                >
                  <Tags className="h-4 w-4 mr-1" />
                  Quitar etiqueta
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBulkLoading}
                      className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
                    >
                      <Users className="h-4 w-4 mr-1" />
                      Roles
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>Agregar rol</DropdownMenuLabel>
                    {['cliente', 'huesped', 'pasajero', 'proveedor', 'empleado'].map(role => (
                      <DropdownMenuItem key={`add-${role}`} onClick={() => handleBulkChangeRole(role, 'add')}>
                        <UserPlus className="h-4 w-4 mr-2 text-green-600" />
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Quitar rol</DropdownMenuLabel>
                    {['cliente', 'huesped', 'pasajero', 'proveedor', 'empleado'].map(role => (
                      <DropdownMenuItem key={`rm-${role}`} onClick={() => handleBulkChangeRole(role, 'remove')}>
                        <UserMinus className="h-4 w-4 mr-2 text-red-500" />
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={isBulkLoading}
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Eliminar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <ClientesFilter 
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            cityFilter={cityFilter}
            onCityFilterChange={setCityFilter}
            balanceFilter={balanceFilter}
            onBalanceFilterChange={setBalanceFilter}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            customers={customers}
          />
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-0">
          {customers.length > 0 ? (
            <ClientesTable 
              customers={filteredCustomers}
              page={page}
              pageSize={pageSize}
              count={count}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              isLoading={isLoading && !!organizationId}
            />
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Cargando clientes...</span>
            </div>
          ) : (
            <div className="p-8 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 mb-4">No se encontraron clientes</p>
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => organizationId && loadCustomers(organizationId)}
                  disabled={isLoading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recargar
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => window.location.href = '/app/clientes/new'}
                >
                  Crear cliente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
