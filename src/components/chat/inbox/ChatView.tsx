'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, MoreVertical, Phone, Video, Search, ArrowLeft, Maximize2, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
=======
import FullScreenChatDialog from './FullScreenChatDialog';
import { ChatSidePanel, ChatPanelType } from './ChatSidePanel';
import CustomerProfilePanel from './CustomerProfilePanel';
import SearchPanel from './SearchPanel';
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
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

export default function ChatView({ conversation, onBack, onSendMessage, organizationId, onToggleSidebar, sidebarCollapsed }: ChatViewProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
=======
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  // Estados para los nuevos componentes
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [activePanel, setActivePanel] = useState<ChatPanelType>(null);
  
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const handleOpenFullView = () => {
    if (conversation) {
      router.push(`/app/chat/conversations/${conversation.id}`);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
            console.log('📩 Nuevo mensaje recibido en ChatView:', payload);
            const newMessage = payload.new as Message;
            setMessages(prev => {
              // Evitar duplicados
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        )
        .subscribe((status) => {
          console.log('🔌 ChatView realtime status:', status, 'conversation:', conversation.id);
        });
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [conversation?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    if (!conversation) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    } finally {
      setLoading(false);
    }
  };

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
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="border-b dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between">
=======
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
    <div className="h-full flex bg-white dark:bg-gray-900">
      {/* Área principal del chat */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Header - sticky para que siempre sea visible */}
      <div className="sticky top-0 z-20 border-b dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between flex-shrink-0">
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
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
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
              <DropdownMenuItem>Ver perfil del cliente</DropdownMenuItem>
              <DropdownMenuItem>Buscar en conversación</DropdownMenuItem>
=======
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
              <DropdownMenuItem onClick={() => setActivePanel(activePanel === 'profile' ? null : 'profile')}>
                <User className="h-4 w-4 mr-2" />
                Ver perfil del cliente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActivePanel(activePanel === 'search' ? null : 'search')}>
                <Search className="h-4 w-4 mr-2" />
                Buscar en conversación
              </DropdownMenuItem>
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
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
        className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-950"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      >
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
                <MessageBubble
                  key={message.id}
                  message={message}
                  showAvatar={showAvatar}
                  senderName={message.role === 'agent' ? 'Agente' : customerName}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
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
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
=======
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
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
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/chat/inbox/ChatView.tsx
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
=======
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/components/chat/inbox/ChatView.tsx
    </div>
  );
}
