'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ChatChannelsService, {
  ChatChannel,
  WidgetStats,
  AIMode,
  ChannelWebsiteSettings,
  BrandConfig,
  WidgetPosition,
  WidgetStyle,
  WidgetBehavior,
} from '@/lib/services/chatChannelsService';
import {
  WebsiteSettingsHeader,
  WidgetCodeSection,
  AllowedDomainsSection,
  CollectIdentitySection,
  AIModeSection,
  WidgetPreview,
  WidgetPositionSection,
  WidgetStyleSection,
  WidgetBehaviorSection
} from '@/components/chat/channels/website/id';

export default function CRMCanalDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const channelId = params.id as string;

  const [channel, setChannel] = useState<ChatChannel | null>(null);
  const [widgetStats, setWidgetStats] = useState<WidgetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRotatingKey, setIsRotatingKey] = useState(false);
  const [isUpdatingAI, setIsUpdatingAI] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    if (organizationId && channelId) {
      loadData();
    }
  }, [organizationId, channelId]);

  const loadData = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      const service = new ChatChannelsService(organizationId);

      const [channelData, statsData] = await Promise.all([
        service.getChannel(channelId),
        service.getWidgetStats(channelId).catch(() => null)
      ]);

      if (!channelData) {
        toast({
          title: 'Error',
          description: 'Canal no encontrado',
          variant: 'destructive'
        });
        router.push('/app/crm/configuracion/canales');
        return;
      }

      setChannel(channelData);
      setWidgetStats(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la configuración del canal',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getUserId = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');
    return user.id;
  };

  const handleToggleStatus = async () => {
    if (!organizationId || !channel) return;

    try {
      setIsUpdating(true);
      const userId = await getUserId();
      const service = new ChatChannelsService(organizationId);
      const updatedChannel = await service.toggleChannelStatus(channelId, userId);
      
      setChannel({ ...channel, status: updatedChannel.status });
      
      toast({
        title: updatedChannel.status === 'active' ? 'Canal activado' : 'Canal desactivado',
        description: `El canal ahora está ${updatedChannel.status === 'active' ? 'activo' : 'inactivo'}`
      });
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado del canal',
        variant: 'destructive'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRotateKey = async () => {
    if (!organizationId || !channel) return;

    try {
      setIsRotatingKey(true);
      const userId = await getUserId();
      const service = new ChatChannelsService(organizationId);
      const newKey = await service.rotatePublicKey(channelId, userId);
      
      setChannel({ ...channel, public_key: newKey });
      
      toast({
        title: 'Clave rotada',
        description: 'La clave pública ha sido regenerada. Actualiza el código del widget en tu sitio.'
      });
    } catch (error) {
      console.error('Error rotando clave:', error);
      toast({
        title: 'Error',
        description: 'No se pudo rotar la clave pública',
        variant: 'destructive'
      });
    } finally {
      setIsRotatingKey(false);
    }
  };

  const handleAddDomain = async (domain: string) => {
    if (!organizationId || !channel) return;

    try {
      const userId = await getUserId();
      const service = new ChatChannelsService(organizationId);
      const newDomains = await service.addAllowedDomain(channelId, domain, userId);
      
      setChannel({
        ...channel,
        website_settings: {
          ...channel.website_settings!,
          allowed_domains: newDomains
        }
      });
      
      toast({
        title: 'Dominio agregado',
        description: `El dominio "${domain}" ha sido agregado`
      });
    } catch (error) {
      console.error('Error agregando dominio:', error);
      toast({
        title: 'Error',
        description: 'No se pudo agregar el dominio',
        variant: 'destructive'
      });
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    if (!organizationId || !channel) return;

    try {
      const userId = await getUserId();
      const service = new ChatChannelsService(organizationId);
      const newDomains = await service.removeAllowedDomain(channelId, domain, userId);
      
      setChannel({
        ...channel,
        website_settings: {
          ...channel.website_settings!,
          allowed_domains: newDomains
        }
      });
      
      toast({
        title: 'Dominio eliminado',
        description: `El dominio "${domain}" ha sido eliminado`
      });
    } catch (error) {
      console.error('Error eliminando dominio:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el dominio',
        variant: 'destructive'
      });
    }
  };

  const handleUpdatePosition = async (position: WidgetPosition) => {
    if (!organizationId || !channel) return;

    try {
      const userId = await getUserId();
      const service = new ChatChannelsService(organizationId);
      const currentConfig = channel.website_settings?.brand_config || {};
      const newConfig = { ...currentConfig, position } as BrandConfig;
      await service.updateBrandConfig(channelId, newConfig, userId);
      
      setChannel({
        ...channel,
        website_settings: {
          ...channel.website_settings!,
          brand_config: newConfig
        }
      });
      
      toast({
        title: 'Posición actualizada',
        description: 'La posición del widget ha sido guardada'
      });
    } catch (error) {
      console.error('Error actualizando posición:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la posición',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleUpdateStyle = async (style: WidgetStyle) => {
    if (!organizationId || !channel) return;

    try {
      const userId = await getUserId();
      const service = new ChatChannelsService(organizationId);
      const currentConfig = channel.website_settings?.brand_config || {};
      const newConfig = { ...currentConfig, style, primary_color: style.primaryColor } as BrandConfig;
      await service.updateBrandConfig(channelId, newConfig, userId);
      
      setChannel({
        ...channel,
        website_settings: {
          ...channel.website_settings!,
          brand_config: newConfig
        }
      });
      
      toast({
        title: 'Estilo actualizado',
        description: 'El estilo del widget ha sido guardado'
      });
    } catch (error) {
      console.error('Error actualizando estilo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estilo',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleUpdateBehavior = async (behavior: WidgetBehavior) => {
    if (!organizationId || !channel) return;

    try {
      const userId = await getUserId();
      const service = new ChatChannelsService(organizationId);
      const currentConfig = channel.website_settings?.brand_config || {};
      const newConfig = { ...currentConfig, behavior } as BrandConfig;
      await service.updateBrandConfig(channelId, newConfig, userId);
      await service.updateWelcomeMessage(channelId, behavior.welcomeMessage, userId);
      
      setChannel({
        ...channel,
        website_settings: {
          ...channel.website_settings!,
          brand_config: newConfig,
          welcome_message: behavior.welcomeMessage
        }
      });
      
      toast({
        title: 'Comportamiento actualizado',
        description: 'El comportamiento del widget ha sido guardado'
      });
    } catch (error) {
      console.error('Error actualizando comportamiento:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el comportamiento',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleUpdateCollectIdentity = async (config: ChannelWebsiteSettings['collect_identity']) => {
    if (!organizationId || !channel) return;

    try {
      const userId = await getUserId();
      const service = new ChatChannelsService(organizationId);
      await service.updateCollectIdentity(channelId, config, userId);
      
      setChannel({
        ...channel,
        website_settings: {
          ...channel.website_settings!,
          collect_identity: config
        }
      });
      
      toast({
        title: 'Configuración actualizada',
        description: 'La recolección de datos ha sido actualizada'
      });
    } catch (error) {
      console.error('Error actualizando collect identity:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la configuración',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleUpdateAIMode = async (mode: AIMode) => {
    if (!organizationId || !channel) return;

    try {
      setIsUpdatingAI(true);
      const userId = await getUserId();
      const service = new ChatChannelsService(organizationId);
      await service.updateAIMode(channelId, mode, userId);
      
      setChannel({ ...channel, ai_mode: mode });
      
      const modeLabels: Record<AIMode, string> = {
        off: 'Desactivado',
        hybrid: 'Híbrido',
        auto: 'Automático'
      };
      
      toast({
        title: 'Modo IA actualizado',
        description: `El modo IA ahora es "${modeLabels[mode]}"`
      });
    } catch (error) {
      console.error('Error actualizando modo IA:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el modo IA',
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingAI(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!channel) {
    return null;
  }

  const defaultBrandConfig: BrandConfig = {
    position: { side: 'right', vertical: 'bottom', offsetX: 20, offsetY: 20 },
    style: {
      primaryColor: '#3B82F6',
      iconColor: '#FFFFFF',
      iconType: 'chat',
      buttonSize: 56,
      borderRadius: 28,
      borderWidth: 0,
      borderColor: '#FFFFFF',
      shadowEnabled: true,
      shadowStrength: 'medium'
    },
    behavior: {
      title: 'Chat',
      welcomeMessage: '¡Hola! ¿En qué podemos ayudarte?',
      openDefaultView: 'chat',
      showQuickActions: false,
      quickActions: [],
      offlineMessage: 'No estamos disponibles. Déjanos tu mensaje.',
      offlineCollectData: true
    },
    primary_color: '#3B82F6'
  };

  const websiteSettings = channel.website_settings || {
    id: '',
    channel_id: channelId,
    allowed_domains: [],
    brand_config: defaultBrandConfig,
    welcome_message: '¡Hola! ¿En qué podemos ayudarte?',
    collect_identity: { name: true, email: true, phone: false },
    created_at: '',
    updated_at: ''
  };

  const brandConfig: BrandConfig = {
    ...defaultBrandConfig,
    ...websiteSettings.brand_config
  };

  const isWebsite = channel.type === 'website';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/app/crm/configuracion/canales')}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    {channel.name}
                  </h1>
                  <Badge variant={channel.status === 'active' ? 'default' : 'secondary'}>
                    {channel.status === 'active' ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Canal de tipo {channel.type}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="status-toggle" className="text-sm text-gray-600 dark:text-gray-400">
                {channel.status === 'active' ? 'Activo' : 'Inactivo'}
              </Label>
              <Switch
                id="status-toggle"
                checked={channel.status === 'active'}
                onCheckedChange={handleToggleStatus}
                disabled={isUpdating}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {isWebsite ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <WidgetCodeSection
                channel={channel}
                onRotateKey={handleRotateKey}
                isRotating={isRotatingKey}
              />

              <AllowedDomainsSection
                domains={websiteSettings.allowed_domains}
                onAddDomain={handleAddDomain}
                onRemoveDomain={handleRemoveDomain}
              />

              <AIModeSection
                aiMode={channel.ai_mode}
                onUpdate={handleUpdateAIMode}
                isUpdating={isUpdatingAI}
              />
            </div>

            <div className="space-y-6">
              <WidgetPositionSection
                position={brandConfig.position}
                onUpdate={handleUpdatePosition}
              />

              <WidgetStyleSection
                style={brandConfig.style}
                onUpdate={handleUpdateStyle}
              />

              <WidgetBehaviorSection
                behavior={brandConfig.behavior}
                onUpdate={handleUpdateBehavior}
              />

              <CollectIdentitySection
                collectIdentity={websiteSettings.collect_identity}
                onUpdate={handleUpdateCollectIdentity}
              />

              <WidgetPreview
                brandConfig={brandConfig}
                welcomeMessage={brandConfig.behavior.welcomeMessage}
                collectIdentity={websiteSettings.collect_identity}
              />
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="credenciales">Credenciales</TabsTrigger>
              <TabsTrigger value="ia">Modo IA</TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle>Información General</CardTitle>
                  <CardDescription>Configuración básica del canal</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nombre del canal</Label>
                    <Input value={channel.name} disabled className="bg-gray-50 dark:bg-gray-800" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de canal</Label>
                    <Input value={channel.type} disabled className="bg-gray-50 dark:bg-gray-800" />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant={channel.status === 'active' ? 'default' : 'secondary'}>
                        {channel.status === 'active' ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="credenciales">
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle>Credenciales</CardTitle>
                  <CardDescription>
                    Configuración de conexión para {channel.type}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500 dark:text-gray-400">
                    Las credenciales de este tipo de canal se configuran desde el proveedor correspondiente.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ia">
              <AIModeSection
                aiMode={channel.ai_mode}
                onUpdate={handleUpdateAIMode}
                isUpdating={isUpdatingAI}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
