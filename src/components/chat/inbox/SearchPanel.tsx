'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { Conversation } from '@/lib/services/conversationsService';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface SearchResult {
  id: string;
  content: string;
  created_at: string;
  direction: 'inbound' | 'outbound';
  role: 'customer' | 'agent' | 'ai';
  highlightedContent?: string;
}

interface SearchPanelProps {
  conversation: Conversation | null;
  onScrollToMessage?: (messageId: string) => void;
}

export default function SearchPanel({
  conversation,
  onScrollToMessage
}: SearchPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const highlightText = (text: string, query: string): string => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-900 rounded px-0.5">$1</mark>');
  };

  const searchMessages = useCallback(async (query: string) => {
    if (!conversation || !query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at, direction, role')
        .eq('conversation_id', conversation.id)
        .ilike('content', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const resultsWithHighlight = (data || []).map(msg => ({
        ...msg,
        highlightedContent: highlightText(msg.content, query)
      }));

      setResults(resultsWithHighlight);
      setCurrentIndex(0);
    } catch (error) {
      console.error('Error buscando mensajes:', error);
    } finally {
      setLoading(false);
    }
  }, [conversation]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (searchTerm.length >= 2) {
      debounceRef.current = setTimeout(() => {
        searchMessages(searchTerm);
      }, 300);
    } else {
      setResults([]);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchTerm, searchMessages]);

  const handlePrevious = () => {
    if (results.length === 0) return;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1;
    setCurrentIndex(newIndex);
    onScrollToMessage?.(results[newIndex].id);
  };

  const handleNext = () => {
    if (results.length === 0) return;
    const newIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(newIndex);
    onScrollToMessage?.(results[newIndex].id);
  };

  const handleResultClick = (result: SearchResult, index: number) => {
    setCurrentIndex(index);
    onScrollToMessage?.(result.id);
  };

  const formatTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'agent': return 'Agente';
      case 'customer': return 'Cliente';
      case 'ai': return 'IA';
      default: return role;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'agent': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'customer': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
      case 'ai': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Barra de búsqueda */}
      <div className="p-4 space-y-4 border-b dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            ref={inputRef}
            placeholder="Buscar mensajes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-20"
          />
          {searchTerm && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : results.length > 0 ? (
                <span className="text-xs text-gray-500">
                  {currentIndex + 1}/{results.length}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setSearchTerm('')}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Navegación de resultados */}
        {results.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {results.length} resultado{results.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handlePrevious}
                disabled={results.length === 0}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleNext}
                disabled={results.length === 0}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Lista de resultados */}
      <div className="flex-1 overflow-y-auto p-4">
        {searchTerm.length < 2 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-12 w-12 text-gray-300 dark:text-gray-700 mb-4" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Escribe al menos 2 caracteres para buscar
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : results.length === 0 && searchTerm.length >= 2 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-12 w-12 text-gray-300 dark:text-gray-700 mb-4" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No se encontraron resultados para &ldquo;{searchTerm}&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((result, index) => (
              <div
                key={result.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  index === currentIndex
                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                }`}
                onClick={() => handleResultClick(result, index)}
              >
                <div className="flex items-center justify-between mb-1">
                  <Badge className={`text-[10px] ${getRoleBadgeColor(result.role)}`}>
                    {getRoleLabel(result.role)}
                  </Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(result.created_at)}
                  </span>
                </div>
                <p 
                  className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: result.highlightedContent || result.content }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Atajos de teclado */}
      <div className="p-4 border-t dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">↓</kbd>
            navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">Enter</kbd>
            ir al mensaje
          </span>
        </div>
      </div>
    </div>
  );
}
