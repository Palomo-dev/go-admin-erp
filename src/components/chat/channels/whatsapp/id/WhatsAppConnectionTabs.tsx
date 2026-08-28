'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import WhatsAppCredentialsCard from './WhatsAppCredentialsCard';
import WhatsAppQrCard from './WhatsAppQrCard';
import WhatsAppCoexistenceCard from './WhatsAppCoexistenceCard';
import type { WhatsAppCredentials } from '@/lib/services/whatsappChannelService';

interface WhatsAppConnectionTabsProps {
  credentials: WhatsAppCredentials | null;
  onSave: (credentials: WhatsAppCredentials['credentials']) => Promise<void>;
  onValidate: () => Promise<void>;
  isSaving: boolean;
  isValidating: boolean;
  organizationId?: number;
  channelId?: string;
  onEmbeddedSignupComplete?: () => void;
}

export default function WhatsAppConnectionTabs({
  credentials,
  onSave,
  onValidate,
  isSaving,
  isValidating,
  organizationId,
  channelId,
  onEmbeddedSignupComplete,
}: WhatsAppConnectionTabsProps) {
  return (
    <Tabs defaultValue="cloud" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="cloud">Cloud API</TabsTrigger>
        <TabsTrigger value="qr">QR Scan ⚠️</TabsTrigger>
        <TabsTrigger value="coexistence">Coexistence</TabsTrigger>
      </TabsList>

      <TabsContent value="cloud">
        <WhatsAppCredentialsCard
          credentials={credentials}
          onSave={onSave}
          onValidate={onValidate}
          isSaving={isSaving}
          isValidating={isValidating}
          organizationId={organizationId}
          channelId={channelId}
          onEmbeddedSignupComplete={onEmbeddedSignupComplete}
        />
      </TabsContent>

      <TabsContent value="qr">
        {channelId ? (
          <WhatsAppQrCard channelId={channelId} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 p-4">
            Guarda el canal primero para habilitar la conexión por QR.
          </p>
        )}
      </TabsContent>

      <TabsContent value="coexistence">
        <WhatsAppCoexistenceCard />
      </TabsContent>
    </Tabs>
  );
}
