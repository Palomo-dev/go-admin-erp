'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import ConversationItem from './ConversationItem';
import { Conversation } from '@/lib/services/conversationsService';

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  onConversationClick: (conversation: Conversation) => void;
}

export default function ConversationList({
  conversations,
  loading,
  onConversationClick
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-24 w-24 text-gray-400 mb-4">
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            className="h-full w-full"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No hay conversaciones
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          No se encontraron conversaciones con los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          onClick={onConversationClick}
        />
      ))}
    </div>
  );
}
