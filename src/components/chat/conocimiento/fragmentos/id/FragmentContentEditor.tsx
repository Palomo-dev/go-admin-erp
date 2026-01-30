'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Plus, Tag, FileText, AlignLeft } from 'lucide-react';

interface FragmentContentEditorProps {
  title: string;
  content: string;
  tags: string[];
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onTagsChange: (tags: string[]) => void;
}

export default function FragmentContentEditor({
  title,
  content,
  tags,
  onTitleChange,
  onContentChange,
  onTagsChange
}: FragmentContentEditorProps) {
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      onTagsChange([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Información del Fragmento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-gray-700 dark:text-gray-300">
              Título
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Título del fragmento"
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Etiquetas
            </Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Agregar etiqueta..."
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
              />
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleAddTag}
                className="border-gray-300 dark:border-gray-700"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary"
                    className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-blue-900 dark:hover:text-blue-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlignLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Contenido
            </span>
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              {content.length} caracteres
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="Escribe aquí el contenido del fragmento..."
            rows={16}
            className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 resize-none font-mono text-sm"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Este contenido se utilizará para generar embeddings y responder consultas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
