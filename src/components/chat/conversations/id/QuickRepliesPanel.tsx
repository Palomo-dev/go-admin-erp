'use client';

import React, { useState } from 'react';
import { Search, Zap, Send, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { QuickReply } from '@/lib/services/conversationDetailService';

interface QuickRepliesPanelProps {
  quickReplies: QuickReply[];
  loading?: boolean;
  onSelectReply: (content: string) => void;
  onUseReply: (replyId: string) => void;
}

export default function QuickRepliesPanel({
  quickReplies,
  loading,
  onSelectReply,
  onUseReply
}: QuickRepliesPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredReplies = searchTerm
    ? quickReplies.filter(
        (reply) =>
          reply.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          reply.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
          reply.shortcut?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          reply.tags?.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : quickReplies;

  const handleUseReply = (reply: QuickReply) => {
    onSelectReply(reply.content);
    onUseReply(reply.id);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          Respuestas Rápidas
          {quickReplies.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {quickReplies.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col">
        {/* Búsqueda */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar respuestas..."
            className="pl-9 h-9"
          />
        </div>

        {/* Lista de respuestas rápidas */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : filteredReplies.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {searchTerm ? 'No se encontraron respuestas' : 'No hay respuestas rápidas'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredReplies.map((reply) => (
                <div
                  key={reply.id}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer group"
                  onClick={() => setExpandedId(expandedId === reply.id ? null : reply.id)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {reply.title}
                        </h4>
                        {reply.shortcut && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            /{reply.shortcut}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Preview del contenido */}
                      <p className={`text-xs text-gray-500 dark:text-gray-400 mt-1 ${
                        expandedId === reply.id ? '' : 'line-clamp-2'
                      }`}>
                        {reply.content}
                      </p>
                    </div>

                    <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${
                      expandedId === reply.id ? 'rotate-90' : ''
                    }`} />
                  </div>

                  {/* Tags */}
                  {reply.tags && reply.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {reply.tags.slice(0, 3).map((tag, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="text-[10px] h-4 px-1.5 bg-gray-100 dark:bg-gray-800"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {reply.tags.length > 3 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 px-1.5 bg-gray-100 dark:bg-gray-800"
                        >
                          +{reply.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Contenido expandido y botón usar */}
                  {expandedId === reply.id && (
                    <div className="mt-3 pt-3 border-t dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Usado {reply.usage_count} veces
                        </span>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseReply(reply);
                          }}
                          className="h-7 bg-blue-600 hover:bg-blue-700"
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Usar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
