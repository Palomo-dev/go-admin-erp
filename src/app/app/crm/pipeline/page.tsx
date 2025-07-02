"use client";

import { useEffect, useState } from "react";
import { Plus, BarChart2, Settings, Users } from "lucide-react";
import { KanbanBoard } from "@/components/crm/pipeline/KanbanBoard";
import { CustomerDashboard } from "@/components/crm/pipeline/CustomerDashboard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function PipelinePage() {
  const [activeTab, setActiveTab] = useState<string>("kanban");
  const [showStageManager, setShowStageManager] = useState<boolean>(false);
  const { theme, setTheme } = useTheme();

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">Pipeline de Oportunidades</h1>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Configuración</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowStageManager(!showStageManager)}>
                {showStageManager ? "Ocultar" : "Mostrar"} gestor de etapas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Tema</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTheme("light")}>Claro</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>Oscuro</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>Sistema</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Nueva Oportunidad
          </Button>
        </div>
      </div>

      <Tabs
        defaultValue="kanban"
        className="w-full"
        onValueChange={setActiveTab}
      >
        <div className="mb-6">
          <TabsList className="mb-4">
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="forecast">Pronóstico</TabsTrigger>
            <TabsTrigger value="customers"><Users className="h-4 w-4 mr-1" />Clientes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="kanban">
            <KanbanBoard showStageManager={showStageManager} />
          </TabsContent>

          <TabsContent value="list">
            <div className="bg-muted/20 border rounded-md p-8 text-center">
              <BarChart2 className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium">Vista de Lista</h3>
              <p className="text-muted-foreground">
                La vista de lista estará disponible próximamente.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="forecast">
            <div className="bg-muted/20 border rounded-md p-8 text-center">
              <BarChart2 className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium">Vista de Pronóstico</h3>
              <p className="text-muted-foreground">
                La vista detallada de pronósticos estará disponible próximamente.
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="customers">
            <CustomerDashboard />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
