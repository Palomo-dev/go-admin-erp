'use client';

import { useState } from 'react';
import { Phone, Mail, MessageSquare, CheckCircle, XCircle, MoreVertical, Edit, Trash2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/utils/Utils';
import type { ChannelIdentity } from './types';

interface IdentidadesTableProps {
  identities: ChannelIdentity[];
  loading?: boolean;
  onVerify: (id: string) => void;
  onEdit: (identity: ChannelIdentity) => void;
  onDelete: (id: string) => void;
}

const getTypeIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'phone':
      return Phone;
    case 'email':
      return Mail;
    case 'whatsapp_id':
      return MessageSquare;
    default:
      return Phone;
  }
};

const getTypeLabel = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'phone':
      return 'Teléfono';
    case 'email':
      return 'Email';
    case 'whatsapp_id':
      return 'WhatsApp';
    default:
      return type;
  }
};

const getTypeColor = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'phone':
      return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
    case 'email':
      return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
    case 'whatsapp_id':
      return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20';
    default:
      return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
  }
};

export function IdentidadesTable({ 
  identities, 
  loading, 
  onVerify, 
  onEdit, 
  onDelete 
}: IdentidadesTableProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
        <div className="animate-pulse p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (identities.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No se encontraron identidades
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="font-semibold">Tipo</TableHead>
            <TableHead className="font-semibold">Valor</TableHead>
            <TableHead className="font-semibold">Cliente</TableHead>
            <TableHead className="font-semibold">Canal</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold">Última actividad</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {identities.map((identity) => {
            const Icon = getTypeIcon(identity.identity_type);
            const colorClass = getTypeColor(identity.identity_type);

            return (
              <TableRow 
                key={identity.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={cn('p-1.5 rounded-lg', colorClass.split(' ').slice(2).join(' '))}>
                      <Icon className={cn('h-4 w-4', colorClass.split(' ').slice(0, 2).join(' '))} />
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {getTypeLabel(identity.identity_type)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                    {identity.identity_value}
                  </code>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {identity.customer?.full_name || 'Sin nombre'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {identity.customer?.email || identity.customer?.phone || '-'}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  {identity.channel ? (
                    <Badge variant="outline" className="text-xs">
                      {identity.channel.name}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {identity.verified ? (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Verificado
                    </Badge>
                  ) : (
                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      <XCircle className="h-3 w-3 mr-1" />
                      Sin verificar
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {identity.last_seen_at 
                      ? formatDistanceToNow(new Date(identity.last_seen_at), { addSuffix: true, locale: es })
                      : 'Nunca'
                    }
                  </span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!identity.verified && (
                        <DropdownMenuItem onClick={() => onVerify(identity.id)}>
                          <Shield className="h-4 w-4 mr-2" />
                          Verificar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onEdit(identity)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onDelete(identity.id)}
                        className="text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
