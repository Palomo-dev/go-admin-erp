'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, RefreshCw, Package, History, RotateCcw, Tag, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { TicketSearch } from '@/components/pos/devoluciones/TicketSearch';
import { ReturnForm } from '@/components/pos/devoluciones/ReturnForm';
import { ReturnsHistory } from '@/components/pos/devoluciones/ReturnsHistory';
import { SaleForReturn } from '@/components/pos/devoluciones/types';
import { toast } from 'sonner';

type ViewState = 'search' | 'process' | 'history';

export default function DevolucionesPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [activeView, setActiveView] = useState<ViewState>('search');
  const [selectedSale, setSelectedSale] = useState<SaleForReturn | null>(null);
  const [refreshHistoryTrigger, setRefreshHistoryTrigger] = useState(0);

  const handleSaleSelect = (sale: SaleForReturn) => {
    setSelectedSale(sale);
    setActiveView('process');
  };

  const handleBackToSearch = () => {
    setSelectedSale(null);
    setActiveView('search');
  };

  const handleReturnSuccess = () => {
    toast.success('Devolución procesada exitosamente');
    setSelectedSale(null);
    setActiveView('history');
    setRefreshHistoryTrigger(prev => prev + 1);
  };

  const handleTabChange = (value: string) => {
    setActiveView(value as ViewState);
    if (value === 'search') {
      setSelectedSale(null);
    }
  };

  if (orgLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <ArrowLeftRight className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="dark:text-white light:text-gray-900">
                    Devoluciones y Cambios - {organization?.name || 'Organización'}
                  </CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Gestiona devoluciones, reembolsos y notas de crédito
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/app/pos/devoluciones/motivos">
                  <Button variant="outline" size="sm" className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600">
                    <Tag className="h-4 w-4 mr-2" />
                    Motivos
                  </Button>
                </Link>
                <div className="text-right">
                  <div className="flex items-center space-x-2">
                    <Package className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date().toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge variant="outline" className="dark:border-blue-500 dark:text-blue-400 light:border-blue-500 light:text-blue-600">
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Sistema Activo
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Navegación por pestañas */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-0">
            <Tabs value={activeView} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-3 dark:bg-gray-700">
                <TabsTrigger 
                  value="search" 
                  className="flex items-center space-x-2 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white"
                >
                  <Package className="h-4 w-4" />
                  <span>Buscar Ticket</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="process" 
                  disabled={!selectedSale}
                  className="flex items-center space-x-2 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span>Procesar Devolución</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="history" 
                  className="flex items-center space-x-2 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white"
                >
                  <History className="h-4 w-4" />
                  <span>Historial</span>
                </TabsTrigger>
              </TabsList>

              {/* Contenido de las pestañas */}
              <div className="p-6">
                <TabsContent value="search" className="mt-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium dark:text-white">Buscar Ticket Original</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Busca la venta original para procesar la devolución
                        </p>
                      </div>
                      {selectedSale && (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Ticket Seleccionado: {selectedSale.id.slice(-8)}
                        </Badge>
                      )}
                    </div>
                    <TicketSearch onSaleSelect={handleSaleSelect} />
                  </div>
                </TabsContent>

                <TabsContent value="process" className="mt-0">
                  {selectedSale ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-medium dark:text-white">Procesar Devolución</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Selecciona los items a devolver y el método de reembolso
                        </p>
                      </div>
                      <ReturnForm 
                        sale={selectedSale}
                        onBack={handleBackToSearch}
                        onSuccess={handleReturnSuccess}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                        No hay ticket seleccionado
                      </h3>
                      <p className="text-gray-500 dark:text-gray-500 mb-4">
                        Primero debes buscar y seleccionar un ticket desde la pestaña "Buscar Ticket"
                      </p>
                      <Button 
                        onClick={() => setActiveView('search')}
                        className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                      >
                        <Package className="h-4 w-4 mr-2" />
                        Buscar Ticket
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium dark:text-white">Historial de Devoluciones</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Consulta todas las devoluciones procesadas
                      </p>
                    </div>
                    <ReturnsHistory refreshTrigger={refreshHistoryTrigger} />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {/* Información adicional */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Buscar Ticket</p>
                  <p className="font-medium dark:text-white">Encuentra la venta original</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <ArrowLeftRight className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Procesar Devolución</p>
                  <p className="font-medium dark:text-white">Reembolso o nota de crédito</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <History className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Historial</p>
                  <p className="font-medium dark:text-white">Consulta devoluciones</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Link href="/app/pos/devoluciones/motivos">
            <Card className="dark:bg-gray-800 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                    <Tag className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Catálogo de Motivos</p>
                    <p className="font-medium dark:text-white">Gestionar motivos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
