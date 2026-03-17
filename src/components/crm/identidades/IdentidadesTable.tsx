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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300">Tipo</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300">Valor</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">Cliente</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">Canal</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300">Estado</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">Última actividad</TableHead>
            <TableHead className="w-10 sm:w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {identities.map((identity) => {
            const Icon = getTypeIcon(identity.identity_type);
            const colorClass = getTypeColor(identity.identity_type);

            return (
              <TableRow 
                key={identity.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700/50"
              >
                <TableCell className="py-2 sm:py-3">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className={cn('p-1 sm:p-1.5 rounded-lg', colorClass.split(' ').slice(2).join(' '))}>
                      <Icon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', colorClass.split(' ').slice(0, 2).join(' '))} />
                    </div>
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hidden xs:inline">
                      {getTypeLabel(identity.identity_type)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-2 sm:py-3">
                  <code className="text-[10px] sm:text-sm font-mono bg-gray-100 dark:bg-gray-700 px-1.5 sm:px-2 py-0.5 rounded text-gray-800 dark:text-gray-200 truncate max-w-[100px] sm:max-w-none block">
                    {identity.identity_value}
                  </code>
                </TableCell>
                <TableCell className="py-2 sm:py-3 hidden sm:table-cell">
                  <div>
                    <p className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate max-w-[120px]">
                      {identity.customer?.full_name || 'Sin nombre'}
                    </p>
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                      {identity.customer?.email || identity.customer?.phone || '-'}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="py-2 sm:py-3 hidden md:table-cell">
                  {identity.channel ? (
                    <Badge variant="outline" className="text-[10px] sm:text-xs border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400">
                      {identity.channel.name}
                    </Badge>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">-</span>
                  )}
                </TableCell>
                <TableCell className="py-2 sm:py-3">
                  {identity.verified ? (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] sm:text-xs">
                      <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                      <span className="hidden xs:inline">Verificado</span>
                      <span className="xs:hidden">✓</span>
                    </Badge>
                  ) : (
                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] sm:text-xs">
                      <XCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                      <span className="hidden xs:inline">Sin verificar</span>
                      <span className="xs:hidden">✗</span>
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="py-2 sm:py-3 hidden lg:table-cell">
                  <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {identity.last_seen_at 
                      ? formatDistanceToNow(new Date(identity.last_seen_at), { addSuffix: true, locale: es })
                      : 'Nunca'
                    }
                  </span>
                </TableCell>
                <TableCell className="py-2 sm:py-3">
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
    </div>
  );
}
