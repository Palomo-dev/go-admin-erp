'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileDown, RefreshCw, Fingerprint, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useOrganization, getOrganizationId } from '@/lib/hooks/useOrganization';
import { cn } from '@/utils/Utils';
import { useToast } from '@/components/ui/use-toast';

import { IdentidadesFiltros } from './IdentidadesFiltros';
import { IdentidadesStats } from './IdentidadesStats';
import { IdentidadesTable } from './IdentidadesTable';
import { DuplicadosPanel } from './DuplicadosPanel';
import { createIdentidadesService } from './IdentidadesService';
import type { ChannelIdentity, DuplicateGroup, IdentityFilters } from './types';

export function IdentidadesPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [filters, setFilters] = useState<IdentityFilters>({
    search: '',
    identityType: null,
    channelId: null,
    verified: null,
    showDuplicates: false
  });

  // Datos para filtros
  const [channels, setChannels] = useState<{ id: string; name: string; type: string }[]>([]);

  // Datos
  const [identities, setIdentities] = useState<ChannelIdentity[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    phone: 0,
    email: 0,
    whatsapp: 0,
    verified: 0,
    unverified: 0
  });

  // Estado para edición
  const [editingIdentity, setEditingIdentity] = useState<ChannelIdentity | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editVerified, setEditVerified] = useState(false);

  const loadData = useCallback(async () => {
    const orgId = getOrganizationId();
    const service = createIdentidadesService(orgId);

    setRefreshing(true);
    try {
      const [channelsData, identitiesData, statsData] = await Promise.all([
        service.getChannels(),
        service.getIdentities(filters),
        service.getStats()
      ]);

      setChannels(channelsData);
      setIdentities(identitiesData);
      setStats(statsData);

      if (filters.showDuplicates) {
        const duplicatesData = await service.getDuplicates();
        setDuplicates(duplicatesData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las identidades',
        variant: 'destructive'
      });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerify = async (id: string) => {
    const orgId = getOrganizationId();
    const service = createIdentidadesService(orgId);
    
    const success = await service.verifyIdentity(id);
    if (success) {
      toast({
        title: 'Identidad verificada',
        description: 'La identidad ha sido marcada como verificada'
      });
      loadData();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo verificar la identidad',
        variant: 'destructive'
      });
    }
  };

  const handleEdit = (identity: ChannelIdentity) => {
    setEditingIdentity(identity);
    setEditValue(identity.identity_value);
    setEditVerified(identity.verified);
  };

  const handleSaveEdit = async () => {
    if (!editingIdentity) return;

    const orgId = getOrganizationId();
    const service = createIdentidadesService(orgId);
    
    const success = await service.updateIdentity(editingIdentity.id, {
      identity_value: editValue,
      verified: editVerified
    });

    if (success) {
      toast({
        title: 'Identidad actualizada',
        description: 'Los cambios han sido guardados'
      });
      setEditingIdentity(null);
      loadData();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la identidad',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta identidad?')) return;

    const orgId = getOrganizationId();
    const service = createIdentidadesService(orgId);
    
    const success = await service.deleteIdentity(id);
    if (success) {
      toast({
        title: 'Identidad eliminada',
        description: 'La identidad ha sido eliminada'
      });
      loadData();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la identidad',
        variant: 'destructive'
      });
    }
  };

  const handleMerge = async (primaryId: string, secondaryIds: string[]) => {
    const orgId = getOrganizationId();
    const service = createIdentidadesService(orgId);
    
    const result = await service.mergeCustomers(primaryId, secondaryIds);
    if (result.success) {
      toast({
        title: 'Clientes fusionados',
        description: result.message
      });
      loadData();
    } else {
      toast({
        title: 'Error',
        description: result.message,
        variant: 'destructive'
      });
    }
  };

  const handleExportCSV = async () => {
    const orgId = getOrganizationId();
    const service = createIdentidadesService(orgId);
    await service.exportToCSV(identities);
    toast({
      title: 'Exportación completada',
      description: 'El archivo CSV ha sido descargado'
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Fingerprint className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Identidades Omnicanal
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestiona identidades de clientes y resuelve duplicados
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={handleExportCSV}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <FileDown className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <IdentidadesStats stats={stats} loading={loading} />

      {/* Filtros */}
      <IdentidadesFiltros
        filters={filters}
        onFiltersChange={setFilters}
        channels={channels}
      />

      {/* Contenido principal */}
      {filters.showDuplicates ? (
        <DuplicadosPanel
          duplicates={duplicates}
          loading={loading}
          onMerge={handleMerge}
        />
      ) : (
        <IdentidadesTable
          identities={identities}
          loading={loading}
          onVerify={handleVerify}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Diálogo de edición */}
      <Dialog open={!!editingIdentity} onOpenChange={() => setEditingIdentity(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Identidad</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Input 
                value={editingIdentity?.identity_type || ''} 
                disabled 
                className="bg-gray-100 dark:bg-gray-800"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Teléfono, email, etc."
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Verificado</Label>
              <Switch
                checked={editVerified}
                onCheckedChange={setEditVerified}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIdentity(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
