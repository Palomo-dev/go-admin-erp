"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PipelineHeader from "./PipelineHeader";
import PipelineStages from "./PipelineStages";
import ForecastView from "./ForecastView";
import TableView from "./TableView";
import ClientsView from "./ClientsView";
import AutomationsView from "./AutomationsView";
import { Plus, FolderPlus } from "lucide-react";
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from "@/components/common/PageSkeletons";
import { useOrganization } from "@/lib/hooks/useOrganization";

export default function PipelineView() {
  const [currentPipelineId, setCurrentPipelineId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  
  // Usar el hook useOrganization para obtener la organización
  const { organization, isLoading: orgLoading } = useOrganization();
  const organizationId = organization?.id || null;

  // Cargar el pipeline predeterminado cuando tenemos el ID de la organización
  useEffect(() => {
    const loadDefaultPipeline = async () => {
      // Esperar a que termine de cargar la organización
      if (orgLoading) return;
      if (!organizationId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      
      // Intentamos obtener el pipeline predeterminado
      const { data: defaultPipeline, error: defaultError } = await supabase
        .from("pipelines")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("is_default", true)
        .maybeSingle();

      if (defaultError && defaultError.code !== "PGRST116") {
        console.error("Error al cargar el pipeline predeterminado:", defaultError);
      }

      // Si encontramos un pipeline predeterminado, lo usamos
      if (defaultPipeline) {
        setCurrentPipelineId(defaultPipeline.id);
        setLoading(false);
        return;
      }

      // Si no hay pipeline predeterminado, obtenemos el primer pipeline
      const { data: firstPipeline, error: firstError } = await supabase
        .from("pipelines")
        .select("id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstError && firstError.code !== "PGRST116") {
        console.error("Error al cargar el primer pipeline:", firstError);
      } else if (firstPipeline) {
        setCurrentPipelineId(firstPipeline.id);
      }

      setLoading(false);
    };

    loadDefaultPipeline();
  }, [organizationId, orgLoading]);

  const handlePipelineChange = (pipelineId: string) => {
    setCurrentPipelineId(pipelineId);
  };

  // Estado para abrir el dialog de crear pipeline (controlado por PipelineHeader)
  const [isCreatePipelineOpen, setIsCreatePipelineOpen] = useState(false);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <PipelineHeader 
        currentPipelineId={currentPipelineId}
        onPipelineChange={handlePipelineChange}
        externalCreateDialogOpen={isCreatePipelineOpen}
        onExternalCreateDialogOpenChange={setIsCreatePipelineOpen}
      />
      
      <Tabs defaultValue="kanban" className="w-full px-3 sm:px-4 pt-4">
        <div className="flex justify-center mb-4 px-2 sm:px-0">
          <TabsList className="flex flex-wrap justify-center gap-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 h-auto p-1 rounded-lg w-full sm:w-auto">
            <TabsTrigger value="kanban" className="text-xs sm:text-sm font-medium min-h-[32px] sm:min-h-[38px] px-2 sm:px-4 rounded-md data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all">Kanban</TabsTrigger>
            <TabsTrigger value="table" className="text-xs sm:text-sm font-medium min-h-[32px] sm:min-h-[38px] px-2 sm:px-4 rounded-md data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all">Tabla</TabsTrigger>
            <TabsTrigger value="forecast" className="text-xs sm:text-sm font-medium min-h-[32px] sm:min-h-[38px] px-2 sm:px-4 rounded-md data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all">Pronóstico</TabsTrigger>
            <TabsTrigger value="clients" className="text-xs sm:text-sm font-medium min-h-[32px] sm:min-h-[38px] px-2 sm:px-4 rounded-md data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all">Clientes</TabsTrigger>
            <TabsTrigger value="automation" className="text-xs sm:text-sm font-medium min-h-[32px] sm:min-h-[38px] px-2 sm:px-4 rounded-md data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all hidden sm:inline-flex">Automatización</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="kanban" className="mt-0">
          {currentPipelineId ? (
            <PipelineStages pipelineId={currentPipelineId} />
          ) : (
            <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-lg shadow border border-blue-100 dark:border-blue-900">
              <FolderPlus className="h-12 w-12 text-blue-500 dark:text-blue-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-blue-700 dark:text-blue-300 mb-2">No hay pipeline configurado</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Crea un pipeline para comenzar a gestionar tus oportunidades.
              </p>
              <Button
                onClick={() => setIsCreatePipelineOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
              >
                <Plus className="h-5 w-5 mr-2" />
                Crear Pipeline
              </Button>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="table">
          {currentPipelineId ? (
            <TableView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 sm:p-6 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Seleccione un pipeline para ver la tabla
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="forecast">
          {currentPipelineId ? (
            <ForecastView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 sm:p-6 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Seleccione un pipeline para ver el pronóstico
            </div>
          )}
        </TabsContent>

        <TabsContent value="clients">
          {currentPipelineId ? (
            <ClientsView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 sm:p-6 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Seleccione un pipeline para ver los clientes
            </div>
          )}
        </TabsContent>

        <TabsContent value="automation">
          {currentPipelineId ? (
            <AutomationsView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 sm:p-6 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Seleccione un pipeline para configurar automatizaciones
            </div>
          )}
        </TabsContent>
      </Tabs>

    </div>
  );
}
