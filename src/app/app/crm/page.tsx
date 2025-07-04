'use client';

import { useState } from 'react';
import { CustomersList } from '@/components/crm/customers/CustomersList';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Users, PieChart, BarChart2, Settings2 } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export default function CrmPage() {
  const [activeTab, setActiveTab] = useState('clientes');

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">CRM</h1>
          <p className="text-muted-foreground">Gestión de clientes y oportunidades de venta</p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/crm/pipeline">
            <Button variant="outline">
              <BarChart2 className="h-4 w-4 mr-2" />
              Pipeline
            </Button>
          </Link>
          <ThemeToggle />
          <Button variant="outline">
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="clientes" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-[400px] mb-8">
          <TabsTrigger value="clientes">
            <Users className="h-4 w-4 mr-2" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="estadisticas">
            <PieChart className="h-4 w-4 mr-2" />
            Estadísticas
          </TabsTrigger>
          <TabsTrigger value="configuracion">
            <Settings2 className="h-4 w-4 mr-2" />
            Configuración
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="space-y-4">
          <CustomersList />
        </TabsContent>
        
        <TabsContent value="estadisticas">
          <div className="bg-muted rounded-lg p-8 text-center">
            <PieChart className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium mb-2">Estadísticas de CRM</h3>
            <p className="text-muted-foreground">Esta sección está en desarrollo. Pronto podrás ver estadísticas de tus clientes y oportunidades.</p>
          </div>
        </TabsContent>
        
        <TabsContent value="configuracion">
          <div className="bg-muted rounded-lg p-8 text-center">
            <Settings2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium mb-2">Configuración de CRM</h3>
            <p className="text-muted-foreground">Aquí podrás personalizar campos, etapas y otras configuraciones del CRM.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
