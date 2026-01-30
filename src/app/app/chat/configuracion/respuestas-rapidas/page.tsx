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
import InboxConfigService, { type QuickReply } from '@/lib/services/inboxConfigService';
import { QuickRepliesHeader, QuickReplyCard, QuickReplyDialog } from '@/components/chat/configuracion/respuestas-rapidas';
import { ConfigNavTabs } from '@/components/chat/configuracion/ConfigNavTabs';

export default function RespuestasRapidasPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedReply, setSelectedReply] = useState<QuickReply | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [replyToDelete, setReplyToDelete] = useState<QuickReply | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const service = new InboxConfigService(organizationId);
      const data = await service.getQuickReplies();
      setReplies(data);
    } catch (error) {
      console.error('Error cargando respuestas rápidas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las respuestas rápidas',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredReplies = replies.filter(reply =>
    reply.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reply.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reply.shortcut?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reply.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreate = () => {
    setSelectedReply(null);
    setDialogOpen(true);
  };

  const handleEdit = (reply: QuickReply) => {
    setSelectedReply(reply);
    setDialogOpen(true);
  };

  const handleDelete = (reply: QuickReply) => {
    setReplyToDelete(reply);
    setDeleteDialogOpen(true);
  };

  const handleSave = async (data: { title: string; content: string; shortcut?: string; tags?: string[]; is_active?: boolean }) => {
    if (!organizationId) return;

    const service = new InboxConfigService(organizationId);

    try {
      if (selectedReply) {
        await service.updateQuickReply(selectedReply.id, data);
        toast({
          title: 'Respuesta actualizada',
          description: 'Los cambios se guardaron correctamente'
        });
      } else {
        await service.createQuickReply(data);
        toast({
          title: 'Respuesta creada',
          description: 'La respuesta rápida se creó correctamente'
        });
      }
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la respuesta rápida',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const confirmDelete = async () => {
    if (!organizationId || !replyToDelete) return;

    const service = new InboxConfigService(organizationId);

    try {
      await service.deleteQuickReply(replyToDelete.id);
      toast({
        title: 'Respuesta eliminada',
        description: 'La respuesta rápida se eliminó correctamente'
      });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la respuesta rápida',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setReplyToDelete(null);
    }
  };

  if (loading && replies.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando respuestas rápidas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="p-4 sm:p-6 pb-0">
        <ConfigNavTabs />
      </div>
      <QuickRepliesHeader
        totalReplies={replies.length}
        searchTerm={searchTerm}
        loading={loading}
        onSearchChange={setSearchTerm}
        onRefresh={loadData}
        onCreate={handleCreate}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          {replies.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <span className="text-2xl">💬</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No hay respuestas rápidas configuradas
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Crea plantillas de respuesta para agilizar la atención al cliente
              </p>
            </div>
          ) : filteredReplies.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                No se encontraron respuestas que coincidan con "{searchTerm}"
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReplies.map((reply) => (
                <QuickReplyCard
                  key={reply.id}
                  reply={reply}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <QuickReplyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reply={selectedReply}
        onSave={handleSave}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar respuesta rápida?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la respuesta "{replyToDelete?.title}" de forma permanente. Esta acción no se puede deshacer.
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
