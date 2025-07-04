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
    return <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <p className="text-lg mb-2 font-semibold text-gray-600 dark:text-gray-300">Cargando...</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Obteniendo información de la organización</p>
      </div>
    </div>;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-blue-600 dark:text-blue-400">Monedas & Tipo de Cambio</h1>
      </div>
      <p className="text-muted-foreground mb-6 dark:text-gray-400">
        Gestiona las monedas de tu organización y configura las tasas de cambio automáticas.
      </p>

      <Tabs defaultValue="currencies" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="currencies">Monedas</TabsTrigger>
          <TabsTrigger value="rates">Tasas de Cambio</TabsTrigger>
          <TabsTrigger value="preferences">Preferencias</TabsTrigger>
          <TabsTrigger value="logs">Histórico</TabsTrigger>
        </TabsList>
        
        <TabsContent value="currencies">
          <Card>
            <CardHeader>
              <CardTitle>Catálogo de Monedas</CardTitle>
            </CardHeader>
            <CardContent>
              <CurrencyTable organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rates">
          <Card>
            <CardHeader>
              <CardTitle>Tasas de Cambio</CardTitle>
            </CardHeader>
            <CardContent>
              <ExchangeRatesTable organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>Preferencias de Moneda</CardTitle>
            </CardHeader>
            <CardContent>
              <CurrencyPreferences organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Tasas</CardTitle>
            </CardHeader>
            <CardContent>
              <ExchangeRatesChart organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
