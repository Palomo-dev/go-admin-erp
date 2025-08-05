/**
 * Selector de plantillas de notificación
 */

'use client';

import React, { useState, useEffect, forwardRef } from 'react';
import { Check, ChevronsUpDown, Eye, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/Utils';

// Services
import templateService from '@/lib/services/templateService';

// Types
import type { NotificationTemplate, NotificationChannel } from '@/types/eventTrigger';

interface TemplateSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  disabled?: boolean;
  channels?: NotificationChannel[];
}

export const TemplateSelector = forwardRef<HTMLButtonElement, TemplateSelectorProps>(
  ({ value, onChange, onBlur, name, disabled, channels = [] }, ref) => {
    const [open, setOpen] = useState(false);
    const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplate | null>(null);

    // Cargar plantillas
    useEffect(() => {
      const loadTemplates = async () => {
        try {
          setLoading(true);
          const templatesData = await templateService.getTemplates();
          setTemplates(templatesData);
        } catch (error) {
          console.error('Error cargando plantillas:', error);
        } finally {
          setLoading(false);
        }
      };
      
      loadTemplates();
    }, []);

    // Filtrar plantillas por canales seleccionados
    const filteredTemplates = templates.filter(template => {
      if (channels.length === 0) return true;
      return channels.includes(template.channel);
    });

    // Agrupar plantillas por canal
    const templatesByChannel = filteredTemplates.reduce((acc, template) => {
      const channel = template.channel;
      if (!acc[channel]) {
        acc[channel] = [];
      }
      acc[channel].push(template);
      return acc;
    }, {} as Record<string, NotificationTemplate[]>);

    // Encontrar plantilla seleccionada
    const selectedTemplate = templates.find(template => template.id === value);

    // Configuración de canales para display
    const getChannelConfig = (channel: NotificationChannel) => {
      const configs = {
        email: { label: 'Email', icon: '📧', color: 'bg-blue-100 text-blue-800' },
        whatsapp: { label: 'WhatsApp', icon: '📱', color: 'bg-green-100 text-green-800' },
        webhook: { label: 'Webhook', icon: '🔗', color: 'bg-purple-100 text-purple-800' },
        push: { label: 'Push', icon: '🔔', color: 'bg-orange-100 text-orange-800' },
        sms: { label: 'SMS', icon: '💬', color: 'bg-yellow-100 text-yellow-800' }
      };
      return configs[channel] || { label: channel, icon: '📋', color: 'bg-gray-100 text-gray-800' };
    };

    const handleSelect = (templateId: string) => {
      onChange(templateId);
      setOpen(false);
      onBlur?.();
    };

    const handleClear = () => {
      onChange('');
      setOpen(false);
      onBlur?.();
    };

    const handleRefresh = async () => {
      try {
        setLoading(true);
        const templatesData = await templateService.getTemplates();
        setTemplates(templatesData);
      } catch (error) {
        console.error('Error recargando plantillas:', error);
      } finally {
        setLoading(false);
      }
    };

    // Render preview dialog
    const renderPreviewDialog = () => {
      if (!previewTemplate) return null;

      return (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>{getChannelConfig(previewTemplate.channel).icon}</span>
                Vista previa: {previewTemplate.name}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Información de la plantilla */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Información</CardTitle>
                    <Badge variant="outline" className={getChannelConfig(previewTemplate.channel).color}>
                      {getChannelConfig(previewTemplate.channel).label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Nombre:</span> {previewTemplate.name}
                    </div>
                    <div>
                      <span className="font-medium">Canal:</span> {previewTemplate.channel}
                    </div>
                    <div>
                      <span className="font-medium">Versión:</span> {previewTemplate.version}
                    </div>
                    <div>
                      <span className="font-medium">Variables:</span> {previewTemplate.variables?.length || 0}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Asunto (email) */}
              {previewTemplate.channel === 'email' && previewTemplate.subject && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Asunto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-3 bg-gray-50 rounded-md font-mono text-sm">
                      {previewTemplate.subject}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Contenido HTML */}
              {previewTemplate.body_html && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Contenido HTML</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-3 bg-gray-50 rounded-md font-mono text-sm max-h-40 overflow-y-auto">
                      {previewTemplate.body_html}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Contenido texto */}
              {previewTemplate.body_text && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Contenido Texto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-3 bg-gray-50 rounded-md font-mono text-sm max-h-40 overflow-y-auto">
                      {previewTemplate.body_text}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Variables */}
              {previewTemplate.variables && previewTemplate.variables.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Variables Disponibles</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      {previewTemplate.variables.map((variable, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {variable}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </DialogContent>
        </Dialog>
      );
    };

    return (
      <>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              ref={ref}
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between h-auto min-h-[40px] px-3 py-2"
              disabled={disabled || loading}
              name={name}
            >
              {selectedTemplate ? (
                <div className="flex items-center gap-2 w-full">
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs", getChannelConfig(selectedTemplate.channel).color)}
                  >
                    {getChannelConfig(selectedTemplate.channel).icon} 
                    {getChannelConfig(selectedTemplate.channel).label}
                  </Badge>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="font-medium text-sm truncate w-full">
                      {selectedTemplate.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      v{selectedTemplate.version}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">
                  {loading ? 'Cargando plantillas...' : 'Selecciona una plantilla (opcional)...'}
                </span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command>
              <div className="flex items-center border-b px-3">
                <CommandInput placeholder="Buscar plantillas..." />
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2"
                  onClick={handleRefresh}
                  disabled={loading}
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                </Button>
              </div>

              {/* Opción ninguna */}
              <CommandGroup>
                <CommandItem
                  value="__none__"
                  onSelect={handleClear}
                  className="flex items-center gap-2 py-2"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="italic text-muted-foreground">Sin plantilla</span>
                </CommandItem>
              </CommandGroup>

              {filteredTemplates.length === 0 && !loading && (
                <CommandEmpty>
                  {channels.length > 0 
                    ? 'No hay plantillas para los canales seleccionados.' 
                    : 'No hay plantillas disponibles.'
                  }
                </CommandEmpty>
              )}

              {loading && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                  Cargando plantillas...
                </div>
              )}

              {!loading && Object.entries(templatesByChannel).map(([channel, channelTemplates]) => {
                const channelConfig = getChannelConfig(channel as NotificationChannel);
                
                return (
                  <CommandGroup 
                    key={channel} 
                    heading={
                      <div className="flex items-center gap-2">
                        <span>{channelConfig.icon}</span>
                        <span>{channelConfig.label}</span>
                        <Badge variant="outline" className="ml-auto text-xs">
                          {channelTemplates.length}
                        </Badge>
                      </div>
                    }
                  >
                    {channelTemplates.map((template) => (
                      <CommandItem
                        key={template.id}
                        value={template.id}
                        onSelect={() => handleSelect(template.id)}
                        className="flex items-center gap-2 py-2"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === template.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm truncate">
                              {template.name}
                            </span>
                            <div className="flex items-center gap-1 ml-2">
                              <Badge variant="outline" className="text-xs">
                                v{template.version}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setPreviewTemplate(template);
                                }}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {template.variables && template.variables.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {template.variables.length} variable{template.variables.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </Command>
          </PopoverContent>
        </Popover>

        {/* Dialogo de preview */}
        {renderPreviewDialog()}
      </>
    );
  }
);

TemplateSelector.displayName = 'TemplateSelector';

export default TemplateSelector;
