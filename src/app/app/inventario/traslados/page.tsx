'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import TrasladorSucursales from '@/components/inventario/traslados/TrasladorSucursales';
import ListaTraslados from '@/components/inventario/traslados/ListaTraslados';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';

export default function TrasladosPage() {
  const { organization, isLoading } = useOrganization();
  const [activeTab, setActiveTab] = useState<string>("nuevo");

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Cargando información...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold tracking-tight mb-4">Traslados entre Sucursales</h1>
      <p className="text-muted-foreground mb-6">
        Administra el movimiento de inventario entre tus sucursales de forma eficiente
      </p>

      <Tabs defaultValue="nuevo" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 mb-8">
          <TabsTrigger value="nuevo">Nuevo Traslado</TabsTrigger>
          <TabsTrigger value="historial">Historial de Traslados</TabsTrigger>
        </TabsList>
        
        <TabsContent value="nuevo">
          <Card>
            <CardHeader>
              <CardTitle>Crear Nuevo Traslado</CardTitle>
              <CardDescription>
                Selecciona las sucursales de origen y destino, y los productos a trasladar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrasladorSucursales organizationId={organization?.id} />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="historial">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Traslados</CardTitle>
              <CardDescription>
                Consulta y gestiona todos los traslados entre sucursales
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ListaTraslados organizationId={organization?.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
