/**
 * Selector de eventos del catálogo
 */

'use client';

import React, { useState, useEffect, forwardRef } from 'react';
import { Check, ChevronsUpDown, Search, RefreshCw } from 'lucide-react';
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
import { cn } from '@/utils/Utils';

// Services
import eventCatalogService from '@/lib/services/eventCatalogService';

// Types
import type { EventCatalogItem } from '@/types/eventTrigger';

interface EventCatalogSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  disabled?: boolean;
}

export const EventCatalogSelector = forwardRef<HTMLButtonElement, EventCatalogSelectorProps>(
  ({ value, onChange, onBlur, name, disabled }, ref) => {
    const [open, setOpen] = useState(false);
    const [events, setEvents] = useState<EventCatalogItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    // Cargar eventos del catálogo
    useEffect(() => {
      const loadEvents = async () => {
        try {
          setLoading(true);
          const eventsData = await eventCatalogService.getEvents();
          setEvents(eventsData);
        } catch (error) {
          console.error('Error cargando eventos:', error);
        } finally {
          setLoading(false);
        }
      };
      
      loadEvents();
    }, []);

    // Filtrar eventos por búsqueda
    const filteredEvents = events.filter(event => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      return (
        event.code.toLowerCase().includes(searchLower) ||
        event.description.toLowerCase().includes(searchLower) ||
        event.module.toLowerCase().includes(searchLower)
      );
    });

    // Agrupar eventos por módulo
    const eventsByModule = filteredEvents.reduce((acc, event) => {
      const module = event.module;
      if (!acc[module]) {
        acc[module] = [];
      }
      acc[module].push(event);
      return acc;
    }, {} as Record<string, EventCatalogItem[]>);

    // Encontrar evento seleccionado
    const selectedEvent = events.find(event => event.code === value);

    // Configuración de módulos para display
    const getModuleConfig = (module: string) => {
      const configs: Record<string, { label: string; icon: string; color: string }> = {
        finance: { label: 'Finanzas', icon: '💰', color: 'bg-green-100 text-green-800' },
        inventory: { label: 'Inventario', icon: '📦', color: 'bg-blue-100 text-blue-800' },
        pms: { label: 'PMS', icon: '🏨', color: 'bg-purple-100 text-purple-800' },
        users: { label: 'Usuarios', icon: '👥', color: 'bg-orange-100 text-orange-800' },
        crm: { label: 'CRM', icon: '🤝', color: 'bg-pink-100 text-pink-800' },
        pos: { label: 'POS', icon: '🛒', color: 'bg-yellow-100 text-yellow-800' }
      };
      return configs[module] || { label: module, icon: '📋', color: 'bg-gray-100 text-gray-800' };
    };

    const handleSelect = (eventCode: string) => {
      onChange(eventCode);
      setOpen(false);
      onBlur?.();
    };

    const handleRefresh = async () => {
      try {
        setLoading(true);
        const eventsData = await eventCatalogService.getEvents();
        setEvents(eventsData);
      } catch (error) {
        console.error('Error recargando eventos:', error);
      } finally {
        setLoading(false);
      }
    };

    return (
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
            {selectedEvent ? (
              <div className="flex items-center gap-2 w-full">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs", getModuleConfig(selectedEvent.module).color)}
                  >
                    {getModuleConfig(selectedEvent.module).icon} {getModuleConfig(selectedEvent.module).label}
                  </Badge>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="font-medium text-sm truncate w-full">
                      {selectedEvent.code}
                    </span>
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {selectedEvent.description}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">
                {loading ? 'Cargando eventos...' : 'Selecciona un evento...'}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-[500px] p-0" align="start">
          <Command>
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Buscar eventos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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

            {filteredEvents.length === 0 && !loading && (
              <CommandEmpty>
                {search ? 'No se encontraron eventos.' : 'No hay eventos disponibles.'}
              </CommandEmpty>
            )}

            {loading && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                Cargando eventos...
              </div>
            )}

            {!loading && Object.entries(eventsByModule).map(([module, moduleEvents]) => {
              const moduleConfig = getModuleConfig(module);
              
              return (
                <CommandGroup 
                  key={module} 
                  heading={
                    <div className="flex items-center gap-2">
                      <span>{moduleConfig.icon}</span>
                      <span>{moduleConfig.label}</span>
                      <Badge variant="outline" className="ml-auto text-xs">
                        {moduleEvents.length}
                      </Badge>
                    </div>
                  }
                >
                  {moduleEvents.map((event) => (
                    <CommandItem
                      key={event.code}
                      value={event.code}
                      onSelect={() => handleSelect(event.code)}
                      className="flex items-center gap-2 py-2"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === event.code ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{event.code}</span>
                          <Badge variant="outline" className="text-xs">
                            {event.module}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {event.description}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </Command>
        </PopoverContent>
      </Popover>
    );
  }
);

EventCatalogSelector.displayName = 'EventCatalogSelector';

export default EventCatalogSelector;
