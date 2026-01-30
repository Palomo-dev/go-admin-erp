'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, FileText } from 'lucide-react';
import KnowledgeService, {
  KnowledgeSource,
  KnowledgeFragment,
  KnowledgeStats,
  CreateSourceData,
  CreateFragmentData
} from '@/lib/services/knowledgeService';
import {
  KnowledgeHeader,
  SourcesList,
  FragmentsList,
  SourceDialog,
  FragmentDialog,
  DeleteConfirmDialog
} from '@/components/chat/conocimiento';

export default function ConocimientoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [fragments, setFragments] = useState<KnowledgeFragment[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sources');

  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [selectedFragment, setSelectedFragment] = useState<KnowledgeFragment | null>(null);
  const [viewingSource, setViewingSource] = useState<KnowledgeSource | null>(null);

  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [showFragmentDialog, setShowFragmentDialog] = useState(false);
  const [showDeleteSourceDialog, setShowDeleteSourceDialog] = useState(false);
  const [showDeleteFragmentDialog, setShowDeleteFragmentDialog] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [deleting, setDeleting] = useState(false);

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
    if (!organizationId) return;

    setLoading(true);
    try {
      const service = new KnowledgeService(organizationId);

      const [sourcesData, statsData] = await Promise.all([
        service.getSources(),
        service.getStats()
      ]);

      setSources(sourcesData);
      setStats(statsData);
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
  }, [organizationId, toast]);

  const loadFragments = useCallback(async (sourceId?: string) => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const service = new KnowledgeService(organizationId);
      const fragmentsData = await service.getFragments({
        sourceId,
        search: searchTerm || undefined
      });
      setFragments(fragmentsData);
    } catch (error) {
      console.error('Error cargando fragmentos:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'fragments' || viewingSource) {
      loadFragments(viewingSource?.id);
    }
  }, [activeTab, viewingSource, loadFragments]);

  useEffect(() => {
    const debounceSearch = setTimeout(() => {
      if (activeTab === 'fragments' || viewingSource) {
        loadFragments(viewingSource?.id);
      }
    }, 300);

    return () => clearTimeout(debounceSearch);
  }, [searchTerm]);

  const handleCreateSource = () => {
    setSelectedSource(null);
    setShowSourceDialog(true);
  };

  const handleEditSource = (source: KnowledgeSource) => {
    setSelectedSource(source);
    setShowSourceDialog(true);
  };

  const handleDeleteSource = (source: KnowledgeSource) => {
    setSelectedSource(source);
    setShowDeleteSourceDialog(true);
  };

  const handleToggleSource = async (source: KnowledgeSource) => {
    if (!organizationId || !memberId) return;

    try {
      const service = new KnowledgeService(organizationId);
      await service.toggleSourceStatus(source.id, memberId);
      
      toast({
        title: source.is_active ? 'Fuente desactivada' : 'Fuente activada',
        description: `La fuente "${source.name}" ha sido ${source.is_active ? 'desactivada' : 'activada'}`
      });
      
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la fuente',
        variant: 'destructive'
      });
    }
  };

  const handleViewFragments = (source: KnowledgeSource) => {
    router.push(`/app/chat/conocimiento/fuentes/${source.id}`);
  };

  const handleSaveSource = async (data: CreateSourceData) => {
    if (!organizationId || !memberId) return;

    try {
      const service = new KnowledgeService(organizationId);

      if (selectedSource) {
        await service.updateSource(selectedSource.id, data, memberId);
        toast({
          title: 'Fuente actualizada',
          description: 'Los cambios se guardaron correctamente'
        });
      } else {
        await service.createSource(data, memberId);
        toast({
          title: 'Fuente creada',
          description: 'La fuente de conocimiento se creó correctamente'
        });
      }

      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la fuente',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleConfirmDeleteSource = async () => {
    if (!organizationId || !memberId || !selectedSource) return;

    setDeleting(true);
    try {
      const service = new KnowledgeService(organizationId);
      await service.deleteSource(selectedSource.id, memberId);
      
      toast({
        title: 'Fuente eliminada',
        description: 'La fuente y sus fragmentos fueron eliminados'
      });
      
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la fuente',
        variant: 'destructive'
      });
    } finally {
      setDeleting(false);
    }
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
    setShowDeleteFragmentDialog(true);
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
          description: 'El fragmento de conocimiento se creó correctamente'
        });
      }

      await loadFragments(viewingSource?.id);
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

  const handleConfirmDeleteFragment = async () => {
    if (!organizationId || !memberId || !selectedFragment) return;

    setDeleting(true);
    try {
      const service = new KnowledgeService(organizationId);
      await service.deleteFragment(selectedFragment.id, memberId);
      
      toast({
        title: 'Fragmento eliminado',
        description: 'El fragmento fue eliminado correctamente'
      });
      
      await loadFragments(viewingSource?.id);
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

  const handleBackToSources = () => {
    setViewingSource(null);
    setActiveTab('sources');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <KnowledgeHeader
        stats={stats}
        loading={loading}
        onCreateSource={handleCreateSource}
        onImport={() => router.push('/app/chat/conocimiento/importar')}
        onAISettings={() => router.push('/app/chat/ia/configuracion')}
      />

      <div className="flex-1 overflow-hidden">
        {viewingSource ? (
          <div className="p-6 h-full overflow-y-auto">
            <FragmentsList
              fragments={fragments}
              loading={loading}
              source={viewingSource}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onEdit={handleEditFragment}
              onDelete={handleDeleteFragment}
              onBack={handleBackToSources}
              onCreateFragment={handleCreateFragment}
            />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-6 pt-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <TabsList className="bg-gray-100 dark:bg-gray-800">
                <TabsTrigger value="sources" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                  <Database className="h-4 w-4" />
                  Fuentes
                </TabsTrigger>
                <TabsTrigger value="fragments" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                  <FileText className="h-4 w-4" />
                  Todos los Fragmentos
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="sources" className="flex-1 p-6 overflow-y-auto mt-0">
              <SourcesList
                sources={sources}
                loading={loading}
                onEdit={handleEditSource}
                onDelete={handleDeleteSource}
                onToggle={handleToggleSource}
                onViewFragments={handleViewFragments}
              />
            </TabsContent>

            <TabsContent value="fragments" className="flex-1 p-6 overflow-y-auto mt-0">
              <FragmentsList
                fragments={fragments}
                loading={loading}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onEdit={handleEditFragment}
                onDelete={handleDeleteFragment}
                onCreateFragment={handleCreateFragment}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <SourceDialog
        open={showSourceDialog}
        onOpenChange={setShowSourceDialog}
        source={selectedSource}
        onSubmit={handleSaveSource}
      />

      <FragmentDialog
        open={showFragmentDialog}
        onOpenChange={setShowFragmentDialog}
        fragment={selectedFragment}
        sources={sources}
        defaultSourceId={viewingSource?.id}
        onSubmit={handleSaveFragment}
      />

      <DeleteConfirmDialog
        open={showDeleteSourceDialog}
        onOpenChange={setShowDeleteSourceDialog}
        title="Eliminar Fuente"
        description={`¿Estás seguro de eliminar la fuente "${selectedSource?.name}"? Esto también eliminará todos los fragmentos asociados. Esta acción no se puede deshacer.`}
        onConfirm={handleConfirmDeleteSource}
        loading={deleting}
      />

      <DeleteConfirmDialog
        open={showDeleteFragmentDialog}
        onOpenChange={setShowDeleteFragmentDialog}
        title="Eliminar Fragmento"
        description={`¿Estás seguro de eliminar el fragmento "${selectedFragment?.title}"? Esta acción no se puede deshacer.`}
        onConfirm={handleConfirmDeleteFragment}
        loading={deleting}
      />
    </div>
  );
}
