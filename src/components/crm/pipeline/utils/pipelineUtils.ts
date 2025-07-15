import { supabase } from "@/lib/supabase/config";
import type { Customer, Opportunity, CustomerInteraction } from "../types";

/**
 * Funciones utilitarias para el módulo de pipeline y clientes
 */

/**
 * Obtiene el ID de organización desde localStorage o sessionStorage
 * con fallback para desarrollo
 * @returns {string} ID de la organización
 */
export const getOrganizationId = (): string => {
  try {
    // Buscar en todas las claves posibles
    const orgIdFromProfile = typeof localStorage !== 'undefined' ? localStorage.getItem("profileOrg") : null;
    const orgIdFromSelectedOrg = typeof localStorage !== 'undefined' ? localStorage.getItem("selectedOrganization") : null;
    const orgIdFromSession = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem("organizationId") : null;
    const orgIdFromSessionProfile = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem("profileOrg") : null;
    
    // Usar '2' como valor predeterminado, ya que los clientes en la base de datos tienen organization_id = 2
    const fallbackId = "2";
    
    // Retornar el primer ID que encontremos
    const organizationId = orgIdFromProfile || 
                          orgIdFromSelectedOrg || 
                          orgIdFromSession || 
                          orgIdFromSessionProfile || 
                          fallbackId;
    
    console.log(`ID de organización encontrado: ${organizationId} (fuente: ${orgIdFromProfile ? 'profileOrg' : 
                                                                            orgIdFromSelectedOrg ? 'selectedOrganization' : 
                                                                            orgIdFromSession ? 'organizationId' : 
                                                                            orgIdFromSessionProfile ? 'sessionProfileOrg' : 
                                                                            'fallback'})`);
    return organizationId;
  } catch (error) {
    console.error('Error al obtener el ID de organización:', error);
    // Usar el valor 2 como fallback
    return "2";
  }
};

/**
 * Agrupar oportunidades por cliente para mostrar estadísticas
 */
export const processCustomersWithOpportunities = (
  customers: any[],
  opportunities: any[]
): Customer[] => {
  // Crear un mapa para buscar oportunidades por cliente_id
  const opportunitiesByCustomer = opportunities.reduce<Record<string, any[]>>((acc, opp: any) => {
    if (!acc[opp.customer_id]) {
      acc[opp.customer_id] = [];
    }
    acc[opp.customer_id].push(opp);
    return acc;
  }, {});

  // Procesar cada cliente con sus estadísticas
  return customers.map((customer) => {
    const customerOpportunities = opportunitiesByCustomer[customer.id] || [];
    const activeOpportunities = customerOpportunities.filter(
      (opp: any) => opp.status === "active"
    ).length;
    const wonOpportunities = customerOpportunities.filter(
      (opp: any) => opp.status === "won"
    ).length;
    const lostOpportunities = customerOpportunities.filter(
      (opp: any) => opp.status === "lost"
    ).length;
    const totalValue = customerOpportunities.reduce(
      (sum: number, opp: any) => sum + (parseFloat(opp.amount) || 0),
      0
    );

    // Ordenar oportunidades por fecha de creación (más reciente primero)
    const sortedOpportunities = [...customerOpportunities].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return {
      ...customer,
      has_opportunities: customerOpportunities.length > 0,
      total_opportunities: customerOpportunities.length,
      active_opportunities: activeOpportunities,
      won_opportunities: wonOpportunities,
      lost_opportunities: lostOpportunities,
      total_value: totalValue,
      latest_opportunity: sortedOpportunities.length > 0 ? {
        id: sortedOpportunities[0].id,
        name: sortedOpportunities[0].name,
        status: sortedOpportunities[0].status,
        amount: sortedOpportunities[0].amount,
        stage_id: sortedOpportunities[0].stage_id,
        created_at: sortedOpportunities[0].created_at,
      } : undefined,
      opportunities: sortedOpportunities,
    };
  });
};

/**
 * Enviar correo electrónico utilizando la aplicación de correo predeterminada
 */
export const sendCustomerEmail = (customer: Customer): void => {
  if (customer.email) {
    const subject = encodeURIComponent("Seguimiento");
    const body = encodeURIComponent(
      `Estimado/a ${customer.full_name},\n\nEspero que este mensaje le encuentre bien.\n\n` +
      `Quería hacer seguimiento sobre nuestras conversaciones recientes.\n\n` +
      `Saludos cordiales,\n\n`
    );
    window.location.href = `mailto:${customer.email}?subject=${subject}&body=${body}`;
  } else {
    alert("Este cliente no tiene dirección de correo electrónico registrada.");
  }
};

/**
 * Cargar historial de interacciones de un cliente
 */
export const loadCustomerHistory = async (
  customerId: string,
  organizationId: string
): Promise<CustomerInteraction[]> => {
  try {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("related_id", customerId)
      .eq("related_type", "customer")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error("Error al cargar historial del cliente:", error);
    return [];
  }
};

/**
 * Filtrar clientes por término de búsqueda
 */
export const filterCustomers = (customers: Customer[], searchQuery: string): Customer[] => {
  if (!searchQuery) return customers;
  
  const searchLower = searchQuery.toLowerCase();
  return customers.filter((customer) => (
    (customer.full_name && customer.full_name.toLowerCase().includes(searchLower)) ||
    (customer.email && customer.email.toLowerCase().includes(searchLower)) ||
    (customer.address && customer.address.toLowerCase().includes(searchLower)) ||
    (customer.phone && customer.phone.toLowerCase().includes(searchLower))
  ));
};

/**
 * Ordenar clientes por campo y dirección
 */
export const sortCustomers = (
  customers: Customer[], 
  sortField: string, 
  sortDirection: "asc" | "desc"
): Customer[] => {
  return [...customers].sort((a, b) => {
    let valueA, valueB;

    switch (sortField) {
      case "full_name":
        valueA = a.full_name;
        valueB = b.full_name;
        break;
      case "email":
        valueA = a.email || "";
        valueB = b.email || "";
        break;
      case "total_opportunities":
        valueA = a.total_opportunities;
        valueB = b.total_opportunities;
        break;
      case "total_value":
        valueA = a.total_value;
        valueB = b.total_value;
        break;
      default:
        valueA = a.full_name;
        valueB = b.full_name;
        break;
    }

    if (sortDirection === "asc") {
      return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
    } else {
      return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
    }
  });
};
