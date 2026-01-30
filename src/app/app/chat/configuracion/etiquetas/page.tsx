'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';
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
import InboxConfigService, { type ConversationTag } from '@/lib/services/inboxConfigService';
import { TagsHeader, TagCard, TagDialog } from '@/components/chat/configuracion/etiquetas';
import { ConfigNavTabs } from '@/components/chat/configuracion/ConfigNavTabs';

export default function EtiquetasPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<ConversationTag | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<ConversationTag | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const service = new InboxConfigService(organizationId);
      const data = await service.getTags();
      setTags(data);
    } catch (error) {
      console.error('Error cargando etiquetas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las etiquetas',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateTag = () => {
    setSelectedTag(null);
    setDialogOpen(true);
  };

  const handleEditTag = (tag: ConversationTag) => {
    setSelectedTag(tag);
    setDialogOpen(true);
  };

  const handleDeleteTag = (tag: ConversationTag) => {
    setTagToDelete(tag);
    setDeleteDialogOpen(true);
  };

  const handleSaveTag = async (data: { name: string; color: string; description?: string }) => {
    if (!organizationId) return;

    const service = new InboxConfigService(organizationId);

    try {
      if (selectedTag) {
        await service.updateTag(selectedTag.id, data);
        toast({
          title: 'Etiqueta actualizada',
          description: 'Los cambios se guardaron correctamente'
        });
      } else {
        await service.createTag(data);
        toast({
          title: 'Etiqueta creada',
          description: 'La etiqueta se creó correctamente'
        });
      }
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la etiqueta',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const confirmDelete = async () => {
    if (!organizationId || !tagToDelete) return;

    const service = new InboxConfigService(organizationId);

    try {
      await service.deleteTag(tagToDelete.id);
      toast({
        title: 'Etiqueta eliminada',
        description: 'La etiqueta se eliminó correctamente'
      });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la etiqueta',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setTagToDelete(null);
    }
  };

  if (loading && tags.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando etiquetas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="p-4 sm:p-6 pb-0">
        <ConfigNavTabs />
      </div>
      <TagsHeader
        totalTags={tags.length}
        loading={loading}
        onRefresh={loadData}
        onCreateTag={handleCreateTag}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          {tags.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <span className="text-2xl">🏷️</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No hay etiquetas configuradas
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Crea etiquetas para organizar y clasificar tus conversaciones
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tags.map((tag) => (
                <TagCard
                  key={tag.id}
                  tag={tag}
                  onEdit={handleEditTag}
                  onDelete={handleDeleteTag}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <TagDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tag={selectedTag}
        onSave={handleSaveTag}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar etiqueta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la etiqueta "{tagToDelete?.name}" y la removerá de todas las conversaciones donde esté asignada. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
