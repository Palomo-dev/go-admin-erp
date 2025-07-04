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
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/utils/Utils";
import { Mail, Phone, Building, Search, MoreHorizontal, Users, ArrowUpDown, Briefcase } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  company?: string;
  total_opportunities: number;
  total_value: number;
  active_opportunities: number;
  won_opportunities: number;
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

  // Obtener el ID de la organización del localStorage
  useEffect(() => {
    const orgId = localStorage.getItem("currentOrganizationId");
    if (orgId) {
      setOrganizationId(Number(orgId));
    }
  }, []);

  // Cargar datos de clientes cuando cambie el pipelineId o organizationId
  useEffect(() => {
    if (!pipelineId || !organizationId) return;
    
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Primero obtenemos los clientes con oportunidades en este pipeline
        const { data: customerOpps, error: oppsError } = await supabase
          .from("opportunities")
          .select("customer_id")
          .eq("organization_id", organizationId)
          .eq("pipeline_id", pipelineId)
          .order("customer_id");
          
        if (oppsError) throw oppsError;
        
        if (!customerOpps || customerOpps.length === 0) {
          setCustomers([]);
          setLoading(false);
          return;
        }
        
        // Extraer IDs de clientes únicos sin usar Set
        const customerIds: string[] = [];
        customerOpps.forEach(opp => {
          if (!customerIds.includes(opp.customer_id)) {
            customerIds.push(opp.customer_id);
          }
        });
        
        // Cargar datos de clientes
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, full_name, email, phone, company")
          .in("id", customerIds)
          .eq("organization_id", organizationId)
          .order("full_name");
          
        if (customersError) throw customersError;
        
        if (!customersData) {
          setCustomers([]);
          setLoading(false);
          return;
        }
        
        // Para cada cliente, obtener estadísticas de oportunidades
        const customersWithStats = await Promise.all(
          customersData.map(async (customer) => {
            // Obtener total de oportunidades y valor
            const { data: opportunitiesData } = await supabase
              .from("opportunities")
              .select("id, amount, status")
              .eq("customer_id", customer.id)
              .eq("pipeline_id", pipelineId)
              .eq("organization_id", organizationId);
              
            const opportunities = opportunitiesData || [];
            const totalValue = opportunities.reduce((sum, opp) => sum + parseFloat(opp.amount || 0), 0);
            const activeOpportunities = opportunities.filter(opp => opp.status === "active").length;
            const wonOpportunities = opportunities.filter(opp => opp.status === "won").length;
            
            return {
              ...customer,
              total_opportunities: opportunities.length,
              total_value: totalValue,
              active_opportunities: activeOpportunities,
              won_opportunities: wonOpportunities
            };
          })
        );
        
        setCustomers(customersWithStats);
        setLoading(false);
      } catch (error) {
        console.error("Error al cargar datos de clientes:", error);
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

  // Filtrar y ordenar clientes
  const filteredCustomers = customers
    .filter(customer => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        customer.full_name?.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.company?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      let valueA, valueB;
      
      switch (sortField) {
        case "full_name":
          valueA = a.full_name;
          valueB = b.full_name;
          break;
        case "company":
          valueA = a.company || "";
          valueB = b.company || "";
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
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">
                  Cliente
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleSort("company")}
              >
                <div className="flex items-center gap-1">
                  Empresa
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
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No se encontraron clientes
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    {customer.full_name}
                  </TableCell>
                  <TableCell>
                    {customer.company ? (
                      <div className="flex items-center gap-1">
                        <Building className="h-4 w-4 text-gray-500" />
                        <span>{customer.company}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">No especificado</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {customer.email && (
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3.5 w-3.5 text-gray-500" />
                          <span>{customer.email}</span>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3.5 w-3.5 text-gray-500" />
                          <span>{customer.phone}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{customer.total_opportunities}</div>
                      <div className="text-xs text-gray-500">
                        <span className="text-amber-600 dark:text-amber-500">{customer.active_opportunities} activas</span>, 
                        <span className="text-green-600 dark:text-green-500"> {customer.won_opportunities} ganadas</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(customer.total_value)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Ver detalle</DropdownMenuItem>
                        <DropdownMenuItem>Ver oportunidades</DropdownMenuItem>
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
