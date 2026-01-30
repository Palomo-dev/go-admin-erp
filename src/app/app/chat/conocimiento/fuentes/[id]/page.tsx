'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Loader2 } from 'lucide-react';
import KnowledgeService, {
  KnowledgeSource,
  KnowledgeFragment,
  CreateFragmentData,
  CreateSourceData
} from '@/lib/services/knowledgeService';
import {
  SourceDetailHeader,
  FragmentsTable,
  FragmentDetailDialog,
  SourceSettingsDialog,
  DeleteFragmentDialog
} from '@/components/chat/conocimiento/fuentes/id';

interface SourceWithStats extends KnowledgeSource {
  indexedCount?: number;
  totalCount?: number;
}

export default function SourceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sourceId = params.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [source, setSource] = useState<SourceWithStats | null>(null);
  const [fragments, setFragments] = useState<KnowledgeFragment[]>([]);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);

  const [selectedFragment, setSelectedFragment] = useState<KnowledgeFragment | null>(null);
  const [showFragmentDialog, setShowFragmentDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [memberId, setMemberId] = useState<number | null>(null);

  useEffect(() => {
    const getMemberId = async () => {
      if (!organizationId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .single();

      if (data) {
        setMemberId(data.id);
      }
    };

    getMemberId();
  }, [organizationId]);

  const loadData = useCallback(async () => {
    if (!organizationId || !sourceId) return;

    setLoading(true);
    try {
      const service = new KnowledgeService(organizationId);

      const [sourceData, fragmentsData] = await Promise.all([
        service.getSourceWithStats(sourceId),
        service.getFragments({ sourceId })
      ]);

      if (!sourceData) {
        toast({
          title: 'Error',
          description: 'No se encontró la fuente de conocimiento',
          variant: 'destructive'
        });
        router.push('/app/chat/conocimiento');
        return;
      }

      setSource(sourceData);
      setFragments(fragmentsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, sourceId, router, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBack = () => {
    router.push('/app/chat/conocimiento');
  };

  const handleRefresh = () => {
    loadData();
  };

  const handleReindex = async () => {
    if (!organizationId || !memberId || !sourceId) return;

    setReindexing(true);
    try {
      const service = new KnowledgeService(organizationId);
      await service.reindexFragments(sourceId, memberId);

      toast({
        title: 'Reindexación iniciada',
        description: 'Los fragmentos se están reindexando. Esto puede tomar unos minutos.'
      });

      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo iniciar la reindexación',
        variant: 'destructive'
      });
    } finally {
      setReindexing(false);
    }
  };

  const handleSettings = () => {
    setShowSettingsDialog(true);
  };

  const handleCreateFragment = () => {
    setSelectedFragment(null);
    setShowFragmentDialog(true);
  };

  const handleEditFragment = (fragment: KnowledgeFragment) => {
    setSelectedFragment(fragment);
    setShowFragmentDialog(true);
  };

  const handleDeleteFragment = (fragment: KnowledgeFragment) => {
    setSelectedFragment(fragment);
    setShowDeleteDialog(true);
  };

  const handleToggleFragment = async (fragment: KnowledgeFragment) => {
    if (!organizationId || !memberId) return;

    try {
      const service = new KnowledgeService(organizationId);
      await service.toggleFragmentStatus(fragment.id, memberId);

      toast({
        title: fragment.is_active ? 'Fragmento desactivado' : 'Fragmento activado',
        description: `El fragmento "${fragment.title}" ha sido ${fragment.is_active ? 'desactivado' : 'activado'}`
      });

      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado del fragmento',
        variant: 'destructive'
      });
    }
  };

  const handleSaveFragment = async (data: CreateFragmentData) => {
    if (!organizationId || !memberId) return;

    try {
      const service = new KnowledgeService(organizationId);

      if (selectedFragment) {
        await service.updateFragment(selectedFragment.id, data, memberId);
        toast({
          title: 'Fragmento actualizado',
          description: 'Los cambios se guardaron correctamente'
        });
      } else {
        await service.createFragment(data, memberId);
        toast({
          title: 'Fragmento creado',
          description: 'El fragmento se creó correctamente'
        });
      }

      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar el fragmento',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleConfirmDelete = async () => {
    if (!organizationId || !memberId || !selectedFragment) return;

    setDeleting(true);
    try {
      const service = new KnowledgeService(organizationId);
      await service.deleteFragment(selectedFragment.id, memberId);

      toast({
        title: 'Fragmento eliminado',
        description: 'El fragmento fue eliminado correctamente'
      });

      setShowDeleteDialog(false);
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el fragmento',
        variant: 'destructive'
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveSettings = async (data: CreateSourceData) => {
    if (!organizationId || !memberId || !sourceId) return;

    try {
      const service = new KnowledgeService(organizationId);
      await service.updateSource(sourceId, data, memberId);

      toast({
        title: 'Configuración guardada',
        description: 'Los cambios se guardaron correctamente'
      });

      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración',
        variant: 'destructive'
      });
      throw error;
    }
  };

  if (loading && !source) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando fuente...</p>
        </div>
      </div>
    );
  }

  if (!source) {
    return null;
  }

  const stats = {
    totalFragments: fragments.length,
    indexedFragments: fragments.filter(f => f.has_embedding).length,
    activeFragments: fragments.filter(f => f.is_active).length
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <SourceDetailHeader
        name={source.name}
        description={source.description}
        icon={source.icon}
        isActive={source.is_active}
        stats={stats}
        loading={loading}
        onBack={handleBack}
        onRefresh={handleRefresh}
        onReindex={handleReindex}
        onSettings={handleSettings}
        reindexing={reindexing}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <FragmentsTable
          fragments={fragments}
          loading={loading}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onEdit={handleEditFragment}
          onDelete={handleDeleteFragment}
          onToggle={handleToggleFragment}
          onCreateFragment={handleCreateFragment}
          onViewDetail={(fragment) => router.push(`/app/chat/conocimiento/fragmentos/${fragment.id}`)}
        />
      </div>

      <FragmentDetailDialog
        open={showFragmentDialog}
        onOpenChange={setShowFragmentDialog}
        fragment={selectedFragment}
        sourceId={sourceId}
        onSubmit={handleSaveFragment}
      />

      <SourceSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        source={source}
        onSubmit={handleSaveSettings}
      />

      <DeleteFragmentDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        fragmentTitle={selectedFragment?.title || ''}
        onConfirm={handleConfirmDelete}
        loading={deleting}
      />
    </div>
  );
}
