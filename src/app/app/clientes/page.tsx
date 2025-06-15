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
  
  const session = useSession();

  useEffect(() => {
    async function loadUserData() {
      if (!session?.user?.id) return;
      
      try {
        const { data: userData, error: userError } = await getUserOrganization(session.user.id);
        if (userError) throw new Error(userError?.message || "Error cargando datos del usuario");
        
        if (userData && userData.length > 0) {
          const orgId = userData[0].organization.id;
          setOrganizationId(orgId);
          await loadCustomers(orgId);
        }
      } catch (error: any) {
        console.error("Error cargando datos:", error);
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadUserData();
  }, [session]);

  // Función para cargar clientes con paginación y última fecha de compra
  async function loadCustomers(orgId: number) {
    setIsLoading(true);
    try {
      // Primero obtenemos el conteo total para la paginación
      const { count: totalCount, error: countError } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId);
        
      if (countError) throw countError;
      if (totalCount !== null) setCount(totalCount);
      
      // Obtenemos los clientes con paginación
      const { data: customersData, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", orgId)
        .range(page * pageSize, (page + 1) * pageSize - 1);
        
      if (error) throw error;
      
      // Obtenemos los saldos de cuentas por cobrar
      const customerIds = customersData.map(customer => customer.id);
      
      // Consulta para cuentas por cobrar
      const { data: balances, error: balancesError } = await supabase
        .from("accounts_receivable")
        .select("customer_id, sum(balance)")
        .in("customer_id", customerIds)
        .eq("organization_id", orgId)
        .gt("balance", 0)
        .group("customer_id");
        
      // Consulta para última compra
      const { data: lastPurchases, error: purchasesError } = await supabase
        .from("sales")
        .select("customer_id, MAX(sale_date) as last_purchase")
        .in("customer_id", customerIds)
        .eq("organization_id", orgId)
        .eq("status", "paid")
        .group("customer_id");
      
      // Crear un mapa de saldos e historial de compras
      const balanceMap = new Map();
      const lastPurchaseMap = new Map();
      
      if (balances) {
        balances.forEach(item => {
          balanceMap.set(item.customer_id, item.sum);
        });
      }
      
      if (lastPurchases) {
        lastPurchases.forEach(item => {
          lastPurchaseMap.set(item.customer_id, item.last_purchase);
        });
      }
      
      // Combinar datos
      const enhancedCustomers = customersData.map(customer => ({
        ...customer,
        balance: balanceMap.get(customer.id) || 0,
        last_purchase_date: lastPurchaseMap.get(customer.id) || null
      }));
      
      setCustomers(enhancedCustomers);
      setFilteredCustomers(enhancedCustomers);
    } catch (error: any) {
      console.error("Error cargando clientes:", error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  // Efecto para aplicar filtros cuando cambien
  useEffect(() => {
    if (!customers.length) return;
    
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
    
    // Filtro por rol
    if (roleFilter) {
      filtered = filtered.filter(customer => 
        customer.roles?.includes(roleFilter)
      );
    }
    
    // Filtro por etiqueta
    if (tagFilter) {
      filtered = filtered.filter(customer => 
        customer.tags?.includes(tagFilter)
      );
    }
    
    // Filtro por ciudad
    if (cityFilter) {
      filtered = filtered.filter(customer => 
        customer.city === cityFilter
      );
    }
    
    // Filtro por saldo pendiente
    if (balanceFilter) {
      if (balanceFilter === 'pending') {
        filtered = filtered.filter(customer => (customer.balance || 0) > 0);
      } else if (balanceFilter === 'paid') {
        filtered = filtered.filter(customer => (customer.balance || 0) === 0);
      }
    }
    
    setFilteredCustomers(filtered);
  }, [customers, searchQuery, roleFilter, tagFilter, cityFilter, balanceFilter]);

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

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">
      <LoadingSpinner />
      <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando datos...</span>
    </div>;
  }

  if (error) {
    return <div className="p-6 text-center">
      <p className="text-red-500 dark:text-red-400">Error: {error}</p>
      <button 
        className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
        onClick={() => organizationId && loadCustomers(organizationId)}
      >
        Reintentar
      </button>
    </div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Listado de Clientes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gestión centralizada de clientes
          </p>
        </div>
        
        {/* Acciones masivas */}
        <ClientesActions 
          onExportCSV={handleExportCSV}
          selectedCustomers={[]} 
        />
      </div>

      {/* Filtros */}
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
        // Pasamos la lista de clientes para obtener las opciones de filtros disponibles
        customers={customers}
      />

      {/* Tabla de Clientes */}
      <ClientesTable 
        customers={filteredCustomers}
        page={page}
        pageSize={pageSize}
        count={count}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
