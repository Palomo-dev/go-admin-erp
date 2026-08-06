'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import spaceServicesService, { OrgServiceView } from '@/lib/services/spaceServicesService';
import {
  ServiciosPageHeader,
  ServiciosFilters,
  ServiciosList,
  ServicioDialog,
} from '@/components/pms/servicios';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';

export default function ServiciosPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const [services, setServices] = useState<OrgServiceView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<OrgServiceView | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Carga ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const data = await spaceServicesService.getOrgServices(organization.id);
      setServices(data);
    } catch (error) {
      console.error('Error cargando servicios:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los servicios', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Filtrado ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return services.filter((s) => {
      const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || s.category === categoryFilter;
      const matchType =
        typeFilter === 'all' ||
        (typeFilter === 'standard' && !s.is_custom) ||
        (typeFilter === 'custom' && s.is_custom);
      return matchSearch && matchCategory && matchType;
    });
  }, [services, search, categoryFilter, typeFilter]);

  const activeCount = services.filter((s) => s.is_active).length;
  const customCount = services.filter((s) => s.is_custom).length;

  // ─── Acciones ───────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: 'Actualizado', description: 'Servicios actualizados' });
  };

  const handleToggle = async (service: OrgServiceView) => {
    if (!organization?.id) return;
    const id = service.org_service_id || service.service_id || '';
    setTogglingId(id);

    try {
      if (service.is_custom) {
        // Para personalizado, toggle directo en organization_services
        const { error } = await (await import('@/lib/supabase/config')).supabase
          .from('organization_services')
          .update({ is_active: !service.is_active })
          .eq('id', service.org_service_id);
        if (error) throw error;
      } else {
        // Para estándar, usar el servicio
        await spaceServicesService.toggleService(
          organization.id,
          service.service_id!,
          !service.is_active
        );
      }
      await loadData();
    } catch (error) {
      console.error('Error toggling:', error);
      toast({ title: 'Error', description: 'No se pudo cambiar el estado', variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleNewCustom = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (service: OrgServiceView) => {
    setEditItem(service);
    setDialogOpen(true);
  };

  const handleDelete = async (service: OrgServiceView) => {
    const ok = await spaceServicesService.deleteCustomService(service.org_service_id);
    if (ok) {
      toast({ title: 'Eliminado', description: `"${service.name}" eliminado` });
      await loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    }
  };

  const handleSave = async (data: { name: string; icon: string; category: string; price?: number; linked_product_id?: number | null }) => {
    if (!organization?.id) return;
    setIsSaving(true);
    try {
      if (editItem) {
        const ok = await spaceServicesService.updateCustomService(editItem.org_service_id, { name: data.name, icon: data.icon, category: data.category });
        if (ok && data.price !== undefined) {
          await spaceServicesService.updateServiceConfig(editItem.org_service_id, { price: data.price, linked_product_id: data.linked_product_id });
        }
        if (ok) {
          toast({ title: 'Actualizado', description: `"${data.name}" actualizado` });
        } else {
          throw new Error('Error al actualizar');
        }
      } else {
        const id = await spaceServicesService.createCustomService(organization.id, { name: data.name, icon: data.icon, category: data.category });
        if (id && data.price !== undefined) {
          await spaceServicesService.updateServiceConfig(id, { price: data.price, linked_product_id: data.linked_product_id });
        }
        if (id) {
          toast({ title: 'Creado', description: `"${data.name}" creado exitosamente` });
        } else {
          throw new Error('Error al crear');
        }
      }
      setDialogOpen(false);
      setEditItem(null);
      await loadData();
    } catch (error) {
      console.error('Error guardando:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el servicio', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (!mounted || !organization) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          <PageHeaderSkeleton />
          <CardListSkeleton cards={6} columns="3" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <ServiciosPageHeader
        totalCount={services.length}
        activeCount={activeCount}
        customCount={customCount}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onNewCustom={handleNewCustom}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-4">
          <ServiciosFilters
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            typeFilter={typeFilter}
            onTypeChange={setTypeFilter}
          />

          <ServiciosList
            services={filtered}
            isLoading={isLoading}
            togglingId={togglingId}
            onToggle={handleToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onConfig={handleEdit}
          />
        </div>
      </div>

      <ServicioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editItem={editItem}
        isSaving={isSaving}
        onSave={handleSave}
        organizationId={organization?.id}
      />
    </div>
  );
}
