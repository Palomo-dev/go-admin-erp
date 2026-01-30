'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquarePlus, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import NewConversationService, {
  Customer,
  Channel,
  ConversationTag,
  OrganizationMember,
  QuickCustomerData
} from '@/lib/services/newConversationService';
import {
  ChannelSelector,
  CustomerSelector,
  QuickCustomerDialog,
  ConversationOptions
} from '@/components/chat/conversations/nuevo';

export default function NuevaConversacionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Data states
  const [channels, setChannels] = useState<Channel[]>([]);
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  
  // Form states
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [subject, setSubject] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assignedMemberId, setAssignedMemberId] = useState<number | null>(null);

  // UI states
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showQuickCustomerDialog, setShowQuickCustomerDialog] = useState(false);

  useEffect(() => {
    if (organizationId) {
      loadInitialData();
    }
  }, [organizationId]);

  const loadInitialData = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      const service = new NewConversationService(organizationId);

      const [channelsData, tagsData, membersData] = await Promise.all([
        service.getActiveChannels(),
        service.getConversationTags(),
        service.getOrganizationMembers()
      ]);

      setChannels(channelsData);
      setTags(tagsData);
      setMembers(membersData);

      // Preseleccionar canal Website si existe
      const websiteChannel = channelsData.find(c => c.type === 'website');
      if (websiteChannel) {
        setSelectedChannelId(websiteChannel.id);
      } else if (channelsData.length > 0) {
        setSelectedChannelId(channelsData[0].id);
      }
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos necesarios',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearchCustomers = async (search: string): Promise<Customer[]> => {
    if (!organizationId) return [];
    const service = new NewConversationService(organizationId);
    return service.searchCustomers(search);
  };

  const handleCreateQuickCustomer = async (data: QuickCustomerData) => {
    if (!organizationId) return;

    try {
      const service = new NewConversationService(organizationId);
      const customer = await service.createQuickCustomer(data);
      setSelectedCustomer(customer);
      toast({
        title: 'Cliente creado',
        description: `${customer.full_name} ha sido creado exitosamente`
      });
    } catch (error) {
      console.error('Error creando cliente:', error);
      throw error;
    }
  };

  const handleCreateConversation = async () => {
    if (!organizationId) return;

    // Validaciones
    if (!selectedChannelId) {
      toast({
        title: 'Error',
        description: 'Selecciona un canal',
        variant: 'destructive'
      });
      return;
    }

    if (!selectedCustomer) {
      toast({
        title: 'Error',
        description: 'Selecciona o crea un cliente',
        variant: 'destructive'
      });
      return;
    }

    if (!initialMessage.trim()) {
      toast({
        title: 'Error',
        description: 'Escribe un mensaje inicial',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsCreating(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'No se pudo obtener el usuario actual',
          variant: 'destructive'
        });
        return;
      }

      const service = new NewConversationService(organizationId);
      const memberId = await service.getCurrentMemberId(user.id);
      
      if (!memberId) {
        toast({
          title: 'Error',
          description: 'No tienes permisos para crear conversaciones',
          variant: 'destructive'
        });
        return;
      }

      const conversationId = await service.createConversation(
        {
          channel_id: selectedChannelId,
          customer_id: selectedCustomer.id,
          subject: subject.trim() || undefined,
          initial_message: initialMessage.trim(),
          priority,
          tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
          assigned_member_id: assignedMemberId || undefined
        },
        user.id,
        memberId
      );

      toast({
        title: 'Conversación creada',
        description: 'La conversación ha sido creada exitosamente'
      });

      // Redirigir a la conversación
      router.push(`/app/chat/conversaciones/${conversationId}`);
    } catch (error) {
      console.error('Error creando conversación:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la conversación',
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = selectedChannelId && selectedCustomer && initialMessage.trim();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/app/chat/bandeja')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <MessageSquarePlus className="h-6 w-6 text-blue-600" />
                Nueva Conversación
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Inicia una conversación saliente con un cliente
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Canal y Cliente */}
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg">Datos de la Conversación</CardTitle>
            <CardDescription>
              Selecciona el canal y el cliente para iniciar la conversación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ChannelSelector
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelect={setSelectedChannelId}
            />

            <CustomerSelector
              selectedCustomer={selectedCustomer}
              onSelect={setSelectedCustomer}
              onSearchCustomers={handleSearchCustomers}
              onCreateQuickCustomer={() => setShowQuickCustomerDialog(true)}
            />
          </CardContent>
        </Card>

        {/* Mensaje y opciones */}
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg">Mensaje y Opciones</CardTitle>
            <CardDescription>
              Configura el mensaje inicial y las opciones de la conversación
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConversationOptions
              subject={subject}
              onSubjectChange={setSubject}
              initialMessage={initialMessage}
              onInitialMessageChange={setInitialMessage}
              priority={priority}
              onPriorityChange={setPriority}
              tags={tags}
              selectedTagIds={selectedTagIds}
              onTagsChange={setSelectedTagIds}
              members={members}
              assignedMemberId={assignedMemberId}
              onAssignedMemberChange={setAssignedMemberId}
            />
          </CardContent>
        </Card>

        {/* Acciones */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/app/chat/bandeja')}
            disabled={isCreating}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCreateConversation}
            disabled={!canCreate || isCreating}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Crear Conversación
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Dialog para crear cliente rápido */}
      <QuickCustomerDialog
        isOpen={showQuickCustomerDialog}
        onClose={() => setShowQuickCustomerDialog(false)}
        onSave={handleCreateQuickCustomer}
      />
    </div>
  );
}
