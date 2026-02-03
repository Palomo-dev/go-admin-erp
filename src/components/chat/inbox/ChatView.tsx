'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, MoreVertical, Phone, Video, Search, ArrowLeft, Maximize2, PanelLeftOpen, PanelLeftClose, User, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import FullScreenChatDialog from './FullScreenChatDialog';
import { ChatSidePanel, ChatPanelType } from './ChatSidePanel';
import CustomerProfilePanel from './CustomerProfilePanel';
import SearchPanel from './SearchPanel';
import { supabase } from '@/lib/supabase/config';
import { Conversation } from '@/lib/services/conversationsService';

interface Message {
  id: string;
  content: string;
  content_type?: 'text' | 'image' | 'audio' | 'file';
  direction: 'inbound' | 'outbound';
  role: 'customer' | 'agent' | 'ai';
  created_at: string;
  is_read: boolean;
  sender_customer_id?: string;
  sender_member_id?: number;
  metadata?: {
    file_name?: string;
    file_type?: string;
    file_size?: number;
  };
}

interface ChatViewProps {
  conversation: Conversation | null;
  onBack?: () => void;
  onSendMessage?: (content: string, type?: 'text' | 'audio' | 'file', file?: File) => Promise<void>;
  organizationId?: number;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}

const MESSAGES_PAGE_SIZE = 10;

