/**
 * Componente para mostrar enlaces contextuales de una notificación
 */

'use client';

import React from 'react';
import { ExternalLink, Link as LinkIcon, User, Building, Package, Calendar, DollarSign, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';

interface NotificationLink {
  name: string;
  url: string;
  description?: string;
}

interface NotificationLinksProps {
  links: NotificationLink[];
}

export function NotificationLinks({ links }: NotificationLinksProps) {
  const getLinkIcon = (name: string, url: string) => {
    const lowerName = name.toLowerCase();
    const lowerUrl = url.toLowerCase();
    
    // Clientes/Usuarios
    if (lowerName.includes('cliente') || lowerName.includes('user') || 
        lowerUrl.includes('/clientes/') || lowerUrl.includes('/users/')) {
      return <User className="h-4 w-4 text-blue-500" />;
    }
    
    // Organizaciones/Empresas
    if (lowerName.includes('organización') || lowerName.includes('empresa') || 
        lowerUrl.includes('/organizacion/') || lowerUrl.includes('/company/')) {
      return <Building className="h-4 w-4 text-purple-500" />;
    }
    
    // Productos/Inventario
    if (lowerName.includes('producto') || lowerName.includes('inventario') || 
        lowerUrl.includes('/inventario/') || lowerUrl.includes('/productos/')) {
      return <Package className="h-4 w-4 text-green-500" />;
    }
    
    // Calendario/Eventos
    if (lowerName.includes('calendario') || lowerName.includes('evento') || 
        lowerUrl.includes('/calendario/') || lowerUrl.includes('/events/')) {
      return <Calendar className="h-4 w-4 text-orange-500" />;
    }
    
    // Finanzas/Pagos
    if (lowerName.includes('pago') || lowerName.includes('factura') || lowerName.includes('finanzas') || 
        lowerUrl.includes('/finanzas/') || lowerUrl.includes('/pagos/')) {
      return <DollarSign className="h-4 w-4 text-yellow-500" />;
    }
    
    // Tareas/CRM
    if (lowerName.includes('tarea') || lowerName.includes('crm') || 
        lowerUrl.includes('/crm/') || lowerUrl.includes('/tareas/')) {
      return <FileText className="h-4 w-4 text-indigo-500" />;
    }
    
    // Enlaces externos
    if (lowerUrl.includes('http://') || lowerUrl.includes('https://')) {
      return <ExternalLink className="h-4 w-4 text-gray-500" />;
    }
    
    return <LinkIcon className="h-4 w-4 text-gray-500" />;
  };

  const getLinkBadge = (name: string, url: string) => {
    const lowerName = name.toLowerCase();
    const lowerUrl = url.toLowerCase();
    
    if (lowerName.includes('cliente') || lowerUrl.includes('/clientes/')) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Cliente</Badge>;
    }
    
    if (lowerName.includes('tarea') || lowerUrl.includes('/crm/tareas/')) {
      return <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">Tarea</Badge>;
    }
    
    if (lowerName.includes('oportunidad') || lowerUrl.includes('/crm/pipeline/')) {
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Oportunidad</Badge>;
    }
    
    if (lowerName.includes('producto') || lowerUrl.includes('/inventario/')) {
      return <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Producto</Badge>;
    }
    
    if (lowerName.includes('pago') || lowerName.includes('factura') || lowerUrl.includes('/finanzas/')) {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Finanzas</Badge>;
    }
    
    if (lowerUrl.includes('http://') || lowerUrl.includes('https://')) {
      return <Badge variant="outline">Externo</Badge>;
    }
    
    return <Badge variant="outline">Enlace</Badge>;
  };

  const handleLinkClick = (link: NotificationLink) => {
    try {
      // Si es un enlace externo, abrir en nueva pestaña
      if (link.url.startsWith('http://') || link.url.startsWith('https://')) {
        window.open(link.url, '_blank', 'noopener,noreferrer');
      } else {
        // Si es un enlace interno, navegar en la misma pestaña
        window.location.href = link.url;
      }
    } catch (error) {
      console.error('Error al abrir enlace:', error);
    }
  };

  const isExternalLink = (url: string) => {
    return url.startsWith('http://') || url.startsWith('https://');
  };

  const formatUrl = (url: string) => {
    if (isExternalLink(url)) {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '');
      } catch {
        return url;
      }
    }
    return url;
  };

  if (!links || links.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          Enlaces Contextuales ({links.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {links.map((link, index) => (
            <div 
              key={index}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {getLinkIcon(link.name, link.url)}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate" title={link.name}>
                      {link.name}
                    </p>
                    {getLinkBadge(link.name, link.url)}
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p className="truncate" title={formatUrl(link.url)}>
                      {formatUrl(link.url)}
                    </p>
                    
                    {link.description && (
                      <p className="text-xs">
                        {link.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="ml-4">
                <Button
                  onClick={() => handleLinkClick(link)}
                  variant="outline"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {isExternalLink(link.url) ? (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir
                    </>
                  ) : (
                    <>
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Ver
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Información adicional */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            💡 Los enlaces internos te llevarán a la sección correspondiente del sistema. 
            Los enlaces externos se abrirán en una nueva pestaña.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
