'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeftRight, Package, History, Tag, Undo } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { Skeleton } from '@/components/ui/skeleton';
import { BranchBadgeActiva, EmptyState, PageHeader } from '@/components/kit';
import { TicketSearch } from '@/components/pos/devoluciones/TicketSearch';
import { ReturnForm } from '@/components/pos/devoluciones/ReturnForm';
import { ReturnsHistory } from '@/components/pos/devoluciones/ReturnsHistory';
import { SaleForReturn } from '@/components/pos/devoluciones/types';
import { toast } from 'sonner';

type ViewState = 'search' | 'process' | 'history';

export default function DevolucionesPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { branchFilter } = useBranch();
  const t = useTranslations('posDevoluciones.pagina');
  const tComun = useTranslations('posDevoluciones.comun');
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
    toast.success(t('procesadaExito'));
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

  const migas = [{ etiqueta: t('migas.pos'), href: '/app/pos' }, { etiqueta: t('migas.devoluciones') }];

  if (orgLoading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6" aria-busy="true">
        <PageHeader titulo={t('migas.devoluciones')} icono={Undo} migas={migas} cargando />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        {/* Cabecera del kit (Figma `873:573998`). La fecha suelta y el badge «Sistema activo» no están en Figma. */}
        <PageHeader
          titulo={t('titulo', { organizacion: organization?.name || t('organizacionRespaldo') })}
          subtitulo={t('subtitulo')}
          icono={Undo}
          migas={migas}
          acciones={
            <Button asChild variant="outline" className="h-10 gap-2">
              <Link href="/app/pos/devoluciones/motivos">
                <Tag aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('motivos')}
              </Link>
            </Button>
          }
          debajo={<BranchBadgeActiva />}
        />

        {/* Navegación por pestañas */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-0">
            <Tabs value={activeView} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 dark:bg-gray-700">
                <TabsTrigger
                  value="search"
                  className="flex items-center space-x-2 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white"
                >
                  <Package className="h-4 w-4 shrink-0" />
                  <span className="break-words whitespace-normal text-left">{tComun('buscarTicket')}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="process"
                  disabled={!selectedSale}
                  className="flex items-center space-x-2 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white"
                >
                  <ArrowLeftRight className="h-4 w-4 shrink-0" />
                  <span className="break-words whitespace-normal text-left">{tComun('procesarDevolucion')}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="flex items-center space-x-2 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white"
                >
                  <History className="h-4 w-4 shrink-0" />
                  <span className="break-words whitespace-normal text-left">{tComun('historial')}</span>
                </TabsTrigger>
              </TabsList>

              {/* Contenido de las pestañas */}
              <div className="p-6">
                <TabsContent value="search" className="mt-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium dark:text-white">{tComun('buscarTicketOriginal')}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {t('busquedaDescripcion')}
                        </p>
                      </div>
                      {selectedSale && (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          {t('ticketSeleccionado', { id: selectedSale.id.slice(-8) })}
                        </Badge>
                      )}
                    </div>
                    <TicketSearch onSaleSelect={handleSaleSelect} branchFilter={branchFilter} />
                  </div>
                </TabsContent>

                <TabsContent value="process" className="mt-0">
                  {selectedSale ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-medium dark:text-white">{tComun('procesarDevolucion')}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {t('procesoDescripcion')}
                        </p>
                      </div>
                      <ReturnForm 
                        sale={selectedSale}
                        onBack={handleBackToSearch}
                        onSuccess={handleReturnSuccess}
                      />
                    </div>
                  ) : (
                    <EmptyState
                      icono={Package}
                      titulo={t('sinTicketTitulo')}
                      descripcion={t('sinTicketDescripcion')}
                      accion={{ etiqueta: tComun('buscarTicket'), icono: Package, onClick: () => setActiveView('search') }}
                    />
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium dark:text-white">{tComun('historialDevoluciones')}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t('historialDescripcion')}
                      </p>
                    </div>
                    <ReturnsHistory refreshTrigger={refreshHistoryTrigger} branchFilter={branchFilter} />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {/* Información adicional */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{tComun('buscarTicket')}</p>
                  <p className="font-medium dark:text-white">{t('tarjetas.buscarDescripcion')}</p>
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
                  <p className="text-sm text-gray-600 dark:text-gray-400">{tComun('procesarDevolucion')}</p>
                  <p className="font-medium dark:text-white">{t('tarjetas.procesarDescripcion')}</p>
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
                  <p className="text-sm text-gray-600 dark:text-gray-400">{tComun('historial')}</p>
                  <p className="font-medium dark:text-white">{t('tarjetas.historialDescripcion')}</p>
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
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('tarjetas.catalogoMotivos')}</p>
                    <p className="font-medium dark:text-white">{t('tarjetas.gestionarMotivos')}</p>
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
