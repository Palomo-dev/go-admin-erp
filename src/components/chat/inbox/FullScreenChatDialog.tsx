'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, ArrowDown, Flag, Plus, XCircle, Clock, Circle, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
    products?: Array<{
      id: number;
      name: string;
      price: number;
      comparePrice?: number | null;
      imageUrl?: string | null;
      stock?: number | null;
    }>;
    order_action?: any;
  };
}

interface FullScreenChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation | null;
  onSendMessage?: (content: string, type?: 'text' | 'audio' | 'file', file?: File) => Promise<void>;
  organizationId?: number;
  onStatusChange?: (conversationId: string, status: string) => Promise<void>;
  onPriorityChange?: (conversationId: string, priority: string) => Promise<void>;
  onTagToggle?: (conversationId: string, tagId: string) => Promise<void>;
  availableTags?: Array<{ id: string; name: string; color: string }>;
}

const MESSAGES_PAGE_SIZE = 50;

export default function FullScreenChatDialog({
  open,
  onOpenChange,
  conversation,
  onSendMessage,
  organizationId,
  onStatusChange,
  onPriorityChange,
  onTagToggle,
  availableTags
}: FullScreenChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const topObserverRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const customerName = conversation?.customer?.full_name || 
    `${conversation?.customer?.first_name || ''} ${conversation?.customer?.last_name || ''}`.trim() ||
    'Cliente';
  
  const customerInitials = customerName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'closed': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'low': return 'Baja';
      case 'normal': return 'Normal';
      case 'high': return 'Alta';
      case 'urgent': return 'Urgente';
      default: return priority;
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600';
      case 'normal': return 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800';
      case 'high': return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
      case 'urgent': return 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800';
      default: return 'bg-slate-100 text-slate-500 border border-slate-200';
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!conversation || !onStatusChange) return;
    await onStatusChange(conversation.id, newStatus);
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!conversation || !onPriorityChange) return;
    await onPriorityChange(conversation.id, newPriority);
  };

  const handleTagToggle = async (tagId: string) => {
    if (!conversation || !onTagToggle) return;
    await onTagToggle(conversation.id, tagId);
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const loadMessages = useCallback(async (isInitial = true) => {
    if (!conversation) return;

    try {
      if (isInitial) {
        setLoading(true);
        setHasMoreMessages(true);
      }
      
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

  // Cargar mensajes cuando se abre el dialog
  useEffect(() => {
    if (open && conversation) {
      loadMessages(true);

      // Suscripción realtime
      const channel = supabase
        .channel(`fullscreen-chat-${conversation.id}`)
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
  }, [open, conversation?.id, loadMessages]);

  // Observer para scroll infinito hacia arriba
  useEffect(() => {
    if (!open) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreMessages && !loadingMore) {
          loadMoreMessages();
        }
      },
      { threshold: 0.1 }
    );

    if (topObserverRef.current) {
      observerRef.current.observe(topObserverRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [open, hasMoreMessages, loadingMore, loadMoreMessages]);

  // Detectar si el usuario scrolleó hacia arriba
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

  // Auto-scroll cuando llegan nuevos mensajes
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  const handleSendMessage = async (content: string, type?: 'text' | 'audio' | 'file', file?: File) => {
    if (!conversation || !onSendMessage) return;

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
      scrollToBottom();
    }

    try {
      setSending(true);
      await onSendMessage(content, type, file);
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

  if (!conversation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen p-0 flex flex-col gap-0 rounded-none border-0" hideCloseButton>
        {/* Header */}
        <DialogHeader className="border-b dark:border-gray-700 px-3 sm:px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative flex-shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    {customerInitials}
                  </AvatarFallback>
                </Avatar>
                <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${getStatusColor(conversation.status)}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-sm font-semibold truncate">
                    {customerName}
                  </DialogTitle>
                  {/* Prioridad */}
                  {onPriorityChange && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 flex-shrink-0 ${getPriorityBadgeClass(conversation.priority)}`}
                          title="Cambiar prioridad"
                        >
                          <Flag className="h-3 w-3" />
                          {getPriorityLabel(conversation.priority)}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Prioridad</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                          <DropdownMenuItem
                            key={p}
                            onClick={() => handlePriorityChange(p)}
                            className={conversation.priority === p ? 'bg-gray-100 dark:bg-gray-700' : ''}
                          >
                            <Flag className="h-4 w-4 mr-2" />
                            {getPriorityLabel(p)}
                            {conversation.priority === p && <span className="ml-auto text-xs">✓</span>}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate max-w-[150px] sm:max-w-none">{conversation.customer?.email}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {conversation.channel?.type || 'web'}
                  </Badge>
                </div>
                {/* Etiquetas */}
                {onTagToggle && (
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {conversation.tags?.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                      >
                        {tag.name}
                        <button
                          onClick={() => handleTagToggle(tag.id)}
                          className="hover:opacity-70 cursor-pointer"
                          title="Quitar etiqueta"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    {availableTags && availableTags.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                            title="Agregar etiqueta"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            Etiqueta
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>Etiquetas</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {availableTags
                            .filter((t) => !conversation.tags?.some((ct) => ct.id === t.id))
                            .map((tag) => (
                              <DropdownMenuItem
                                key={tag.id}
                                onClick={() => handleTagToggle(tag.id)}
                              >
                                <span
                                  className="h-2.5 w-2.5 rounded-full mr-2 flex-shrink-0"
                                  style={{ backgroundColor: tag.color }}
                                />
                                {tag.name}
                              </DropdownMenuItem>
                            ))}
                          {availableTags.filter((t) => !conversation.tags?.some((ct) => ct.id === t.id)).length === 0 && (
                            <div className="px-2 py-1.5 text-xs text-gray-400">Todas las etiquetas ya están asignadas</div>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {onStatusChange && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Estado</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {conversation.status !== 'closed' && (
                      <DropdownMenuItem onClick={() => handleStatusChange('closed')} className="text-red-600">
                        <XCircle className="h-4 w-4 mr-2" />
                        Cerrar conversación
                      </DropdownMenuItem>
                    )}
                    {conversation.status !== 'pending' && (
                      <DropdownMenuItem onClick={() => handleStatusChange('pending')} className="text-yellow-600">
                        <Clock className="h-4 w-4 mr-2" />
                        Dejar pendiente
                      </DropdownMenuItem>
                    )}
                    {conversation.status !== 'open' && (
                      <DropdownMenuItem onClick={() => handleStatusChange('open')} className="text-green-600">
                        <Circle className="h-4 w-4 mr-2" />
                        Reabrir conversación
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Mensajes */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 bg-gray-50 dark:bg-gray-900 relative"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        >
          {/* Observer para cargar más mensajes */}
          <div ref={topObserverRef} className="h-1" />
          
          {loadingMore && (
            <div className="flex items-center justify-center py-2">
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
              <p className="text-gray-500 dark:text-gray-400">
                No hay mensajes en esta conversación
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full">
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

          {/* Botón scroll to bottom */}
          {showScrollButton && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute bottom-4 right-4 rounded-full shadow-lg h-10 w-10"
              onClick={() => scrollToBottom()}
            >
              <ArrowDown className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t dark:border-gray-700">
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
      </DialogContent>
    </Dialog>
  );
}
