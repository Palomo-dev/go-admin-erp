'use client';

import React, { useState, useEffect } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  MessageSquare,
  Tag,
  Clock,
  User,
  FileText,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase/config';
import { Conversation } from '@/lib/services/conversationsService';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface CustomerDetails {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  doc_type: string;
  doc_number: string;
  address: string;
  city: string;
  country: string;
  is_online: boolean;
  last_seen_at: string;
  created_at: string;
  metadata?: Record<string, unknown>;
  tags?: Array<{ id: string; name: string; color: string }>;
  notes?: string;
}

interface ConversationSummary {
  total_conversations: number;
  total_messages: number;
  first_contact: string;
  last_contact: string;
}

interface CustomerProfilePanelProps {
  conversation: Conversation | null;
  organizationId?: number;
}

export default function CustomerProfilePanel({
  conversation,
  organizationId
}: CustomerProfilePanelProps) {
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentConversations, setRecentConversations] = useState<Array<{
    id: string;
    created_at: string;
    last_message_at: string;
    message_count: number;
  }>>([]);

  useEffect(() => {
    if (conversation?.customer_id) {
      loadCustomerData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.customer_id]);

  const loadCustomerData = async () => {
    if (!conversation?.customer_id || !organizationId) return;

    try {
      setLoading(true);

      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', conversation.customer_id)
        .single();

      if (customerError) throw customerError;

      setCustomer({ ...customerData, tags: [] });

      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('id, created_at, last_message_at, message_count')
        .eq('customer_id', conversation.customer_id)
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false });

      if (!convError && convData) {
        const totalMessages = convData.reduce((acc, c) => acc + (c.message_count || 0), 0);
        const firstContact = convData[convData.length - 1]?.created_at;
        const lastContact = convData[0]?.last_message_at;

        setSummary({
          total_conversations: convData.length,
          total_messages: totalMessages,
          first_contact: firstContact,
          last_contact: lastContact
        });

        setRecentConversations(convData.slice(0, 5));
      }
    } catch (error) {
      console.error('Error cargando datos del cliente:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatRelativeTime = (date: string) => {
    if (!date) return 'N/A';
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
  };

  const customerName = customer?.full_name || 
    `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() ||
    conversation?.customer?.full_name ||
    'Cliente';

  const customerInitials = customerName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No se encontró información del cliente
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header del perfil */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xl">
              {customerInitials}
            </AvatarFallback>
          </Avatar>
          <div className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white dark:border-gray-900 ${
            customer.is_online ? 'bg-green-500' : 'bg-gray-400'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {customerName}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {customer.is_online ? 'En línea' : `Visto ${formatRelativeTime(customer.last_seen_at)}`}
          </p>
        </div>
      </div>

      {/* Tags */}
      {customer.tags && customer.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customer.tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              style={{ 
                borderColor: tag.color,
                color: tag.color,
                backgroundColor: `${tag.color}10`
              }}
            >
              <Tag className="h-3 w-3 mr-1" />
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      <Separator />

      {/* Información de contacto */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <User className="h-4 w-4" />
          Información de Contacto
        </h4>
        
        <div className="space-y-2 text-sm">
          {customer.email && (
            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              <Mail className="h-4 w-4 flex-shrink-0" />
              <a 
                href={`mailto:${customer.email}`}
                className="hover:text-blue-600 truncate"
              >
                {customer.email}
              </a>
            </div>
          )}
          
          {customer.phone && (
            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              <Phone className="h-4 w-4 flex-shrink-0" />
              <a 
                href={`tel:${customer.phone}`}
                className="hover:text-blue-600"
              >
                {customer.phone}
              </a>
            </div>
          )}
          
          {(customer.address || customer.city || customer.country) && (
            <div className="flex items-start gap-3 text-gray-600 dark:text-gray-400">
              <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                {[customer.address, customer.city, customer.country]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </div>
          )}

          {customer.doc_number && (
            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span>
                {customer.doc_type ? `${customer.doc_type}: ` : ''}
                {customer.doc_number}
              </span>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Resumen de actividad */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Resumen de Actividad
        </h4>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <p className="text-2xl font-bold text-blue-600">
              {summary?.total_conversations || 0}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Conversaciones
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <p className="text-2xl font-bold text-blue-600">
              {summary?.total_messages || 0}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Mensajes
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Primer contacto
            </span>
            <span>{formatDate(summary?.first_contact || customer.created_at)}</span>
          </div>
          <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Último contacto
            </span>
            <span>{formatRelativeTime(summary?.last_contact || '')}</span>
          </div>
        </div>
      </div>

      {/* Conversaciones recientes */}
      {recentConversations.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Conversaciones Recientes
            </h4>
            
            <div className="space-y-2">
              {recentConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-sm"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-400">
                      {conv.message_count} mensajes
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatRelativeTime(conv.last_message_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Notas */}
      {customer.notes && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notas
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
              {customer.notes}
            </p>
          </div>
        </>
      )}

      {/* Botón ver perfil completo */}
      <div className="pt-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => window.open(`/app/crm/clientes/${customer.id}`, '_blank')}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Ver perfil completo
        </Button>
      </div>
    </div>
  );
}
