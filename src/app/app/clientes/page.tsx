"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { getUserOrganization, supabase } from "@/lib/supabase/config";
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
  
  // Usar desestructuración con tipado explícito
  const { session, loading: sessionLoading } = useSession();
  // session es de tipo Session | null
  
  useEffect(() => {
    async function loadUserData() {
      if (sessionLoading) {
        console.log('Sesión cargando todavía');
        return;
      }
      
      if (!session) {
        console.log('No hay sesión activa');
        setError('No hay sesión activa. Por favor inicie sesión.');
        setIsLoading(false);
        return;
      }
      
      if (!session || !session.user?.id) {
        console.error('ID de usuario no disponible en la sesión');
        setError('No se pudo obtener la información del usuario');
        setIsLoading(false);
        return;
      }
      
      try {
        // Verificamos que session y session.user existan
        if (!session || !session.user) {
          setError('No se encontró información del usuario');
          setIsLoading(false);
          return;
        }
        
        console.log('Obteniendo organización para usuario:', session.user.id);
        const userData = await getUserOrganization(session.user.id);
        
        // Registrar respuesta para depuración
        console.log('Respuesta de getUserOrganization:', userData);
        
        if (userData.error) {
          console.error('Error obteniendo organización:', userData.error);
          setError(userData.error || "Error cargando datos del usuario");
          setIsLoading(false);
          return;
        }
        
        if (userData.organization?.id) {
          console.log('ID de organización encontrada:', userData.organization.id);
          setOrganizationId(userData.organization.id);
          await loadCustomers(userData.organization.id);
        } else {
          console.error('No se encontró una organización válida');
          setError('No se encontró información de la organización del usuario');
          setIsLoading(false);
        }
      } catch (error: any) {
        console.error("Error cargando datos:", error);
        setError(error.message || "Error desconocido al cargar datos del usuario");
        setIsLoading(false);
      }
    }
    
    loadUserData();
  }, [session, sessionLoading]);


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
      // NOTA: Verificamos los tipos entre tablas. En customers.id es UUID pero accounts_receivable.customer_id es INTEGER
      // En lugar de intentar usar los IDs directamente, vamos a consultar por organización
      const { data: balances, error: balancesError } = await supabase
        .from("accounts_receivable")
        .select("customer_id, balance")
        .eq("organization_id", orgId.toString()) // Convertimos a string ya que organization_id es UUID
        .gt("balance", 0);
        
      if (balancesError) {
        console.warn("Error obteniendo saldos:", balancesError);
        // Continuamos sin datos de saldo en lugar de fallar toda la carga
      }
        
      // Consulta para última compra - manejando incompatibilidades de tipo UUID vs string
      const { data: lastPurchases, error: purchasesError } = await supabase
        .from("sales")
        .select("customer_id, sale_date")
        .eq("organization_id", orgId)
        .eq("status", "paid")
        .order('sale_date', { ascending: false });
        
      if (purchasesError) {
        console.warn("Error obteniendo historial de compras:", purchasesError);
        // Continuamos sin datos de historial en lugar de fallar toda la carga
      }
      
      // Crear un mapa de saldos e historial de compras con manejo seguro de tipos
      const balanceMap = new Map();
      const lastPurchaseMap = new Map();
      
      // Procesar saldos - agrupar por cliente y sumar balances
      if (balances) {
        // Agrupar por customer_id y sumar los balances
        // Pero verificando primero que el tipo de dato sea correcto
        balances.forEach(item => {
          if (item.customer_id !== null && item.customer_id !== undefined && item.balance !== undefined) {
            try {
              // Sólo usamos IDs numéricos para evitar errores de tipo
              if (typeof item.customer_id === 'number') {
                const customerId = item.customer_id.toString();
                const currentBalance = balanceMap.get(customerId) || 0;
                balanceMap.set(customerId, currentBalance + item.balance);
              }
            } catch (err) {
              console.warn("Error procesando saldo para cliente:", item.customer_id, err);
            }
          }
        });
      }
      
      // Procesar últimas compras - encontrar la fecha más reciente por cliente
      if (lastPurchases) {
        // Agrupar por customer_id y encontrar la fecha más reciente
        lastPurchases.forEach(item => {
          if (item.customer_id && item.sale_date) {
            const customerId = item.customer_id.toString();
            const currentDate = lastPurchaseMap.get(customerId);
            // Si no hay fecha registrada o la nueva es más reciente, actualizar
            if (!currentDate || new Date(item.sale_date) > new Date(currentDate)) {
              lastPurchaseMap.set(customerId, item.sale_date);
            }
          }
        });
      }
      
      // Combinar datos asegurando compatibilidad de tipos entre UUIDs y strings
      const enhancedCustomers = customersData.map(customer => ({
        ...customer,
        balance: balanceMap.get(customer.id.toString()) || 0,
        last_purchase_date: lastPurchaseMap.get(customer.id.toString()) || null
      }));
      
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
    <div className="container mx-auto py-6">
      {/* Título principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Gestión de Clientes</h1>
      </div>
      
      {/* Estado de carga inicial */}
      {isLoading && !error && !organizationId && (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
          <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando datos...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
          <button
            className="bg-red-500 text-white px-4 py-2 rounded mt-2"
            onClick={() => {
              setError("");
              setIsLoading(true);
              if (session && session.user && session.user.id) {
                getUserOrganization(session.user.id)
                  .then(data => {
                    if (data?.organization?.id) {
                      loadCustomers(data.organization.id);
                    } else {
                      setError("No se pudo recuperar la organización");
                      setIsLoading(false);
                    }
                  })
                  .catch(err => {
                    setError(err.message || "Error desconocido");
                    setIsLoading(false);
                  });
              } else {
                setError("No hay sesión de usuario");
                setIsLoading(false);
              }
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      
      {/* Contenido principal - siempre visible si no hay error o carga inicial */}
      {!isLoading || (isLoading && organizationId) ? (
        <div className="p-4 md:p-6 space-y-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          {/* Eliminamos el indicador de actualización pequeño, ya lo manejamos en otro lugar */}
          
          {/* Header con título y acciones principales */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                Listado de Clientes
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
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
          <div className="p-4 border border-gray-100 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-850">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">🔍 Filtros y opciones de visualización</p>
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
            <div className="flex items-center justify-center h-64">
              <LoadingSpinner />
              <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando datos...</span>
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
            <div className="mt-4 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-850 text-center">
              <p className="text-gray-600 dark:text-gray-300 mb-4">No se encontraron clientes en esta organización.</p>
              <div className="flex justify-center space-x-4">
                <button
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded flex items-center"
                  onClick={() => organizationId && loadCustomers(organizationId)}
                  disabled={isLoading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Recargar datos
                </button>
                <a 
                  href="/app/clientes/new" 
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