export default function ChatView({ conversation, onBack, onSendMessage, organizationId, onToggleSidebar, sidebarCollapsed }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  // Estados para los nuevos componentes
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [activePanel, setActivePanel] = useState<ChatPanelType>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const topObserverRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const handleOpenFullView = () => {
    setShowFullScreen(true);
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!conversation) return;

    try {
      setLoading(true);
      setHasMoreMessages(true);
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);

      if (error) throw error;
      
      const sortedMessages = (data || []).reverse();
      setMessages(sortedMessages);
      setHasMoreMessages((data?.length || 0) >= MESSAGES_PAGE_SIZE);
      
      // Scroll al final después de cargar
      setTimeout(() => scrollToBottom('auto'), 100);
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    } finally {
      setLoading(false);
    }
  }, [conversation, scrollToBottom]);

  const loadMoreMessages = useCallback(async () => {
    if (!conversation || loadingMore || !hasMoreMessages || messages.length === 0) return;

    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;

    try {
      setLoadingMore(true);
      
      const oldestMessage = messages[0];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);

      if (error) throw error;

      if (data && data.length > 0) {
        const newMessages = data.reverse();
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
          return [...uniqueNew, ...prev];
        });
        setHasMoreMessages(data.length >= MESSAGES_PAGE_SIZE);

        // Mantener posición de scroll
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - previousScrollHeight;
          }
        });
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('Error cargando más mensajes:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [conversation, loadingMore, hasMoreMessages, messages]);

  useEffect(() => {
    if (conversation) {
      loadMessages();
      
      // Suscripción realtime para nuevos mensajes
      const channel = supabase
        .channel(`chat-messages-${conversation.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversation.id}`
          },
          (payload) => {
            const newMessage = payload.new as Message;
            setMessages(prev => {
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        )
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  // Observer para scroll infinito hacia arriba
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreMessages && !loadingMore && !loading) {
          loadMoreMessages();
        }
      },
      { threshold: 0.1, rootMargin: '100px 0px 0px 0px' }
    );

    if (topObserverRef.current) {
      observerRef.current.observe(topObserverRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [hasMoreMessages, loadingMore, loading, loadMoreMessages]);

  // Detectar si el usuario scrolleó hacia arriba para mostrar botón
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Auto-scroll cuando llegan nuevos mensajes si está cerca del final
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || loading) return;
    
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom, loading]);

  const handleScrollToMessage = useCallback((messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-yellow-100', 'dark:bg-yellow-900/30');
      setTimeout(() => {
        element.classList.remove('bg-yellow-100', 'dark:bg-yellow-900/30');
      }, 2000);
    }
  }, []);

  const handleSendMessage = async (content: string, type?: 'text' | 'audio' | 'file', file?: File) => {
    if (!conversation || !onSendMessage) return;

    // Solo mostrar mensaje temporal para texto plano (no archivos)
    const isTextOnly = !file && (!type || type === 'text');
    const tempId = `temp-${Date.now()}`;
    
    if (isTextOnly) {
      const tempMessage: Message = {
        id: tempId,
        content,
        content_type: 'text',
        direction: 'outbound',
        role: 'agent',
        created_at: new Date().toISOString(),
        is_read: true
      };
      setMessages(prev => [...prev, tempMessage]);
    }

    try {
      setSending(true);
      await onSendMessage(content, type, file);
      // El realtime actualizará con el mensaje real
      // Remover temporal después de un delay para evitar duplicado visual
      if (isTextOnly) {
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== tempId));
        }, 500);
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      if (isTextOnly) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } finally {
      setSending(false);
    }
  };

  if (!conversation) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="mx-auto h-24 w-24 text-gray-300 dark:text-gray-700 mb-4">
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              className="h-full w-full"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Selecciona una conversación
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Elige una conversación de la lista para comenzar a chatear
          </p>
        </div>
      </div>
    );
  }

  const customerName = conversation.customer?.full_name || 
                       `${conversation.customer?.first_name || ''} ${conversation.customer?.last_name || ''}`.trim() ||
                       'Cliente';
  const customerInitials = customerName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'closed':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getPanelTitle = () => {
    switch (activePanel) {
      case 'profile':
        return 'Perfil del Cliente';
      case 'search':
        return 'Buscar en Conversación';
      default:
        return '';
    }
  };

  return (
    <div className="h-full flex bg-white dark:bg-gray-900">
      {/* Área principal del chat */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Header - sticky para que siempre sea visible */}
      <div className="sticky top-0 z-20 border-b dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Botón toggle sidebar (desktop) */}
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="hidden lg:flex flex-shrink-0"
              title={sidebarCollapsed ? 'Mostrar lista' : 'Ocultar lista'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>
          )}
          
          {/* Botón back (móvil) */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="lg:hidden flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}

          {/* Avatar y nombre */}
          <div className="relative flex-shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                {customerInitials}
              </AvatarFallback>
            </Avatar>
            <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${getStatusColor(conversation.status)}`} />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {customerName}
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{conversation.customer?.email}</span>
              {conversation.unread_count > 0 && (
                <Badge variant="default" className="bg-blue-600 text-white text-[10px] px-1.5 py-0">
                  {conversation.unread_count}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9"
            onClick={handleOpenFullView}
            title="Abrir vista completa"
          >
            <Maximize2 className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Phone className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Video className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleOpenFullView}>
                <Maximize2 className="h-4 w-4 mr-2" />
                Abrir vista completa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActivePanel(activePanel === 'profile' ? null : 'profile')}>
                <User className="h-4 w-4 mr-2" />
                Ver perfil del cliente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActivePanel(activePanel === 'search' ? null : 'search')}>
                <Search className="h-4 w-4 mr-2" />
                Buscar en conversación
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                Cerrar conversación
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mensajes */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-950 relative"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      >
        {/* Observer para cargar más mensajes hacia arriba */}
        <div ref={topObserverRef} className="h-4 w-full" />
        
        {!hasMoreMessages && messages.length > 0 && (
          <div className="text-center py-2 mb-2">
            <span className="text-xs text-gray-400">Inicio de la conversación</span>
          </div>
        )}
        
        {loadingMore && (
          <div className="flex items-center justify-center py-2 mb-2">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="ml-2 text-sm text-gray-500">Cargando mensajes anteriores...</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400">
                No hay mensajes en esta conversación
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {messages.map((message, index) => {
              const showAvatar = index === 0 || 
                messages[index - 1]?.role !== message.role;
              
              return (
                <div key={message.id} id={`message-${message.id}`} className="transition-colors duration-500">
                  <MessageBubble
                    message={message}
                    showAvatar={showAvatar}
                    senderName={message.role === 'agent' ? 'Agente' : customerName}
                  />
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Botón scroll to bottom */}
        {showScrollButton && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-4 right-4 rounded-full shadow-lg h-10 w-10 z-10"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        disabled={sending || conversation.status === 'closed'}
        placeholder={
          conversation.status === 'closed'
            ? 'Esta conversación está cerrada'
            : 'Escribe un mensaje...'
        }
        organizationId={organizationId}
      />
      </div>

      {/* Panel lateral (perfil/búsqueda) */}
      <ChatSidePanel
        isOpen={!!activePanel}
        onClose={() => setActivePanel(null)}
        activePanel={activePanel}
        title={getPanelTitle()}
      >
        {activePanel === 'profile' && (
          <CustomerProfilePanel
            conversation={conversation}
            organizationId={organizationId}
          />
        )}
        {activePanel === 'search' && (
          <SearchPanel
            conversation={conversation}
            onScrollToMessage={handleScrollToMessage}
          />
        )}
      </ChatSidePanel>

      {/* Dialog de vista completa */}
      <FullScreenChatDialog
        open={showFullScreen}
        onOpenChange={setShowFullScreen}
        conversation={conversation}
        onSendMessage={onSendMessage}
        organizationId={organizationId}
      />
    </div>
  );
}
