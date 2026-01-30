'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { 
  MembershipCard, 
  MembershipFilters, 
  MembershipDialog,
  MembershipStats,
  MembershipExpiringSection,
  MembershipQRDialog
} from '@/components/gym/membresias';
import { PageHeader } from '@/components/gym/shared';
import { 
  getMemberships, 
  Membership,
  freezeMembership,
  unfreezeMembership,
  renewMembership
} from '@/lib/services/gymService';

export default function GymMembresiasPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('filter') === 'expiring' ? 'active' : 'all');
  const [showDialog, setShowDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState<Membership | null>(null);

  const loadMemberships = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getMemberships(undefined, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search || undefined
      });
      setMemberships(data);
    } catch (error) {
      console.error('Error cargando membresías:', error);
      toast({
        title: 'Error',
        description: 'Error al cargar las membresías',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, search, toast]);

  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);

  const handleShowQR = (membership: Membership) => {
    setSelectedMembership(membership);
    setShowQRDialog(true);
  };

  const handleFreeze = async (membership: Membership) => {
    const reason = window.prompt('Motivo del congelamiento:');
    if (!reason) return;

    try {
      setIsProcessing(true);
      await freezeMembership(membership.id, reason);
      toast({
        title: 'Membresía congelada',
        description: 'La membresía ha sido congelada exitosamente'
      });
      loadMemberships();
    } catch (error) {
      console.error('Error congelando:', error);
      toast({
        title: 'Error',
        description: 'Error al congelar la membresía',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnfreeze = async (membership: Membership) => {
    try {
      setIsProcessing(true);
      await unfreezeMembership(membership.id);
      toast({
        title: 'Membresía descongelada',
        description: 'La membresía ha sido reactivada'
      });
      loadMemberships();
    } catch (error) {
      console.error('Error descongelando:', error);
      toast({
        title: 'Error',
        description: 'Error al descongelar la membresía',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRenew = async (membership: Membership) => {
    router.push(`/app/gym/membresias/${membership.id}?action=renew`);
  };

  const filteredMemberships = memberships.filter(m => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      m.customers?.first_name?.toLowerCase().includes(searchLower) ||
      m.customers?.last_name?.toLowerCase().includes(searchLower) ||
      m.customers?.identification_number?.toLowerCase().includes(searchLower) ||
      m.access_code?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeader
        title="Membresías"
        icon={Users}
        onRefresh={loadMemberships}
        isLoading={isLoading}
        primaryAction={{
          label: 'Nueva Membresía',
          onClick: () => setShowDialog(true),
        }}
      />

      {/* Estadísticas */}
      <MembershipStats memberships={memberships} isLoading={isLoading} />

      {/* Vencimientos próximos */}
      {!isLoading && (
        <MembershipExpiringSection 
          memberships={memberships} 
          isLoading={isLoading}
          onRenew={handleRenew}
        />
      )}

      {/* Filtros */}
      <MembershipFilters
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredMemberships.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay membresías
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {search ? 'No se encontraron resultados para tu búsqueda' : 'Aún no hay membresías registradas'}
          </p>
          {!search && (
            <Button 
              onClick={() => setShowDialog(true)} 
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Crear Membresía
            </Button>
          )}
        </div>
      )}

      {/* Lista de membresías */}
      {!isLoading && filteredMemberships.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemberships.map(membership => (
            <MembershipCard 
              key={membership.id} 
              membership={membership}
              onShowQR={handleShowQR}
              onRenew={handleRenew}
              onFreeze={handleFreeze}
              onUnfreeze={handleUnfreeze}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <MembershipDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onSave={async () => {
          await loadMemberships();
        }}
      />

      <MembershipQRDialog
        open={showQRDialog}
        onOpenChange={setShowQRDialog}
        membership={selectedMembership}
      />

      {/* Indicador de procesamiento */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-gray-900 dark:text-white">Procesando...</span>
          </div>
        </div>
      )}
    </div>
  );
}
