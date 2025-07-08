"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/utils/Utils";
import { Mail, Phone, Building, Search, MoreHorizontal, Users, ArrowUpDown, Briefcase, MapPin, FileText, Clock, CalendarDays, Calculator, TrendingUp } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  created_at?: string;
  organization_id: number;
  total_opportunities: number;
  total_value: number;
  active_opportunities: number;
  won_opportunities: number;
  lost_opportunities: number;
  has_opportunities: boolean;
  latest_opportunity?: {
    id: string;
    name?: string;
    status: string;
    amount?: number;
    stage_id?: string;
    created_at?: string;
  };
  opportunities?: any[];
}

interface ClientsViewProps {
  pipelineId: string;
}

const ClientsView: React.FC<ClientsViewProps> = ({ pipelineId }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<string>("full_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Obtener el ID de la organización de localStorage o sessionStorage
  useEffect(() => {
    // Lista de posibles claves donde podría estar almacenado el ID de la organización
    const possibleKeys = [
      "currentOrganizationId",
      "organizationId", 
      "selectedOrganizationId",
      "orgId",
      "organization_id"
    ];
    
    // Buscar en localStorage
    for (const key of possibleKeys) {
      const orgId = localStorage.getItem(key);
      if (orgId) {
        console.log(`Organización encontrada en localStorage con clave: ${key}`, orgId);
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no está en localStorage, buscar en sessionStorage
    for (const key of possibleKeys) {
      const orgId = sessionStorage.getItem(key);
      if (orgId) {
        console.log(`Organización encontrada en sessionStorage con clave: ${key}`, orgId);
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no se encuentra, usar un valor predeterminado para desarrollo
    if (process.env.NODE_ENV !== 'production') {
      console.log('Usando ID de organización predeterminado para desarrollo: 2');
      setOrganizationId(2); // Valor predeterminado para desarrollo
    } else {
      console.error('No se pudo encontrar el ID de organización en el almacenamiento local');
    }
  }, []);

  // Cargar datos de clientes cuando cambie el pipelineId o organizationId
  useEffect(() => {
    if (!pipelineId || !organizationId) return;
    
    const loadData = async () => {
      setLoading(true);
      
      try {
        console.log(`Cargando clientes para pipeline ${pipelineId} y organización ${organizationId}`);
        
        // Consulta optimizada para obtener todos los clientes de la organización
        // sin filtrar primero por oportunidades para tener una lista completa
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, full_name, email, phone, address, created_at, notes, organization_id")
          .eq("organization_id", organizationId)
          .order("full_name");
          
        if (customersError) {
          console.error("Error al cargar clientes:", customersError);
          throw customersError;
        }
        
        if (!customersData || customersData.length === 0) {
          console.log("No se encontraron clientes para esta organización");
          setCustomers([]);
          setLoading(false);
          return;
        }
        
        console.log(`Se encontraron ${customersData.length} clientes`);
        
        // Consulta única para obtener todas las oportunidades relacionadas con estos clientes
        // en el pipeline actual, para evitar múltiples consultas individuales
        const customerIds = customersData.map(c => c.id);
        
        const { data: opportunitiesData, error: oppsError } = await supabase
          .from("opportunities")
          .select("id, customer_id, amount, status, stage_id, name, created_at")
          .in("customer_id", customerIds)
          .eq("pipeline_id", pipelineId);
          
        if (oppsError) {
          console.error("Error al cargar oportunidades:", oppsError);
          throw oppsError;
        }
        
        const opportunities = opportunitiesData || [];
        console.log(`Se encontraron ${opportunities.length} oportunidades relacionadas`);
        
        // Agrupar oportunidades por cliente para un procesamiento eficiente
        const opportunitiesByCustomer: Record<string, any[]> = {};
        
        opportunities.forEach(opp => {
          if (!opportunitiesByCustomer[opp.customer_id]) {
            opportunitiesByCustomer[opp.customer_id] = [];
          }
          opportunitiesByCustomer[opp.customer_id].push(opp);
        });
        
        // Combinar datos de clientes con estadísticas de oportunidades
        const customersWithStats = customersData.map(customer => {
          const customerOpps = opportunitiesByCustomer[customer.id] || [];
          const totalValue = customerOpps.reduce((sum, opp) => sum + parseFloat(opp.amount || 0), 0);
          
          // Contar oportunidades por estado
          const activeOpportunities = customerOpps.filter(opp => opp.status === "open").length;
          const wonOpportunities = customerOpps.filter(opp => opp.status === "won").length;
          const lostOpportunities = customerOpps.filter(opp => opp.status === "lost").length;
          
          // Obtener la oportunidad más reciente
          const latestOpportunity = customerOpps.length > 0 ? 
            customerOpps.reduce((latest, current) => {
              return new Date(current.created_at || 0) > new Date(latest.created_at || 0) ? current : latest;
            }) : null;
          
          return {
            ...customer,
            total_opportunities: customerOpps.length,
            active_opportunities: activeOpportunities,
            won_opportunities: wonOpportunities,
            lost_opportunities: lostOpportunities,
            total_value: totalValue,
            has_opportunities: customerOpps.length > 0,
            latest_opportunity: latestOpportunity,
            opportunities: customerOpps
          };
        });
        
        setCustomers(customersWithStats);
      } catch (error) {
        console.error("Error al cargar datos de clientes:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [pipelineId, organizationId]);

  // Función para manejar cambio de orden
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };
  
  // Funciones para manejar acciones del menú de cliente
  const handleViewCustomerDetails = (customer: Customer) => {
    console.log("Ver detalles del cliente", customer.id);
    // Aquí se podría navegar a la página de detalles del cliente
    // o abrir un modal con los detalles completos
  };
  
  const handleEditCustomer = (customer: Customer) => {
    console.log("Editar información del cliente", customer.id);
    // Aquí se podría abrir un formulario de edición
  };
  
  const handleCreateOpportunity = (customer: Customer) => {
    console.log("Crear nueva oportunidad para el cliente", customer.id);
    // Aquí se podría navegar a la página de creación de oportunidades
    // o abrir un modal para crear una nueva oportunidad
  };
  
  const handleSendEmail = (customer: Customer) => {
    if (customer.email) {
      window.location.href = `mailto:${customer.email}?subject=GoAdmin: Seguimiento`;
    } else {
      alert("Este cliente no tiene dirección de correo electrónico registrada.");
    }
  };
  
  const handleViewHistory = (customer: Customer) => {
    console.log("Ver historial del cliente", customer.id);
    // Aquí se podría navegar a la página de historial
    // o abrir un modal con el historial de interacciones
  };

  // Filtrar clientes por búsqueda
  const filteredCustomers = customers.filter(customer => {
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    return (
      (customer.full_name && customer.full_name.toLowerCase().includes(searchLower)) ||
      (customer.email && customer.email.toLowerCase().includes(searchLower)) ||
      (customer.address && customer.address.toLowerCase().includes(searchLower)) ||
      (customer.phone && customer.phone.toLowerCase().includes(searchLower))
    );
  }).sort((a, b) => {
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

  // Mostrar esqueleto mientras carga
  if (loading) {
    return (
      <div className="p-4">
        <div className="flex justify-center items-center h-40">
          <LoadingSpinner size="lg" className="text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Resumen de clientes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de clientes</CardDescription>
            <CardTitle>{customers.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Users className="h-5 w-5 text-blue-500" />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Oportunidades activas</CardDescription>
            <CardTitle>{customers.reduce((sum, c) => sum + c.active_opportunities, 0)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Briefcase className="h-5 w-5 text-amber-500" />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Oportunidades ganadas</CardDescription>
            <CardTitle>{customers.reduce((sum, c) => sum + c.won_opportunities, 0)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Briefcase className="h-5 w-5 text-green-500" />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor total</CardDescription>
            <CardTitle>{formatCurrency(customers.reduce((sum, c) => sum + c.total_value, 0))}</CardTitle>
          </CardHeader>
          <CardContent>
            <Briefcase className="h-5 w-5 text-blue-500" />
          </CardContent>
        </Card>
      </div>
      
      {/* Búsqueda */}
      <div className="relative flex-grow mb-4 max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
        <Input
          placeholder="Buscar clientes..."
          className="pl-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      
      {/* Tabla de clientes */}
      <div className="rounded-md border border-gray-200 dark:border-gray-800">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50">
              <TableHead 
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleSort("full_name")}
              >
                <div className="flex items-center gap-1">
                  Cliente
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleSort("total_opportunities")}
              >
                <div className="flex items-center gap-1">
                  Oportunidades
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 text-right"
                onClick={() => handleSort("total_value")}
              >
                <div className="flex items-center gap-1 justify-end">
                  Valor total
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No se encontraron clientes
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="text-blue-600 dark:text-blue-400">{customer.full_name}</span>
                      {customer.address && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <MapPin className="h-3 w-3" />
                          <span>{customer.address}</span>
                        </div>
                      )}
                      {customer.notes && (
                        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 mt-1 italic line-clamp-1">
                          <FileText className="h-3 w-3" />
                          <span>{customer.notes}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Building className="h-4 w-4 text-blue-500" />
                      <span className="text-gray-600 dark:text-gray-300 font-medium">{customer.full_name.split(' ')[0]}</span>
                    </div>
                    {customer.created_at && (
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        <span>Desde: {new Date(customer.created_at).toLocaleDateString('es-CO')}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {customer.email && (
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3.5 w-3.5 text-blue-500" />
                          <a href={`mailto:${customer.email}`} className="hover:text-blue-600 hover:underline">{customer.email}</a>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3.5 w-3.5 text-blue-500" />
                          <a href={`tel:${customer.phone}`} className="hover:text-blue-600 hover:underline">{customer.phone}</a>
                        </div>
                      )}
                      {!customer.email && !customer.phone && (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">Sin contacto</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-500 px-2 py-1 rounded-full text-sm font-medium">
                        {customer.total_opportunities}
                      </div>
                      {customer.active_opportunities > 0 && (
                        <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-500 px-2 py-1 rounded-full text-xs font-medium">
                          {customer.active_opportunities} activas
                        </div>
                      )}
                      {customer.won_opportunities > 0 && (
                        <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-500 px-2 py-1 rounded-full text-xs font-medium">
                          {customer.won_opportunities} ganadas
                        </div>
                      )}
                      {customer.lost_opportunities > 0 && (
                        <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-500 px-2 py-1 rounded-full text-xs font-medium">
                          {customer.lost_opportunities} perdidas
                        </div>
                      )}
                    </div>
                    {customer.latest_opportunity && (
                      <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Última: {customer.latest_opportunity.name || "Sin nombre"}</span>
                        {customer.latest_opportunity.status && (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${customer.latest_opportunity.status === 'won' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-500' : customer.latest_opportunity.status === 'lost' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-500' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-500'}`}>
                            {customer.latest_opportunity.status === 'won' ? 'ganada' : customer.latest_opportunity.status === 'lost' ? 'perdida' : 'activa'}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-medium text-blue-700 dark:text-blue-400">
                      {formatCurrency(customer.total_value)}
                    </div>
                    {customer.total_opportunities > 0 && (
                      <div className="text-xs text-gray-500 mt-1 flex items-center justify-end gap-1">
                        <Calculator className="h-3 w-3" />
                        <span>{formatCurrency(customer.total_value / customer.total_opportunities)} prom.</span>
                      </div>
                    )}
                    {customer.won_opportunities > 0 && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center justify-end gap-1">
                        <TrendingUp className="h-3 w-3" />
                        <span>Ganado: {formatCurrency(customer.opportunities?.filter(o => o.status === 'won').reduce((sum, opp) => sum + parseFloat(opp.amount || 0), 0))}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Abrir menú</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem 
                          className="cursor-pointer" 
                          onClick={() => handleViewCustomerDetails(customer)}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Ver detalles del cliente
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="cursor-pointer"
                          onClick={() => handleEditCustomer(customer)}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Editar información
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="cursor-pointer"
                          onClick={() => handleCreateOpportunity(customer)}
                        >
                          <Briefcase className="h-4 w-4 mr-2" />
                          Crear nueva oportunidad
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="cursor-pointer"
                          onClick={() => handleSendEmail(customer)}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Enviar correo
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="cursor-pointer"
                          onClick={() => handleViewHistory(customer)}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Ver historial
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ClientsView;
