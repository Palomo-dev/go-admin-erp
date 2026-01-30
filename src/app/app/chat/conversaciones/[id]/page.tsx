'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import ConversationDetailService, {
  ConversationDetail,
  Message,
  ConversationNote,
  QuickReply,
  ConversationSummary,
  AIJob
} from '@/lib/services/conversationDetailService';
import {
  MessageTimeline,
  CustomerPanel,
  NotesPanel,
  QuickRepliesPanel,
  ConversationHeader,
  AIAssistantPanel,
  MessageInput,
  ConversationActions
} from '@/components/chat/conversations/id';

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [activeAIJob, setActiveAIJob] = useState<AIJob | null>(null);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [members, setMembers] = useState<Array<{ id: number; user_id: string }>>([]);
  const [suggestedResponse, setSuggestedResponse] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  useEffect(() => {
    if (organizationId && conversationId) {
      loadAllData();
    }
  }, [organizationId, conversationId]);

  const loadAllData = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      const service = new ConversationDetailService(organizationId);

      const [
        conversationData,
        messagesData,
        notesData,
        quickRepliesData,
        summaryData,
        activeJobData,
        tagsData,
        membersData
      ] = await Promise.all([
        service.getConversation(conversationId),
        service.getMessages(conversationId),
        service.getNotes(conversationId),
        service.getQuickReplies(),
        service.getSummary(conversationId),
        service.getActiveAIJob(conversationId),
        service.getTags(),
        service.getOrganizationMembers()
      ]);

      setConversation(conversationData);
      setMessages(messagesData);
      setNotes(notesData);
      setQuickReplies(quickRepliesData);
      setSummary(summaryData);
      setActiveAIJob(activeJobData);
      setAvailableTags(tagsData);
      setMembers(membersData);

      if (activeJobData?.status === 'completed' && activeJobData.response_text) {
        setSuggestedResponse(activeJobData.response_text);
      }

      await service.markMessagesAsRead(conversationId);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de la conversación',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
      setMessagesLoading(false);
      setNotesLoading(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.sendMessage(conversationId, content);
      
      const messagesData = await service.getMessages(conversationId);
      setMessages(messagesData);

      const conversationData = await service.getConversation(conversationId);
      setConversation(conversationData);

      toast({
        title: 'Mensaje enviado',
        description: 'El mensaje ha sido enviado correctamente'
      });
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      toast({
        title: 'Error',
        description: 'No se pudo enviar el mensaje',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleAddNote = async (note: string) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.addNote(conversationId, note);
      
      const notesData = await service.getNotes(conversationId);
      setNotes(notesData);

      toast({
        title: 'Nota agregada',
        description: 'La nota ha sido agregada correctamente'
      });
    } catch (error) {
      console.error('Error agregando nota:', error);
      toast({
        title: 'Error',
        description: 'No se pudo agregar la nota',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleToggleNotePin = async (noteId: string, isPinned: boolean) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.toggleNotePin(noteId, isPinned);
      
      const notesData = await service.getNotes(conversationId);
      setNotes(notesData);
    } catch (error) {
      console.error('Error actualizando nota:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la nota',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.deleteNote(noteId);
      
      const notesData = await service.getNotes(conversationId);
      setNotes(notesData);

      toast({
        title: 'Nota eliminada',
        description: 'La nota ha sido eliminada'
      });
    } catch (error) {
      console.error('Error eliminando nota:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la nota',
        variant: 'destructive'
      });
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.updateConversationStatus(conversationId, status);
      
      const conversationData = await service.getConversation(conversationId);
      setConversation(conversationData);

      toast({
        title: 'Estado actualizado',
        description: `La conversación está ahora ${
          status === 'open' ? 'abierta' : status === 'pending' ? 'pendiente' : 'cerrada'
        }`
      });
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handlePriorityChange = async (priority: string) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.updateConversationPriority(conversationId, priority);
      
      const conversationData = await service.getConversation(conversationId);
      setConversation(conversationData);

      toast({
        title: 'Prioridad actualizada',
        description: 'La prioridad ha sido actualizada'
      });
    } catch (error) {
      console.error('Error actualizando prioridad:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la prioridad',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleAssign = async (memberId: number | null) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.assignConversation(conversationId, memberId);
      
      const conversationData = await service.getConversation(conversationId);
      setConversation(conversationData);

      toast({
        title: memberId ? 'Conversación asignada' : 'Asignación removida',
        description: memberId 
          ? 'La conversación ha sido asignada'
          : 'Se ha removido la asignación'
      });
    } catch (error) {
      console.error('Error asignando conversación:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la asignación',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.addTag(conversationId, tagId);
      
      const conversationData = await service.getConversation(conversationId);
      setConversation(conversationData);

      toast({
        title: 'Etiqueta agregada',
        description: 'La etiqueta ha sido agregada'
      });
    } catch (error) {
      console.error('Error agregando etiqueta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo agregar la etiqueta',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.removeTag(conversationId, tagId);
      
      const conversationData = await service.getConversation(conversationId);
      setConversation(conversationData);

      toast({
        title: 'Etiqueta removida',
        description: 'La etiqueta ha sido removida'
      });
    } catch (error) {
      console.error('Error removiendo etiqueta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo remover la etiqueta',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleRequestAIResponse = async () => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      const job = await service.requestAIResponse(conversationId);
      setActiveAIJob(job);

      toast({
        title: 'Respuesta IA solicitada',
        description: 'Se está generando una respuesta con IA'
      });
    } catch (error) {
      console.error('Error solicitando respuesta IA:', error);
      toast({
        title: 'Error',
        description: 'No se pudo solicitar la respuesta IA',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleSelectQuickReply = (content: string) => {
    setSuggestedResponse(content);
  };

  const handleUseQuickReply = async (replyId: string) => {
    if (!organizationId) return;

    try {
      const service = new ConversationDetailService(organizationId);
      await service.useQuickReply(replyId);
    } catch (error) {
      console.error('Error registrando uso de respuesta rápida:', error);
    }
  };

  const customerName = conversation?.customer?.full_name || 
                       `${conversation?.customer?.first_name || ''} ${conversation?.customer?.last_name || ''}`.trim() ||
                       'Cliente';

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <ConversationHeader
        conversation={conversation}
        onStatusChange={handleStatusChange}
        onPriorityChange={handlePriorityChange}
      />

      {/* Contenido principal */}
      <div className="flex-1 flex overflow-hidden">
        {/* Columna central - Timeline de mensajes */}
        <div className="flex-1 flex flex-col min-w-0">
          <MessageTimeline
            messages={messages}
            customerName={customerName}
            loading={messagesLoading}
          />

          <MessageInput
            onSendMessage={handleSendMessage}
            quickReplies={quickReplies}
            onSelectQuickReply={(reply) => handleSelectQuickReply(reply.content)}
            disabled={conversation?.status === 'closed'}
            suggestedResponse={suggestedResponse}
            onClearSuggestion={() => setSuggestedResponse('')}
          />
        </div>

        {/* Panel lateral derecho */}
        <div className="hidden lg:flex w-80 xl:w-96 border-l dark:border-gray-800 flex-col bg-white dark:bg-gray-900">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-4 h-12 rounded-none border-b dark:border-gray-800">
              <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
              <TabsTrigger value="actions" className="text-xs">Acciones</TabsTrigger>
              <TabsTrigger value="notes" className="text-xs">Notas</TabsTrigger>
              <TabsTrigger value="ai" className="text-xs">IA</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="info" className="h-full m-0 p-0">
                <div className="h-full overflow-y-auto p-4 space-y-4">
                  <CustomerPanel
                    customer={conversation?.customer || null}
                    conversationCreatedAt={conversation?.created_at}
                    messageCount={conversation?.message_count}
                    tags={conversation?.tags}
                  />
                  <QuickRepliesPanel
                    quickReplies={quickReplies}
                    onSelectReply={handleSelectQuickReply}
                    onUseReply={handleUseQuickReply}
                  />
                </div>
              </TabsContent>

              <TabsContent value="actions" className="h-full m-0 p-4">
                <ConversationActions
                  conversation={conversation}
                  availableTags={availableTags}
                  members={members}
                  onStatusChange={handleStatusChange}
                  onPriorityChange={handlePriorityChange}
                  onAssign={handleAssign}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                  loading={loading}
                />
              </TabsContent>

              <TabsContent value="notes" className="h-full m-0 p-4">
                <NotesPanel
                  notes={notes}
                  loading={notesLoading}
                  onAddNote={handleAddNote}
                  onTogglePin={handleToggleNotePin}
                  onDeleteNote={handleDeleteNote}
                />
              </TabsContent>

              <TabsContent value="ai" className="h-full m-0 p-4">
                <AIAssistantPanel
                  summary={summary}
                  activeJob={activeAIJob}
                  aiMode={conversation?.channel?.ai_mode || 'manual'}
                  loading={loading}
                  onRequestResponse={handleRequestAIResponse}
                  onSendSuggestion={(content) => {
                    handleSendMessage(content);
                    setSuggestedResponse('');
                  }}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
