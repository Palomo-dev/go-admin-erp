'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CurrencyTable from "@/components/finanzas/monedas/CurrencyTable";
import ExchangeRatesTable from "@/components/finanzas/monedas/ExchangeRatesTable";
import ExchangeRatesChart from "@/components/finanzas/monedas/ExchangeRatesChart";
import CurrencyPreferences from "@/components/finanzas/monedas/CurrencyPreferences";
import { useState, useEffect } from "react";
import { obtenerOrganizacionActiva } from "@/lib/hooks/useOrganization";

export default function MonedasPage() {
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  
  // Obtener organización activa al cargar el componente
  useEffect(() => {
    const org = obtenerOrganizacionActiva();
    setOrganizationId(org.id);
  }, []);

  if (!organizationId) {
    return <div className="flex items-center justify-center h-96 px-4">
      <div className="text-center">
        <p className="text-base sm:text-lg mb-2 font-semibold text-gray-600 dark:text-gray-300">Cargando...</p>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Obteniendo información de la organización</p>
      </div>
    </div>;
  }

  return (
    <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-3 sm:px-4 md:px-6">
      <div className="flex flex-col gap-2 sm:gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 dark:text-blue-400">
          Monedas & Tipo de Cambio
        </h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Gestiona las monedas de tu organización y configura las tasas de cambio automáticas.
        </p>
      </div>

      <Tabs defaultValue="currencies" className="w-full">
        <TabsList className="mb-4 sm:mb-6 w-full h-auto sm:w-auto grid grid-cols-2 sm:flex gap-2 p-2 bg-gray-100 dark:bg-gray-800/80 rounded-lg">
          <TabsTrigger 
            value="currencies" 
            className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md whitespace-nowrap"
          >
            Monedas
          </TabsTrigger>
          <TabsTrigger 
            value="rates" 
            className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md whitespace-nowrap"
          >
            Tasas de Cambio
          </TabsTrigger>
          <TabsTrigger 
            value="preferences" 
            className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md whitespace-nowrap"
          >
            Preferencias
          </TabsTrigger>
          <TabsTrigger 
            value="logs" 
            className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md whitespace-nowrap"
          >
            Histórico
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="currencies">
          <Card className="dark:bg-gray-800/50 bg-white border-gray-200 dark:border-gray-700">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl text-blue-600 dark:text-blue-400">Catálogo de Monedas</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <CurrencyTable organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rates">
          <Card className="dark:bg-gray-800/50 bg-white border-gray-200 dark:border-gray-700">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl text-blue-600 dark:text-blue-400">Tasas de Cambio</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <ExchangeRatesTable organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card className="dark:bg-gray-800/50 bg-white border-gray-200 dark:border-gray-700">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl text-blue-600 dark:text-blue-400">Preferencias de Moneda</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <CurrencyPreferences organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="dark:bg-gray-800/50 bg-white border-gray-200 dark:border-gray-700">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl text-blue-600 dark:text-blue-400">Histórico de Tasas</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <ExchangeRatesChart organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
