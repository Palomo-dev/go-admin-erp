"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { supabase } from "@/lib/supabase/config";
import { useOrganization } from "@/lib/hooks/useOrganization";
import ClientesTable from "@/components/clientes/ClientesTable";
import ClientesFilter from "@/components/clientes/ClientesFilter";
import ClientesActions from "@/components/clientes/ClientesActions";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  doc_type?: string;
  doc_number?: string;
  city?: string;
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
        setIsLoading(true);
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
        console.log("Organización encontrada:", organizationData.organization.id);
        setOrganizationId(organizationData.organization.id);
        await loadCustomers(organizationData.organization.id);
      } else {
        setError('No se encontró información de la organización');
        setIsLoading(false);
      }
    }
    
    loadOrganizationData();
  }, [session, sessionLoading, organizationData]);


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
          total_sales
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
    
    // Filtro por ciudad (ignorar "all_cities")
    if (cityFilter && cityFilter !== "all_cities") {
      filtered = filtered.filter(customer => 
        customer.city === cityFilter
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
      ["ID", "Nombre Completo", "Email", "Teléfono", "Tipo Documento", "Número Documento", "Ciudad", "Roles", "Etiquetas", "Saldo CxC", "Última Compra"].join(","),
      // Rows
      ...filteredCustomers.map(customer => [
        customer.id,
        customer.full_name,
        customer.email || "",
        customer.phone || "",
        customer.doc_type || "",
        customer.doc_number || "",
        customer.city || "",
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

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* Título principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Gestión de Clientes</h1>
      </div>
      
      {/* Estado de carga inicial */}
      {isLoading && !error && !organizationId && (
        <div className="flex flex-col items-center justify-center h-64 space-y-3">
          <LoadingSpinner />
          <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Cargando datos...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg relative mb-4 sm:mb-6">
          <strong className="font-bold text-sm sm:text-base">Error:</strong>
          <span className="block sm:inline text-sm sm:text-base"> {error}</span>
          <button
            className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white px-4 py-2 rounded-md mt-3 text-sm font-medium transition-colors min-h-[40px]"
            onClick={() => {
              // Simplificamos la lógica del botón de reintentar
              setError("");
              setIsLoading(true);
              
              // Verificamos si tenemos los datos necesarios para cargar clientes
              if (organizationData.organization?.id) {
                loadCustomers(organizationData.organization.id)
                  .catch(err => {
                    setError(err.message || "Error desconocido");
                    setIsLoading(false);
                  });
              } else {
                // Si no hay organización, simplemente refrescamos la página
                // para reiniciar todo el proceso de carga
                window.location.reload();
              }
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      
      {/* Contenido principal - siempre visible si no hay error o carga inicial */}
      {!isLoading || (isLoading && organizationId) ? (
        <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          {/* Eliminamos el indicador de actualización pequeño, ya lo manejamos en otro lugar */}
          
          {/* Header con título y acciones principales */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
                Listado de Clientes
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                Gestión centralizada de clientes
              </p>
            </div>
            
            {/* Acciones masivas - siempre visibles */}
            <ClientesActions 
              onExportCSV={handleExportCSV}
              selectedCustomers={[]} 
            />
          </div>

          {/* Filtros y ordenamiento - siempre visibles */}
          <div className="p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/30">
            <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">🔍 Filtros y opciones de visualización</p>
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
          </div>

          {/* Tabla, mensaje de carga o mensaje de no datos */}
          {isLoading && organizationId ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <LoadingSpinner />
              <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Cargando datos...</span>
            </div>
          ) : customers.length > 0 ? (
            <ClientesTable 
              customers={filteredCustomers}
              page={page}
              pageSize={pageSize}
              count={count}
              onPageChange={handlePageChange}
            />
          ) : (
            <div className="mt-4 p-4 sm:p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/30 text-center">
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 mb-4">No se encontraron clientes en esta organización.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                <button
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium min-h-[44px]"
                  onClick={() => organizationId && loadCustomers(organizationId)}
                  disabled={isLoading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Recargar datos
                </button>
                <a 
                  href="/app/clientes/new" 
                  className="px-4 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-md flex items-center justify-center transition-colors text-sm font-medium min-h-[44px]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Crear nuevo cliente
                </a>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
