"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase/config";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/utils/Utils";
import { translateOpportunityStatus } from '@/utils/crmTranslations';

// Importaciones de UI
import LoadingSpinner from "@/components/ui/loading-spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { ArrowUpDown, MoreHorizontal, Search, Filter } from "lucide-react";

interface Stage {
  id: string;
  name: string;
  position: number;
}

interface Customer {
  id: string;
  full_name: string;
  email?: string;
}

interface Opportunity {
  id: string;
  name: string;
  stage_id: string;
  stage_name?: string;
  customer_id: string;
  customer_name?: string;
  amount: number;
  probability: number;
  expected_close_date?: string;
  status: string;
  created_at: string;
}

interface TableViewProps {
  pipelineId: string;
}

const TableView: React.FC<TableViewProps> = ({ pipelineId }) => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<string>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [deleteOpportunityId, setDeleteOpportunityId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const router = useRouter();

  // Obtener el ID de la organización del localStorage
  useEffect(() => {
    const orgId = localStorage.getItem("currentOrganizationId");
    if (orgId) {
      setOrganizationId(Number(orgId));
    }
  }, []);

  // Cargar datos cuando cambie el pipelineId o organizationId
  useEffect(() => {
    if (!pipelineId || !organizationId) return;
    
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Cargar etapas
        const { data: stagesData, error: stagesError } = await supabase
          .from("stages")
          .select("id, name, position")
          .eq("pipeline_id", pipelineId)
          .order("position");
          
        if (stagesError) throw stagesError;
        
        if (stagesData) {
          setStages(stagesData);
        }
        
        // Cargar oportunidades con información relacionada
        const { data: oppsData, error: oppsError } = await supabase
          .from("opportunities")
          .select(`
            id, name, amount, currency, expected_close_date, status, 
            stage_id, customer_id, created_at, updated_at,
            stages:stage_id(name, probability),
            customers:customer_id(full_name, email)
          `)
          .eq("organization_id", organizationId)
          .eq("pipeline_id", pipelineId)
          .order("created_at", { ascending: false });
          
        if (oppsError) throw oppsError;
        
        if (oppsData) {
          // Transformar los datos para el formato que necesitamos
          // Procesamos los datos de manera segura para evitar errores de tipo
          const formattedOpps: Opportunity[] = oppsData.map(opp => {
            // Manejo seguro para el nombre de la etapa
            let stageName: string | undefined = undefined;
            if (opp.stages) {
              if (Array.isArray(opp.stages) && opp.stages.length > 0) {
                stageName = opp.stages[0]?.name;
              } else if (typeof opp.stages === 'object' && opp.stages !== null) {
                stageName = (opp.stages as any).name;
              }
            }
            
            // Manejo seguro para el nombre del cliente
            let customerName: string | undefined = undefined;
            if (opp.customers) {
              if (Array.isArray(opp.customers) && opp.customers.length > 0) {
                customerName = opp.customers[0]?.full_name;
              } else if (typeof opp.customers === 'object' && opp.customers !== null) {
                customerName = (opp.customers as any).full_name;
              }
            }
            
            // Manejo seguro para la probabilidad
            let probability = 0;
            if (opp.stages) {
              if (Array.isArray(opp.stages) && opp.stages.length > 0) {
                probability = opp.stages[0]?.probability || 0;
              } else if (typeof opp.stages === 'object' && opp.stages !== null) {
                probability = (opp.stages as any).probability || 0;
              }
            }
            
            return {
              id: opp.id,
              name: opp.name,
              stage_id: opp.stage_id,
              stage_name: stageName,
              customer_id: opp.customer_id,
              customer_name: customerName,
              amount: parseFloat(opp.amount) || 0,
              probability: probability,
              expected_close_date: opp.expected_close_date,
              status: opp.status,
              created_at: opp.created_at
            };
          });
          
          setOpportunities(formattedOpps);
        }
        
        setLoading(false);
      } catch (error) {
        console.error("Error al cargar datos:", error);
        setLoading(false);
      }
    };
    
    loadData();
  }, [pipelineId, organizationId]);

  // Filtrar y ordenar oportunidades
  const filteredOpportunities = useMemo(() => {
    let result = [...opportunities];
    
    // Aplicar filtro de búsqueda
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        opp => 
          opp.name.toLowerCase().includes(query) ||
          (opp.customer_name && opp.customer_name.toLowerCase().includes(query))
      );
    }
    
    // Aplicar filtro por etapa
    if (stageFilter) {
      result = result.filter(opp => opp.stage_id === stageFilter);
    }
    
    // Aplicar filtro por estado
    if (statusFilter) {
      result = result.filter(opp => opp.status === statusFilter);
    }
    
    // Ordenar resultados
    result.sort((a, b) => {
      let valueA, valueB;
      
      switch (sortField) {
        case "name":
          valueA = a.name;
          valueB = b.name;
          break;
        case "customer_name":
          valueA = a.customer_name || "";
          valueB = b.customer_name || "";
          break;
        case "amount":
          valueA = a.amount;
          valueB = b.amount;
          break;
        case "probability":
          valueA = a.probability;
          valueB = b.probability;
          break;
        case "expected_close_date":
          valueA = a.expected_close_date || "9999-12-31";
          valueB = b.expected_close_date || "9999-12-31";
          break;
        case "created_at":
        default:
          valueA = a.created_at;
          valueB = b.created_at;
          break;
      }
      
      if (sortDirection === "asc") {
        return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      } else {
        return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
      }
    });
    
    return result;
  }, [opportunities, searchQuery, stageFilter, statusFilter, sortField, sortDirection]);
  
  // Función para manejar cambio de orden
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };
  
  // Función para confirmar eliminación de oportunidad
  const confirmDeleteOpportunity = (id: string) => {
    setDeleteOpportunityId(id);
    setIsDeleteDialogOpen(true);
  };
  
  // Función para editar oportunidad
  const editOpportunity = (id: string) => {
    // Navegar a la página de edición de oportunidad
    router.push(`/app/crm/pipeline/edit-opportunity?id=${id}`);
  };

  // Función para eliminar oportunidad
  const deleteOpportunity = async () => {
    if (!deleteOpportunityId) return;
    
    setIsDeleting(true);
    
    try {
      const { error } = await supabase
        .from("opportunities")
        .delete()
        .eq("id", deleteOpportunityId);
        
      if (error) throw error;
      
      // Actualizar estado local
      setOpportunities(prevOpps => 
        prevOpps.filter(opp => opp.id !== deleteOpportunityId)
      );
      
      toast({
        title: "Oportunidad eliminada",
        description: "La oportunidad ha sido eliminada correctamente.",
      });
      
      setIsDeleteDialogOpen(false);
      setDeleteOpportunityId(null);
    } catch (error) {
      console.error("Error al eliminar oportunidad:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la oportunidad. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Mostrar esqueleto mientras carga
  if (loading) {
    return (
      <div className="p-3 sm:p-4">
        <div className="flex flex-col justify-center items-center h-40 gap-3">
          <LoadingSpinner size="lg" className="text-blue-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Cargando oportunidades...</span>
        </div>
      </div>
    );
  }
  
  // Renderizar la tabla de oportunidades
  return (
    <div className="space-y-4 p-3 sm:p-4">
      {/* Filtros y búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-500 dark:text-gray-400" />
          <Input
            placeholder="Buscar oportunidades..."
            className="pl-9 sm:pl-10 h-11 sm:h-12 text-sm sm:text-base bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-h-[44px] flex items-center gap-2 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filtrar por etapa</span>
              <span className="sm:hidden">Etapa</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <DropdownMenuLabel className="text-gray-900 dark:text-gray-100 font-semibold">Etapas</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
            <DropdownMenuItem 
              className={`text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${!stageFilter ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
              onClick={() => setStageFilter(null)}
            >
              Todas las etapas
            </DropdownMenuItem>
            {stages.map((stage) => (
              <DropdownMenuItem
                key={stage.id}
                className={`text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${stageFilter === stage.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                onClick={() => setStageFilter(stage.id)}
              >
                {stage.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-h-[44px] flex items-center gap-2 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filtrar por estado</span>
              <span className="sm:hidden">Estado</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <DropdownMenuLabel className="text-gray-900 dark:text-gray-100 font-semibold">Estado</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
            <DropdownMenuItem 
              className={`text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${!statusFilter ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
              onClick={() => setStatusFilter(null)}
            >
              Todos los estados
            </DropdownMenuItem>
            <DropdownMenuItem
              className={`text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${statusFilter === "active" ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
              onClick={() => setStatusFilter("active")}
            >
              Activa
            </DropdownMenuItem>
            <DropdownMenuItem
              className={`text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${statusFilter === "won" ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
              onClick={() => setStatusFilter("won")}
            >
              Ganada
            </DropdownMenuItem>
            <DropdownMenuItem
              className={`text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${statusFilter === "lost" ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
              onClick={() => setStatusFilter("lost")}
            >
              Perdida
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Diálogo de confirmación de eliminación */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="mx-4">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl text-gray-900 dark:text-gray-100">¿Estás seguro?</DialogTitle>
            <DialogDescription className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Esta acción no se puede deshacer. Esta eliminará permanentemente la oportunidad
              y todos los datos asociados a ella.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="w-full sm:w-auto min-h-[44px] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={deleteOpportunity}
              disabled={isDeleting}
              className="w-full sm:w-auto min-h-[44px]"
            >
              {isDeleting ? (
                <>
                  <span className="mr-2">Eliminando</span>
                  <LoadingSpinner size="sm" />
                </>
              ) : (
                "Eliminar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Tabla de oportunidades */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
              <TableHead 
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">
                  Oportunidad
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm hidden sm:table-cell"
                onClick={() => handleSort("customer_name")}
              >
                <div className="flex items-center gap-1">
                  Cliente
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm hidden md:table-cell"
                onClick={() => handleSort("stage_name")}
              >
                <div className="flex items-center gap-1">
                  Etapa
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm text-right"
                onClick={() => handleSort("amount")}
              >
                <div className="flex items-center gap-1 justify-end">
                  Monto
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm text-right hidden lg:table-cell"
                onClick={() => handleSort("expected_close_date")}
              >
                <div className="flex items-center gap-1 justify-end">
                  Fecha cierre
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm">Estado</TableHead>
              <TableHead className="text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOpportunities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                  No se encontraron oportunidades
                </TableCell>
              </TableRow>
            ) : (
              filteredOpportunities.map((opportunity) => (
                <TableRow key={opportunity.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <TableCell className="font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                    <div className="flex flex-col">
                      <span>{opportunity.name}</span>
                      <span className="sm:hidden text-gray-600 dark:text-gray-400 font-normal mt-1">{opportunity.customer_name || "Sin cliente"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-gray-700 dark:text-gray-300 text-xs sm:text-sm">
                    {opportunity.customer_name || "Sin cliente"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-gray-700 dark:text-gray-300 text-xs sm:text-sm">
                    {opportunity.stage_name || "Sin etapa"}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                    {formatCurrency(opportunity.amount)}
                  </TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-gray-700 dark:text-gray-300 text-xs sm:text-sm">
                    {opportunity.expected_close_date 
                      ? new Date(opportunity.expected_close_date).toLocaleDateString()
                      : "Sin fecha"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        opportunity.status === "won" 
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 text-xs font-medium" 
                          : opportunity.status === "lost" 
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 text-xs font-medium"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-xs font-medium"
                      }
                    >
                      {translateOpportunityStatus(opportunity.status || 'active')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-5 w-5 sm:h-4 sm:w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <DropdownMenuItem onClick={() => editOpportunity(opportunity.id)} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Editar</DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => confirmDeleteOpportunity(opportunity.id)}
                          className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                        >
                          Eliminar
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
      
      {/* Este contenido fue eliminado porque ya tenemos un diálogo de confirmación implementado correctamente */}
    </div>
  );
};

export default TableView;
