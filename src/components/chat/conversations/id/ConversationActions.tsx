'use client';

import React, { useState } from 'react';
import { 
  Tag, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  X, 
  Plus,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ConversationDetail } from '@/lib/services/conversationDetailService';

interface ConversationActionsProps {
  conversation: ConversationDetail | null;
  availableTags: Array<{ id: string; name: string; color: string }>;
  members: Array<{ id: number; user_id: string }>;
  onStatusChange: (status: string) => Promise<void>;
  onPriorityChange: (priority: string) => Promise<void>;
  onAssign: (memberId: number | null) => Promise<void>;
  onAddTag: (tagId: string) => Promise<void>;
  onRemoveTag: (tagId: string) => Promise<void>;
  loading?: boolean;
}

export default function ConversationActions({
  conversation,
  availableTags,
  members,
  onStatusChange,
  onPriorityChange,
  onAssign,
  onAddTag,
  onRemoveTag,
  loading
}: ConversationActionsProps) {
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleStatusChange = async (status: string) => {
    try {
      setIsUpdating('status');
      await onStatusChange(status);
    } finally {
      setIsUpdating(null);
    }
  };

  const handlePriorityChange = async (priority: string) => {
    try {
      setIsUpdating('priority');
      await onPriorityChange(priority);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleAssign = async (memberId: string) => {
    try {
      setIsUpdating('assign');
      await onAssign(memberId === 'none' ? null : parseInt(memberId));
    } finally {
      setIsUpdating(null);
    }
  };

  const handleAddTag = async (tagId: string) => {
    try {
      setIsUpdating(`tag-${tagId}`);
      await onAddTag(tagId);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    try {
      setIsUpdating(`tag-${tagId}`);
      await onRemoveTag(tagId);
    } finally {
      setIsUpdating(null);
    }
  };

  if (!conversation) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </CardContent>
      </Card>
    );
  }

  const currentTags = conversation.tags || [];
  const availableToAdd = availableTags.filter(
    (tag) => !currentTags.some((t) => t.id === tag.id)
  );

  return (
    <Card className="h-full overflow-y-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Acciones</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Estado */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Estado
          </label>
          <Select
            value={conversation.status}
            onValueChange={handleStatusChange}
            disabled={isUpdating === 'status' || loading}
          >
            <SelectTrigger className="w-full">
              {isUpdating === 'status' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Abierta
                </div>
              </SelectItem>
              <SelectItem value="pending">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500" />
                  Pendiente
                </div>
              </SelectItem>
              <SelectItem value="closed">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-gray-500" />
                  Cerrada
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Prioridad */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Prioridad
          </label>
          <Select
            value={conversation.priority}
            onValueChange={handlePriorityChange}
            disabled={isUpdating === 'priority' || loading}
          >
            <SelectTrigger className="w-full">
              {isUpdating === 'priority' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-gray-400" />
                  Baja
                </div>
              </SelectItem>
              <SelectItem value="normal">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  Normal
                </div>
              </SelectItem>
              <SelectItem value="high">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  Alta
                </div>
              </SelectItem>
              <SelectItem value="urgent">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Urgente
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Asignación */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Asignado a
          </label>
          <Select
            value={conversation.assigned_member_id?.toString() || 'none'}
            onValueChange={handleAssign}
            disabled={isUpdating === 'assign' || loading}
          >
            <SelectTrigger className="w-full">
              {isUpdating === 'assign' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SelectValue placeholder="Sin asignar" />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  Sin asignar
                </div>
              </SelectItem>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id.toString()}>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-blue-500" />
                    Agente #{member.id}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Etiquetas */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Etiquetas
            </label>
            {availableToAdd.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2">
                    <Plus className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="end">
                  <div className="space-y-1">
                    {availableToAdd.map((tag) => (
                      <Button
                        key={tag.id}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => handleAddTag(tag.id)}
                        disabled={isUpdating === `tag-${tag.id}`}
                      >
                        {isUpdating === `tag-${tag.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-2" />
                        ) : (
                          <div
                            className="h-3 w-3 rounded-full mr-2"
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        {tag.name}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {currentTags.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sin etiquetas
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {currentTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="pl-2 pr-1 py-1 flex items-center gap-1"
                  style={{
                    borderColor: tag.color,
                    color: tag.color,
                    backgroundColor: `${tag.color}10`
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => handleRemoveTag(tag.id)}
                    disabled={isUpdating === `tag-${tag.id}`}
                    className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                  >
                    {isUpdating === `tag-${tag.id}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Acciones rápidas */}
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
            onClick={() => handleStatusChange('closed')}
            disabled={conversation.status === 'closed' || loading}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Marcar como resuelta
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
