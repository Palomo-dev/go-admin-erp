'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Eye, Edit, Trash2, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

import { TemplateEditor } from './TemplateEditor';
import { TemplatePreview } from './TemplatePreview';
import { TemplateStats } from './TemplateStats';
import { TemplateVersions } from './TemplateVersions';
import { TemplateImportExport } from './TemplateImportExport';
import { getTemplates, deleteTemplate, getChannelConfigs } from '@/lib/services/templateService';
import type { NotificationTemplate, NotificationChannel } from '@/types/eventTrigger';

export function TemplateManager() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  
  // Modal states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplate | null>(null);
  
  const { toast } = useToast();
  const channelConfigs = getChannelConfigs();

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    filterTemplates();
  }, [templates, searchTerm, selectedChannel]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las plantillas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterTemplates = () => {
    let filtered = [...templates];

    // Filtrar por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        template =>
          template.name.toLowerCase().includes(term) ||
          template.subject?.toLowerCase().includes(term) ||
          template.body_text.toLowerCase().includes(term)
      );
    }

    // Filtrar por canal
    if (selectedChannel && selectedChannel !== 'all') {
      filtered = filtered.filter(template => template.channel === selectedChannel);
    }

    setFilteredTemplates(filtered);
  };

  const handleCreateNew = () => {
    setEditingTemplate(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    setIsEditorOpen(true);
  };

  const handlePreview = (template: NotificationTemplate) => {
    setPreviewTemplate(template);
    setIsPreviewOpen(true);
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta plantilla?')) return;

    try {
      await deleteTemplate(templateId);
      toast({
        title: 'Éxito',
        description: 'Plantilla eliminada correctamente',
      });
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la plantilla',
        variant: 'destructive',
      });
    }
  };

  const handleTemplateSaved = () => {
    setIsEditorOpen(false);
    setEditingTemplate(null);
    loadTemplates();
  };

  const getChannelIcon = (channel: NotificationChannel) => {
    const icons = {
      email: '✉️',
      whatsapp: '💬',
      sms: '📱',
      push: '🔔',
      webhook: '🔗'
    };
    return icons[channel] || '📝';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Estadísticas */}
      <TemplateStats />
      {/* Header con botones de acción */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button onClick={handleCreateNew} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nueva Plantilla
          </Button>
          
          <div className="text-sm text-muted-foreground">
            {filteredTemplates.length} de {templates.length} plantillas
          </div>
        </div>

        <TemplateImportExport onImportComplete={loadTemplates} />
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar plantillas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="sm:w-48">
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los canales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los canales</SelectItem>
                  {Object.entries(channelConfigs).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de plantillas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <Card key={template.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="text-lg">
                    {getChannelIcon(template.channel)}
                  </span>
                  {template.name}
                </CardTitle>
                
                <Badge variant="secondary" className={channelConfigs[template.channel]?.color || ''}>
                  {channelConfigs[template.channel]?.label}
                </Badge>
              </div>
              
              {template.subject && (
                <CardDescription className="font-medium">
                  {template.subject}
                </CardDescription>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {template.body_text}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Variables:</p>
                <div className="flex flex-wrap gap-1">
                  {template.variables.slice(0, 4).map((variable) => (
                    <Badge key={variable} variant="outline" className="text-xs">
                      {`{${variable}}`}
                    </Badge>
                  ))}
                  {template.variables.length > 4 && (
                    <Badge variant="outline" className="text-xs">
                      +{template.variables.length - 4} más
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-xs text-muted-foreground">
                  v{template.version}
                </div>
                
                <div className="flex items-center gap-1">
                  <TemplateVersions template={template} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreview(template)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(template)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(template.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mensaje cuando no hay resultados */}
      {filteredTemplates.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="text-lg font-semibold mb-2">No hay plantillas</h3>
            <p className="text-muted-foreground text-center mb-4">
              {templates.length === 0
                ? 'Aún no has creado ninguna plantilla. ¡Crea tu primera plantilla!'
                : 'No se encontraron plantillas con los filtros aplicados.'}
            </p>
            {templates.length === 0 && (
              <Button onClick={handleCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                Crear Primera Plantilla
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modales */}
      {isEditorOpen && (
        <TemplateEditor
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          template={editingTemplate}
          onSave={handleTemplateSaved}
        />
      )}

      {isPreviewOpen && previewTemplate && (
        <TemplatePreview
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          template={previewTemplate}
        />
      )}
    </div>
  );
}
