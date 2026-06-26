'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, Settings, Plus, Radio, Loader2, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import ConversationsService, {
  Conversation,
  ConversationFilters as Filters
} from '@/lib/services/conversationsService';
import {
  ConversationItemCompact,
  ChatView,
  ConversationSkeletonList
} from '@/components/chat/inbox';
import { SearchSelect } from '@/components/ui/search-select';

const PAGE_SIZE = 20;

export default function ChatBandejaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalConversations, setTotalConversations] = useState(0);
  const [channels, setChannels] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (organizationId) {
      loadChannels();
      loadTags();
      loadData();
      
      // Suscripción realtime para actualizar lista sin spinner
      const channel = supabase
        .channel('conversations-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `organization_id=eq.${organizationId}`
          },
          () => {
            loadDataSilent();
          }
        )
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [organizationId]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = conversations.filter(conv => {
        const customerName = conv.customer?.full_name || '';
        const customerEmail = conv.customer?.email || '';
        const lastMessage = conv.last_message?.content || '';
        const search = searchTerm.toLowerCase();
        return (
          customerName.toLowerCase().includes(search) ||
          customerEmail.toLowerCase().includes(search) ||
          lastMessage.toLowerCase().includes(search)
        );
      });
      setFilteredConversations(filtered);
    } else {
      setFilteredConversations(conversations);
    }
  }, [searchTerm, conversations]);

  const loadChannels = async () => {
    if (!organizationId) return;
    try {
      const { data } = await supabase
        .from('channels')
        .select('id, name, type')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('name');
      if (data) setChannels(data);
    } catch (error) {
      console.error('Error cargando canales:', error);
    }
  };

  const loadTags = async () => {
    if (!organizationId) return;
    try {
      const service = new ConversationsService(organizationId);
      const data = await service.getTags();
      if (data) setTags(data);
    } catch (error) {
      console.error('Error cargando etiquetas:', error);
    }
  };

  const buildFilters = (): Filters | undefined => {
    const filters: Filters = {};
    if (statusFilter !== 'all') filters.status = statusFilter;
    if (priorityFilter !== 'all') filters.priority = priorityFilter;
    if (channelFilter !== 'all') filters.channel = channelFilter;
    if (tagFilter !== 'all') filters.tag_id = tagFilter;
    return Object.keys(filters).length > 0 ? filters : undefined;
  };

  const loadData = async () => {
    if (!organizationId) return;

    try {
      const service = new ConversationsService(organizationId);
      const result = await service.getConversationsPaginated(buildFilters(), { limit: PAGE_SIZE, offset: 0 });
      setConversations(result.data);
      setFilteredConversations(result.data);
      setHasMore(result.hasMore);
      setTotalConversations(result.total);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las conversaciones',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Cargar más conversaciones (infinite scroll)
  const loadMore = useCallback(async () => {
    if (!organizationId || loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const service = new ConversationsService(organizationId);
      const result = await service.getConversationsPaginated(
        buildFilters(),
        { limit: PAGE_SIZE, offset: conversations.length }
      );
      
      // Deduplicar por ID para evitar claves duplicadas
      setConversations(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newConvs = result.data.filter(c => !existingIds.has(c.id));
        return [...prev, ...newConvs];
      });
      setFilteredConversations(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newConvs = result.data.filter(c => !existingIds.has(c.id));
        return [...prev, ...newConvs];
      });
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Error cargando más conversaciones:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [organizationId, loadingMore, hasMore, conversations.length]);

  // Versión silenciosa - solo actualiza las primeras conversaciones cargadas
  const loadDataSilent = async () => {
    if (!organizationId) return;
    try {
      const service = new ConversationsService(organizationId);
      const result = await service.getConversationsPaginated(
        buildFilters(),
        { limit: Math.max(conversations.length, PAGE_SIZE), offset: 0 }
      );
      setConversations(result.data);
      setFilteredConversations(result.data);
      setHasMore(result.hasMore);
      setTotalConversations(result.total);
    } catch (error) {
      console.error('Error actualizando datos:', error);
    }
  };

  // Configurar IntersectionObserver para infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !searchTerm) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loadingMore, loadMore, searchTerm]);

  useEffect(() => {
    if (organizationId) {
      loadData();
    }
  }, [statusFilter, priorityFilter, channelFilter, tagFilter]);

  const handleConversationSelect = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setShowMobileChat(true);
    
    // Marcar conversación como leída
    if (conversation.unread_count > 0) {
      await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversation.id);
      
      // Marcar mensajes como leídos
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversation.id)
        .eq('is_read', false);
      
      // Actualizar estado local
      setConversations(prev => prev.map(c => 
        c.id === conversation.id ? { ...c, unread_count: 0 } : c
      ));
      setFilteredConversations(prev => prev.map(c => 
        c.id === conversation.id ? { ...c, unread_count: 0 } : c
      ));
    }
  };

  const handleOpenFullView = (conversation: Conversation) => {
    router.push(`/app/chat/conversaciones/${conversation.id}`);
  };

  const handleBackToList = () => {
    setShowMobileChat(false);
  };

  const handleSendMessage = async (content: string, type?: 'text' | 'audio' | 'file', file?: File) => {
    if (!selectedConversation || !organizationId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', user?.id)
        .single();
      
      let messageContent = content;
      let contentType = 'text';
      let metadata: Record<string, any> = {};

      // Si hay archivo, subirlo a storage
      if (file && (type === 'audio' || type === 'file')) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `chat/${organizationId}/${selectedConversation.id}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Error subiendo archivo:', uploadError);
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('attachments')
          .getPublicUrl(filePath);

        messageContent = publicUrl;
        contentType = type === 'audio' ? 'audio' : (file.type.startsWith('image/') ? 'image' : 'file');
        metadata = {
          file_name: file.name,
          file_type: file.type,
          file_size: file.size
        };
      }
      
      const { error } = await supabase
        .from('messages')
        .insert({
          organization_id: organizationId,
          conversation_id: selectedConversation.id,
          channel_id: selectedConversation.channel_id,
          direction: 'outbound',
          role: 'agent',
          sender_member_id: member?.id || null,
          content_type: contentType,
          content: messageContent,
          metadata
        });

      if (error) throw error;

      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_agent_message_at: new Date().toISOString(),
          message_count: selectedConversation.message_count + 1
        })
        .eq('id', selectedConversation.id);
      
      loadDataSilent();
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

  const handleStatusChange = async (conversationId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      if (error) throw error;

      setConversations(prev => prev.map(c =>
        c.id === conversationId ? { ...c, status: newStatus } : c
      ));
      setFilteredConversations(prev => prev.map(c =>
        c.id === conversationId ? { ...c, status: newStatus } : c
      ));
      setSelectedConversation(prev => prev ? { ...prev, status: newStatus } : prev);

      toast({
        title: newStatus === 'closed' ? 'Conversación cerrada' : newStatus === 'pending' ? 'Conversación pendiente' : 'Conversación reabierta',
      });
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="h-full flex overflow-hidden bg-white dark:bg-gray-900">
      {/* Columna izquierda - Lista de conversaciones */}
      <div className={`
        ${showMobileChat ? 'hidden' : 'flex'} 
        lg:flex flex-col min-h-0 overflow-hidden
        ${sidebarCollapsed ? 'lg:w-0 lg:overflow-hidden' : 'w-full lg:w-[380px] xl:w-[420px]'}
        border-r dark:border-gray-800 bg-white dark:bg-gray-900
        transition-all duration-300 ease-in-out
      `}>
        {/* Header de conversaciones */}
        <div className="p-4 border-b dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Chats
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => router.push('/app/chat/conversaciones/nueva')}
                title="Nueva conversación"
              >
                <Plus className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => router.push('/app/chat/canales')}
                title="Canales"
              >
                <Radio className="h-5 w-5" />
              </Button>
              <Button
                variant={showFilters ? 'default' : 'ghost'}
                size="icon"
                className="h-9 w-9"
                onClick={() => setShowFilters(!showFilters)}
                title="Filtros"
              >
                <Filter className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 hidden lg:flex"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                title={sidebarCollapsed ? 'Mostrar lista' : 'Ocultar lista'}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
          
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar conversaciones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-gray-50 dark:bg-gray-800 border-0"
            />
          </div>

          {/* Filtros con buscador */}
          {showFilters && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Estado</label>
                <SearchSelect
                  options={[
                    { value: 'open', label: 'Abiertas' },
                    { value: 'pending', label: 'Pendientes' },
                    { value: 'closed', label: 'Cerradas' },
                  ]}
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  placeholder="Estado"
                  searchPlaceholder="Buscar estado..."
                  emptyText="No se encontraron estados"
                  noneLabel="Todos"
                  noneValue="all"
                  className="h-9 bg-gray-50 dark:bg-gray-800 border-0 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Prioridad</label>
                <SearchSelect
                  options={[
                    { value: 'low', label: 'Baja' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'high', label: 'Alta' },
                    { value: 'urgent', label: 'Urgente' },
                  ]}
                  value={priorityFilter}
                  onValueChange={setPriorityFilter}
                  placeholder="Prioridad"
                  searchPlaceholder="Buscar prioridad..."
                  emptyText="No se encontraron prioridades"
                  noneLabel="Todas"
                  noneValue="all"
                  className="h-9 bg-gray-50 dark:bg-gray-800 border-0 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Canal</label>
                <SearchSelect
                  options={channels.map((ch) => ({ value: ch.id, label: ch.name, sublabel: ch.type }))}
                  value={channelFilter}
                  onValueChange={setChannelFilter}
                  placeholder="Canal"
                  searchPlaceholder="Buscar canal..."
                  emptyText="No se encontraron canales"
                  noneLabel="Todos"
                  noneValue="all"
                  className="h-9 bg-gray-50 dark:bg-gray-800 border-0 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Etiqueta</label>
                <SearchSelect
                  options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
                  value={tagFilter}
                  onValueChange={setTagFilter}
                  placeholder="Etiqueta"
                  searchPlaceholder="Buscar etiqueta..."
                  emptyText="No se encontraron etiquetas"
                  noneLabel="Todas"
                  noneValue="all"
                  className="h-9 bg-gray-50 dark:bg-gray-800 border-0 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Lista de conversaciones */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {loading ? (
            <ConversationSkeletonList count={6} />
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {searchTerm ? 'No se encontraron conversaciones' : 'No hay conversaciones'}
              </p>
            </div>
          ) : (
            <>
              {filteredConversations.map((conversation) => (
                <ConversationItemCompact
                  key={conversation.id}
                  conversation={conversation}
                  isActive={selectedConversation?.id === conversation.id}
                  onClick={handleConversationSelect}
                />
              ))}
              
              {/* Elemento para detectar scroll infinito */}
              {!searchTerm && (
                <div ref={loadMoreRef} className="py-4">
                  {loadingMore ? (
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Cargando más...</span>
                    </div>
                  ) : hasMore ? (
                    <div className="text-center text-xs text-gray-400">
                      {conversations.length} de {totalConversations} conversaciones
                    </div>
                  ) : conversations.length > PAGE_SIZE ? (
                    <div className="text-center text-xs text-gray-400">
                      Todas las conversaciones cargadas ({totalConversations})
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Columna derecha - Chat */}
      <div className={`
        ${showMobileChat ? 'flex' : 'hidden'} 
        lg:flex flex-1 flex-col min-h-0 overflow-hidden
      `}>
        <ChatView
          conversation={selectedConversation}
          onBack={handleBackToList}
          onSendMessage={handleSendMessage}
          organizationId={organizationId}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          sidebarCollapsed={sidebarCollapsed}
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}
