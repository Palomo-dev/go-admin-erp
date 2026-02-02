'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import {
  List,
  Edit,
  GitBranch,
  Zap,
  Link2,
} from 'lucide-react';

export type EntityTabType = 'all' | 'changes' | 'status' | 'events' | 'integrations';

interface EntityTimelineTabsProps {
  activeTab: EntityTabType;
  onTabChange: (tab: EntityTabType) => void;
  counts: {
    all: number;
    changes: number;
    status: number;
    events: number;
    integrations: number;
  };
  showIntegrations?: boolean;
}

const TABS = [
  { id: 'all' as const, label: 'Todo', icon: List },
  { id: 'changes' as const, label: 'Cambios', icon: Edit },
  { id: 'status' as const, label: 'Estados', icon: GitBranch },
  { id: 'events' as const, label: 'Eventos', icon: Zap },
  { id: 'integrations' as const, label: 'Integraciones', icon: Link2 },
];

export function EntityTimelineTabs({
  activeTab,
  onTabChange,
  counts,
  showIntegrations = true,
}: EntityTimelineTabsProps) {
  const visibleTabs = showIntegrations ? TABS : TABS.filter(t => t.id !== 'integrations');

  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as EntityTabType)}>
      <TabsList className="grid w-full bg-gray-100 dark:bg-gray-800 p-1 rounded-lg" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)` }}>
        {visibleTabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all',
              'data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-700',
              'data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400'
            )}
          >
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            {counts[tab.id] > 0 && (
              <Badge 
                variant="secondary" 
                className={cn(
                  'ml-1 text-xs px-1.5 py-0',
                  activeTab === tab.id 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                )}
              >
                {counts[tab.id] > 999 ? '999+' : counts[tab.id]}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

// Función helper para filtrar eventos por tab
export function filterEventsByTab(
  events: Array<{ source_category: string; action: string; source_table: string }>,
  tab: EntityTabType
): typeof events {
  switch (tab) {
    case 'all':
      return events;
    case 'changes':
      return events.filter(e => 
        e.source_category === 'audit' && 
        ['create', 'update', 'delete'].includes(e.action)
      );
    case 'status':
      return events.filter(e => 
        e.source_category === 'status_history' ||
        e.action === 'status_change' ||
        e.source_table.includes('status') ||
        e.source_table.includes('history')
      );
    case 'events':
      return events.filter(e => 
        e.source_category === 'domain_event' ||
        e.source_table.includes('_events')
      );
    case 'integrations':
      return events.filter(e => 
        e.source_table === 'integration_events' ||
        e.source_table === 'electronic_invoicing_events' ||
        e.source_table.includes('integration')
      );
    default:
      return events;
  }
}

// Función helper para contar eventos por categoría
export function countEventsByTab(
  events: Array<{ source_category: string; action: string; source_table: string }>
): { all: number; changes: number; status: number; events: number; integrations: number } {
  return {
    all: events.length,
    changes: filterEventsByTab(events, 'changes').length,
    status: filterEventsByTab(events, 'status').length,
    events: filterEventsByTab(events, 'events').length,
    integrations: filterEventsByTab(events, 'integrations').length,
  };
}
