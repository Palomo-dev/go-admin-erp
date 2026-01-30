'use client';

import React from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  FileText, 
  Calendar, 
  MessageSquare,
  ExternalLink,
  Tag
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Customer {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  doc_number: string;
}

interface CustomerPanelProps {
  customer: Customer | null;
  conversationCreatedAt?: string;
  messageCount?: number;
  tags?: Array<{ id: string; name: string; color: string }>;
  onViewProfile?: () => void;
}

export default function CustomerPanel({
  customer,
  conversationCreatedAt,
  messageCount = 0,
  tags = [],
  onViewProfile
}: CustomerPanelProps) {
  if (!customer) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-gray-500 dark:text-gray-400">
            No hay datos del cliente
          </p>
        </CardContent>
      </Card>
    );
  }

  const customerName = customer.full_name || 
                       `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
                       'Cliente sin nombre';
  const customerInitials = customerName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card className="h-full overflow-y-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" />
          Información del Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Avatar y nombre */}
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-lg">
              {customerInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {customerName}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ID: {customer.id.slice(0, 8)}...
            </p>
          </div>
        </div>

        <Separator />

        {/* Datos de contacto */}
        <div className="space-y-3">
          {customer.email && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                <Mail className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                <p className="text-sm font-medium truncate">{customer.email}</p>
              </div>
            </div>
          )}

          {customer.phone && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                <Phone className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">Teléfono</p>
                <p className="text-sm font-medium">{customer.phone}</p>
              </div>
            </div>
          )}

          {customer.doc_number && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                <FileText className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">Documento</p>
                <p className="text-sm font-medium">{customer.doc_number}</p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Estadísticas de la conversación */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Iniciada</span>
            </div>
            <p className="text-sm font-medium">
              {conversationCreatedAt ? formatDistanceToNow(new Date(conversationCreatedAt), {
                addSuffix: true,
                locale: es
              }) : '-'}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-4 w-4 text-gray-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Mensajes</span>
            </div>
            <p className="text-sm font-medium">{messageCount}</p>
          </div>
        </div>

        {/* Etiquetas */}
        {tags.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4 text-gray-500" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Etiquetas</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    className="text-xs"
                    style={{
                      borderColor: tag.color,
                      color: tag.color,
                      backgroundColor: `${tag.color}10`
                    }}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Acciones */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onViewProfile}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Ver perfil completo
        </Button>
      </CardContent>
    </Card>
  );
}
