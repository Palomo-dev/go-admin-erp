'use client';

import { useState, useEffect } from 'react';
import { Clock, GitBranch, User, Calendar, ChevronRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

import type { NotificationTemplate } from '@/types/eventTrigger';

interface TemplateVersionsProps {
  template: NotificationTemplate;
}

// Mock de versiones históricas (en una implementación real vendría de la BD)
const getMockVersions = (template: NotificationTemplate) => [
  {
    id: `${template.id}-v3`,
    version: 3,
    changes: 'Actualización de variables de cliente',
    created_by: 'Ana García',
    created_at: '2025-01-30T15:30:00.000Z',
    is_current: true,
  },
  {
    id: `${template.id}-v2`,
    version: 2,
    changes: 'Mejora del formato HTML',
    created_by: 'Carlos López',
    created_at: '2025-01-28T10:15:00.000Z',
    is_current: false,
  },
  {
    id: `${template.id}-v1`,
    version: 1,
    changes: 'Versión inicial',
    created_by: 'María Rodríguez',
    created_at: '2025-01-25T09:00:00.000Z',
    is_current: false,
  },
];

export function TemplateVersions({ template }: TemplateVersionsProps) {
  const [versions, setVersions] = useState(getMockVersions(template));
  const [isOpen, setIsOpen] = useState(false);

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('es', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  const handleRestoreVersion = (versionId: string) => {
    console.log('Restaurar versión:', versionId);
    // Aquí implementaríamos la lógica de restauración
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GitBranch className="h-4 w-4 mr-2" />
          Versiones ({versions.length})
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Historial de Versiones: {template.name}
          </DialogTitle>
          <DialogDescription>
            Revisa y restaura versiones anteriores de esta plantilla
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {versions.map((version, index) => (
            <div key={version.id}>
              <Card className={version.is_current ? 'border-primary bg-primary/5' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant={version.is_current ? 'default' : 'outline'}>
                        v{version.version}
                      </Badge>
                      
                      {version.is_current && (
                        <Badge variant="secondary" className="text-xs">
                          Actual
                        </Badge>
                      )}
                      
                      <div className="text-sm font-medium">
                        {version.changes}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      {!version.is_current && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleRestoreVersion(version.id)}
                        >
                          Restaurar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {version.created_by}
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(version.created_at)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Conectores entre versiones */}
              {index < versions.length - 1 && (
                <div className="flex justify-center py-2">
                  <div className="w-px h-4 bg-border"></div>
                </div>
              )}
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {versions.length} versiones • Creada {formatDate(versions[versions.length - 1].created_at)}
          </div>
          
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
