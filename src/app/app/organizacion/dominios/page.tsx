'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Globe, RefreshCw, Plus, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import {
  domainService,
  OrganizationDomain,
  CreateDomainInput,
  UpdateDomainInput,
} from '@/lib/services/domainService';
import {
  DomainCard,
  DomainForm,
  DNSInstructions,
  RedirectDialog,
  SubdomainManager,
  AddCustomDomainDialog,
  BuyDomainDialog,
} from '@/components/organization/dominios';
import { ShoppingCart } from 'lucide-react';
import { useSession } from '@/lib/hooks/useSession';

export default function DominiosPage() {
  const { organization } = useOrganization();
  const { session } = useSession();
  const organizationId = organization?.id;
  const { toast } = useToast();

  // Estado principal
  const [domains, setDomains] = useState<OrganizationDomain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);


  // Subdominio de la organización
  const [currentSubdomain, setCurrentSubdomain] = useState<string | null>(null);

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [addCustomDomainOpen, setAddCustomDomainOpen] = useState(false);
  const [buyDomainOpen, setBuyDomainOpen] = useState(false);
  const [dnsOpen, setDnsOpen] = useState(false);
  const [redirectOpen, setRedirectOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Dominio seleccionado para operaciones
  const [selectedDomain, setSelectedDomain] = useState<OrganizationDomain | null>(null);
  const [domainToDelete, setDomainToDelete] = useState<OrganizationDomain | null>(null);

  // Estados de operación
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);
  const [syncingDomainId, setSyncingDomainId] = useState<string | null>(null);

  // Cargar subdominio de la organización
  const loadOrganizationSubdomain = useCallback(async () => {
    if (!organizationId) return;

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('subdomain')
        .eq('id', organizationId)
        .single();

      if (error) throw error;
      setCurrentSubdomain(data?.subdomain || null);
    } catch (error) {
      console.error('Error loading organization subdomain:', error);
    }
  }, [organizationId]);

  // Cargar dominios personalizados
  const loadDomains = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const data = await domainService.getDomains(organizationId);
      // Filtrar solo dominios personalizados (no system_subdomain)
      const customDomains = data.filter(d => d.domain_type === 'custom_domain');
      setDomains(customDomains);
    } catch (error) {
      console.error('Error loading domains:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los dominios',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadOrganizationSubdomain();
    loadDomains();
  }, [loadOrganizationSubdomain, loadDomains]);

  // Refrescar datos
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDomains();
    setIsRefreshing(false);
  };


  // Abrir formulario para editar dominio
  const handleEditDomain = (domain: OrganizationDomain) => {
    setSelectedDomain(domain);
    setFormOpen(true);
  };

  // Guardar dominio (crear o actualizar)
  const handleSubmitDomain = async (data: CreateDomainInput | UpdateDomainInput) => {
    if (!organizationId) return;

    setIsSubmitting(true);
    try {
      if (selectedDomain) {
        await domainService.updateDomain(selectedDomain.id, data as UpdateDomainInput);
        toast({
          title: 'Dominio actualizado',
          description: 'El dominio ha sido actualizado correctamente',
        });
      } else {
        await domainService.createDomain(data as CreateDomainInput);
        toast({
          title: 'Dominio creado',
          description: 'El dominio ha sido creado correctamente. Configura los registros DNS para verificarlo.',
        });
      }
      loadDomains();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'No se pudo guardar el dominio';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirmar eliminación
  const confirmDelete = (domain: OrganizationDomain) => {
    setDomainToDelete(domain);
    setDeleteDialogOpen(true);
  };

  // Eliminar dominio
  const handleDelete = async () => {
    if (!domainToDelete) return;

    const success = await domainService.deleteDomain(domainToDelete.id);
    if (success) {
      toast({
        title: 'Dominio eliminado',
        description: `El dominio "${domainToDelete.host}" ha sido eliminado`,
      });
      loadDomains();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el dominio',
        variant: 'destructive',
      });
    }

    setDeleteDialogOpen(false);
    setDomainToDelete(null);
  };

  // Verificar dominio
  const handleVerifyDomain = async (domain: OrganizationDomain) => {
    setVerifyingDomainId(domain.id);
    try {
      const result = await domainService.verifyDomain(domain.id);
      toast({
        title: result.success ? 'Verificación exitosa' : 'Verificación pendiente',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      if (result.success) {
        loadDomains();
      }
    } finally {
      setVerifyingDomainId(null);
    }
  };

  // Marcar como primario
  const handleSetPrimary = async (domain: OrganizationDomain) => {
    if (!organizationId) return;

    const success = await domainService.setPrimaryDomain(domain.id, organizationId);
    if (success) {
      toast({
        title: 'Dominio principal actualizado',
        description: `"${domain.host}" es ahora el dominio principal`,
      });
      loadDomains();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo establecer el dominio principal',
        variant: 'destructive',
      });
    }
  };

  // Toggle activo
  const handleToggleActive = async (domain: OrganizationDomain, isActive: boolean) => {
    const success = await domainService.toggleDomainActive(domain.id, isActive);
    if (success) {
      toast({
        title: isActive ? 'Dominio activado' : 'Dominio desactivado',
        description: `El dominio "${domain.host}" ha sido ${isActive ? 'activado' : 'desactivado'}`,
      });
      loadDomains();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado del dominio',
        variant: 'destructive',
      });
    }
  };

  // Configurar redirección
  const handleOpenRedirect = (domain: OrganizationDomain) => {
    setSelectedDomain(domain);
    setRedirectOpen(true);
  };

  const handleSubmitRedirect = async (redirectToDomainId: string | null, statusCode: number | null) => {
    if (!selectedDomain) return;

    const success = await domainService.configureRedirect(selectedDomain.id, redirectToDomainId, statusCode);
    if (success) {
      toast({
        title: 'Redirección configurada',
        description: redirectToDomainId
          ? 'La redirección ha sido configurada correctamente'
          : 'La redirección ha sido eliminada',
      });
      loadDomains();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo configurar la redirección',
        variant: 'destructive',
      });
    }
  };

  // Sincronizar con Vercel
  const handleSyncVercel = async (domain: OrganizationDomain) => {
    setSyncingDomainId(domain.id);
    try {
      const result = await domainService.syncWithVercel(domain.id);
      toast({
        title: result.success ? 'Sincronización exitosa' : 'Error de sincronización',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      if (result.success) {
        loadDomains();
      }
    } finally {
      setSyncingDomainId(null);
    }
  };

  // Duplicar dominio
  const handleDuplicate = async (domain: OrganizationDomain) => {
    const newDomain = await domainService.duplicateDomain(domain.id);
    if (newDomain) {
      toast({
        title: 'Dominio duplicado',
        description: `Se ha creado una copia de "${domain.host}"`,
      });
      loadDomains();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo duplicar el dominio',
        variant: 'destructive',
      });
    }
  };

  // Ver instrucciones DNS
  const handleShowDNS = (domain: OrganizationDomain) => {
    setSelectedDomain(domain);
    setDnsOpen(true);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/app/organizacion"
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </Link>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Globe className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Dominios
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Gestiona los dominios y subdominios de tu organización
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="border-gray-300 dark:border-gray-700"
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
                Actualizar
              </Button>
              <Button
                size="sm"
                onClick={() => setAddCustomDomainOpen(true)}
                variant="outline"
                className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/20"
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar Existente
              </Button>
              <Button
                size="sm"
                onClick={() => setBuyDomainOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Comprar Dominio
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="space-y-6">
            {/* Skeleton de estadísticas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            {/* Skeleton de filtros */}
            <Skeleton className="h-10 w-full" />
            {/* Skeleton de dominios */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Subdominio del Sistema */}
            <SubdomainManager
              organizationId={organizationId || 0}
              currentSubdomain={currentSubdomain}
              onSubdomainChange={(newSubdomain) => {
                setCurrentSubdomain(newSubdomain);
                toast({
                  title: 'Subdominio actualizado',
                  description: `Tu nuevo subdominio es ${newSubdomain}.goadmin.io`,
                });
              }}
            />

            {/* Sección de Dominios Personalizados */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Dominios Personalizados
                </h2>
                {domains.length > 0 && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {domains.length} dominio{domains.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Lista de dominios personalizados */}
              {domains.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No tienes dominios personalizados
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Conecta un dominio que ya tengas registrado para usarlo con tu sitio
                  </p>
                  <Button 
                    onClick={() => setAddCustomDomainOpen(true)} 
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Dominio Personalizado
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {domains.map((domain) => (
                    <DomainCard
                      key={domain.id}
                      domain={domain}
                      onEdit={handleEditDomain}
                      onDelete={confirmDelete}
                      onVerify={handleVerifyDomain}
                      onSetPrimary={handleSetPrimary}
                      onToggleActive={handleToggleActive}
                      onConfigureRedirect={handleOpenRedirect}
                      onSyncVercel={handleSyncVercel}
                      onDuplicate={handleDuplicate}
                      onShowDNS={handleShowDNS}
                      isVerifying={verifyingDomainId === domain.id}
                      isSyncing={syncingDomainId === domain.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modales */}
      <DomainForm
        open={formOpen}
        onOpenChange={setFormOpen}
        domain={selectedDomain}
        organizationId={organizationId || 0}
        onSubmit={handleSubmitDomain}
        isLoading={isSubmitting}
      />

      <DNSInstructions
        open={dnsOpen}
        onOpenChange={setDnsOpen}
        domain={selectedDomain}
        onVerify={() => selectedDomain && handleVerifyDomain(selectedDomain)}
        isVerifying={selectedDomain ? verifyingDomainId === selectedDomain.id : false}
      />

      <RedirectDialog
        open={redirectOpen}
        onOpenChange={setRedirectOpen}
        domain={selectedDomain}
        availableDomains={domains}
        onSubmit={handleSubmitRedirect}
        isLoading={isSubmitting}
      />

      <AddCustomDomainDialog
        open={addCustomDomainOpen}
        onOpenChange={setAddCustomDomainOpen}
        organizationId={organizationId || 0}
        onDomainAdded={() => {
          toast({
            title: 'Dominio agregado',
            description: 'El dominio ha sido agregado. Configura los registros DNS para verificarlo.',
          });
          loadDomains();
        }}
      />

      <BuyDomainDialog
        open={buyDomainOpen}
        onOpenChange={setBuyDomainOpen}
        organizationId={organizationId || 0}
        userEmail={session?.user?.email || ''}
        userName={session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || ''}
        onPurchaseComplete={(domain) => {
          toast({
            title: '¡Dominio comprado!',
            description: `El dominio ${domain} ha sido registrado exitosamente.`,
          });
          loadDomains();
        }}
      />

      {/* Dialog de Confirmación de Eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-gray-100">¿Eliminar dominio?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. El dominio &quot;{domainToDelete?.host}&quot; será
              eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
