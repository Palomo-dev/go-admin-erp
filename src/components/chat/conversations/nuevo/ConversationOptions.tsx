'use client';

import React from 'react';
import { Tag, User2, AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConversationTag, OrganizationMember } from '@/lib/services/newConversationService';

interface ConversationOptionsProps {
  subject: string;
  onSubjectChange: (value: string) => void;
  initialMessage: string;
  onInitialMessageChange: (value: string) => void;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  onPriorityChange: (value: 'low' | 'normal' | 'high' | 'urgent') => void;
  tags: ConversationTag[];
  selectedTagIds: string[];
  onTagsChange: (ids: string[]) => void;
  members: OrganizationMember[];
  assignedMemberId: number | null;
  onAssignedMemberChange: (id: number | null) => void;
}

const priorityConfig = {
  low: { label: 'Baja', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' }
};

export default function ConversationOptions({
  subject,
  onSubjectChange,
  initialMessage,
  onInitialMessageChange,
  priority,
  onPriorityChange,
  tags,
  selectedTagIds,
  onTagsChange,
  members,
  assignedMemberId,
  onAssignedMemberChange
}: ConversationOptionsProps) {

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      onTagsChange([...selectedTagIds, tagId]);
    }
  };

  const getMemberName = (member: OrganizationMember) => {
    if (member.profile) {
      return `${member.profile.first_name || ''} ${member.profile.last_name || ''}`.trim() || member.profile.email;
    }
    return `Miembro #${member.id}`;
  };

  return (
    <div className="space-y-6">
      {/* Asunto (opcional) */}
      <div className="space-y-2">
        <Label htmlFor="subject">Asunto (opcional)</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Ej: Consulta sobre producto X"
          maxLength={100}
        />
      </div>

      {/* Mensaje inicial */}
      <div className="space-y-2">
        <Label htmlFor="message">
          Mensaje inicial <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="message"
          value={initialMessage}
          onChange={(e) => onInitialMessageChange(e.target.value)}
          placeholder="Escribe el primer mensaje de la conversación..."
          rows={4}
          className="resize-none"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Este mensaje será enviado como mensaje saliente desde el equipo
        </p>
      </div>

      {/* Prioridad */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Prioridad
        </Label>
        <Select value={priority} onValueChange={(v) => onPriorityChange(v as typeof priority)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(priorityConfig).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
                    {config.label}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Etiquetas */}
      {tags.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Etiquetas
          </Label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`transition-all ${
                  selectedTagIds.includes(tag.id)
                    ? 'ring-2 ring-offset-1 ring-blue-500'
                    : 'opacity-60 hover:opacity-100'
                }`}
              >
                <Badge
                  style={{ backgroundColor: tag.color }}
                  className="text-white cursor-pointer"
                >
                  {tag.name}
                </Badge>
              </button>
            ))}
          </div>
          {selectedTagIds.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedTagIds.length} etiqueta(s) seleccionada(s)
            </p>
          )}
        </div>
      )}

      {/* Asignar a */}
      {members.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <User2 className="h-4 w-4" />
            Asignar a
          </Label>
          <Select 
            value={assignedMemberId?.toString() || 'none'} 
            onValueChange={(v) => onAssignedMemberChange(v === 'none' ? null : parseInt(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un agente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-gray-500">Sin asignar (me asigno yo)</span>
              </SelectItem>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id.toString()}>
                  <div className="flex items-center gap-2">
                    {member.profile?.avatar_url ? (
                      <img 
                        src={member.profile.avatar_url} 
                        alt=""
                        className="w-5 h-5 rounded-full"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <User2 className="h-3 w-3 text-gray-500" />
                      </div>
                    )}
                    <span>{getMemberName(member)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
