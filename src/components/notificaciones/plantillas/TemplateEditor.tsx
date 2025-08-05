'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Save, Eye, Code, Type, Bold, Italic, Underline, Link, Image, List, ListOrdered, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Separator } from '@/components/ui/separator';

import { createTemplate, updateTemplate, getChannelConfigs } from '@/lib/services/templateService';
import { getProductImagesFromTemplate, getPublicImageUrl } from '@/lib/services/productImageService';
import type { NotificationTemplate, NotificationChannel, CreateTemplateData, UpdateTemplateData } from '@/types/eventTrigger';

interface TemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  template?: NotificationTemplate | null;
  onSave: () => void;
}

// Variables comunes disponibles
const AVAILABLE_VARIABLES = [
  { key: 'customer_name', label: 'Nombre del Cliente', category: 'cliente' },
  { key: 'customer_email', label: 'Email del Cliente', category: 'cliente' },
  { key: 'customer_phone', label: 'Teléfono del Cliente', category: 'cliente' },
  { key: 'invoice_id', label: 'ID de Factura', category: 'facturacion' },
  { key: 'invoice_number', label: 'Número de Factura', category: 'facturacion' },
  { key: 'total', label: 'Total', category: 'facturacion' },
  { key: 'amount', label: 'Monto', category: 'facturacion' },
  { key: 'currency', label: 'Moneda', category: 'facturacion' },
  { key: 'due_date', label: 'Fecha de Vencimiento', category: 'facturacion' },
  { key: 'product_name', label: 'Nombre del Producto', category: 'producto' },
  { key: 'product_sku', label: 'SKU del Producto', category: 'producto' },
  { key: 'quantity', label: 'Cantidad', category: 'producto' },
  { key: 'order_id', label: 'ID del Pedido', category: 'pedido' },
  { key: 'order_date', label: 'Fecha del Pedido', category: 'pedido' },
  { key: 'delivery_date', label: 'Fecha de Entrega', category: 'pedido' },
  { key: 'company_name', label: 'Nombre de la Empresa', category: 'empresa' },
  { key: 'company_logo', label: 'Logo de la Empresa', category: 'imagen' },
  { key: 'support_email', label: 'Email de Soporte', category: 'empresa' },
  { key: 'website_url', label: 'URL del Sitio Web', category: 'empresa' },
  // Variables de imagen
  { key: 'product_image', label: 'Imagen del Producto', category: 'imagen' },
  { key: 'product_gallery', label: 'Galería del Producto', category: 'imagen' },
  { key: 'organization_logo', label: 'Logo de la Organización', category: 'imagen' },
  { key: 'organization_banner', label: 'Banner de la Organización', category: 'imagen' },
  { key: 'custom_image_1', label: 'Imagen Personalizada 1', category: 'imagen' },
  { key: 'custom_image_2', label: 'Imagen Personalizada 2', category: 'imagen' },
  { key: 'custom_image_3', label: 'Imagen Personalizada 3', category: 'imagen' },
  { key: 'qr_code', label: 'Código QR', category: 'imagen' },
  { key: 'signature_image', label: 'Imagen de Firma', category: 'imagen' },
];

export function TemplateEditor({ isOpen, onClose, template, onSave }: TemplateEditorProps) {
  const [formData, setFormData] = useState<{
    channel: NotificationChannel;
    name: string;
    subject: string;
    body_text: string;
    body_html: string;
    variables: string[];
    images: Record<string, string>; // key: variable_name, value: image_url
  }>({
    channel: 'email',
    name: '',
    subject: '',
    body_text: '',
    body_html: '',
    variables: [],
    images: {},
  });

  const [activeTab, setActiveTab] = useState<'visual' | 'html' | 'text'>('visual');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isVariablesModalOpen, setIsVariablesModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { toast } = useToast();
  const channelConfigs = getChannelConfigs();

  useEffect(() => {
    if (template) {
      setFormData({
        channel: template.channel,
        name: template.name,
        subject: template.subject || '',
        body_text: template.body_text,
        body_html: template.body_html || '',
        variables: template.variables,
        images: (template as any).images || {},
      });
    } else {
      // Reset form for new template
      setFormData({
        channel: 'email',
        name: '',
        subject: '',
        body_text: '',
        body_html: '',
        variables: [],
        images: {},
      });
    }
  }, [template]);

  const handleChannelChange = (channel: NotificationChannel) => {
    setFormData(prev => ({ ...prev, channel }));
    
    // Cambiar a tab apropiado según el canal
    if (channel === 'email') {
      setActiveTab('visual');
    } else {
      setActiveTab('text');
    }
  };

  const insertVariable = (variableKey: string) => {
    const variable = `{${variableKey}}`;
    const currentVariables = new Set(formData.variables);
    currentVariables.add(variableKey);
    
    // Insertar siempre en el campo de contenido principal
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = formData.body_text;
      const newText = currentText.substring(0, start) + variable + currentText.substring(end);
      
      setFormData(prev => ({
        ...prev,
        body_text: newText,
        variables: Array.from(currentVariables)
      }));
      
      // Restaurar posición del cursor después de la variable insertada
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + variable.length;
        textarea.focus();
      }, 0);
    }
  };

  // Función para manejar la subida de imágenes
  const handleImageUpload = (variableKey: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        setFormData(prev => ({
          ...prev,
          images: {
            ...prev.images,
            [variableKey]: imageUrl
          }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Función para eliminar una imagen
  const removeImage = (variableKey: string) => {
    setFormData(prev => {
      const newImages = { ...prev.images };
      delete newImages[variableKey];
      return {
        ...prev,
        images: newImages
      };
    });
  };

  // Obtener variables de imagen
  const getImageVariables = () => {
    return AVAILABLE_VARIABLES.filter(variable => variable.category === 'imagen');
  };

  // Auto-detectar imágenes de productos basándose en variables del contenido
  const autoDetectProductImages = async () => {
    try {
      // Extraer variables del contenido actual
      const content = formData.body_text;
      const productNameMatch = content.match(/\{product_name\}/g);
      const productSkuMatch = content.match(/\{product_sku\}/g);
      
      if (!productNameMatch && !productSkuMatch) {
        toast({
          title: 'Sin variables de producto',
          description: 'Agrega {product_name} o {product_sku} en tu contenido para auto-detectar imágenes.',
          variant: 'destructive'
        });
        return;
      }

      // Mostrar loading
      toast({
        title: 'Buscando imágenes...',
        description: 'Detectando automáticamente imágenes de productos.',
      });

      // Buscar datos de productos en la base de datos
      // Primero intentamos con SKUs conocidos en el sistema
      const knownSkus = ['SKU05543324324234', 'SKU05543121', 'SKU0554312', 'BEB-00155', 'SKU11111'];
      const knownNames = ['Audifonos', 'Tenis X', 'Tenis Samba', 'Tenis Adidas', 'Camiseta Polo Amarni Exchange'];
      
      let productImages: Record<string, string> = {};
      
      // Intentar con diferentes valores conocidos
      for (const sku of knownSkus) {
        const mockVariables = {
          product_sku: sku,
          product_name: 'Software de Gestión'
        };
        
        const images = await getProductImagesFromTemplate(mockVariables);
        if (Object.keys(images).length > 0) {
          productImages = images;
          break;
        }
      }
      
      // Si no encontró por SKU, intentar por nombres
      if (Object.keys(productImages).length === 0) {
        for (const name of knownNames) {
          const mockVariables = {
            product_name: name,
            product_sku: ''
          };
          
          const images = await getProductImagesFromTemplate(mockVariables);
          if (Object.keys(images).length > 0) {
            productImages = images;
            break;
          }
        }
      }
      
      if (Object.keys(productImages).length > 0) {
        // Convertir paths a URLs públicas
        const publicImages: Record<string, string> = {};
        for (const [key, path] of Object.entries(productImages)) {
          publicImages[key] = getPublicImageUrl(path);
        }
        
        setFormData(prev => ({
          ...prev,
          images: {
            ...prev.images,
            ...publicImages
          }
        }));

        toast({
          title: '✅ Imágenes detectadas',
          description: `Se encontraron ${Object.keys(productImages).length} imagen(es) de producto automáticamente.`,
        });
      } else {
        toast({
          title: 'Sin imágenes encontradas',
          description: 'No se encontraron productos con imágenes en la base de datos. Puedes subir imágenes manualmente.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error auto-detecting product images:', error);
      toast({
        title: 'Error',
        description: 'Hubo un error al buscar imágenes de productos.',
        variant: 'destructive'
      });
    }
  };

  const formatText = (command: string, value?: string) => {
    if (activeTab === 'html') {
      const textarea = htmlTextareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        
        let replacement = '';
        switch (command) {
          case 'bold':
            replacement = `<strong>${selectedText}</strong>`;
            break;
          case 'italic':
            replacement = `<em>${selectedText}</em>`;
            break;
          case 'underline':
            replacement = `<u>${selectedText}</u>`;
            break;
          case 'link':
            replacement = `<a href="${value || '#'}">${selectedText || 'enlace'}</a>`;
            break;
          default:
            replacement = selectedText;
        }
        
        const newText = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
        setFormData(prev => ({ ...prev, body_html: newText }));
        
        setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = start;
          textarea.selectionEnd = start + replacement.length;
        }, 0);
      }
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'El nombre de la plantilla es requerido',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.body_text.trim() && !formData.body_html.trim()) {
      toast({
        title: 'Error',
        description: 'El contenido de la plantilla es requerido',
        variant: 'destructive',
      });
      return;
    }

    if (formData.channel === 'email' && !formData.subject.trim()) {
      toast({
        title: 'Error',
        description: 'El asunto es requerido para plantillas de email',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      
      const templateData = {
        channel: formData.channel,
        name: formData.name,
        subject: formData.channel === 'email' ? formData.subject : undefined,
        body_html: formData.body_html || undefined,
        body_text: formData.body_text,
        variables: formData.variables,
        images: formData.images,
      };

      if (template) {
        await updateTemplate(template.id, templateData as UpdateTemplateData);
        toast({
          title: 'Éxito',
          description: 'Plantilla actualizada correctamente',
        });
      } else {
        await createTemplate(templateData as CreateTemplateData);
        toast({
          title: 'Éxito',
          description: 'Plantilla creada correctamente',
        });
      }

      onSave();
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la plantilla',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getVariablesByCategory = () => {
    const categories: Record<string, typeof AVAILABLE_VARIABLES> = {};
    
    AVAILABLE_VARIABLES.forEach(variable => {
      if (!categories[variable.category]) {
        categories[variable.category] = [];
      }
      categories[variable.category].push(variable);
    });
    
    return categories;
  };

  // Obtener variables por defecto según el canal
  const getDefaultVariables = (channel: NotificationChannel): string[] => {
    const channelVariables = {
      email: ['customer_name', 'invoice_id', 'amount', 'currency', 'organization_logo', 'product_image'],
      whatsapp: ['customer_name', 'product_name', 'product_image', 'organization_logo'],
      webhook: ['user_id', 'email', 'name', 'timestamp'],
      push: ['user_name', 'notification_title', 'message', 'organization_logo'],
      sms: ['customer_name', 'code', 'expiration_time'],
    };
    return channelVariables[channel] || ['customer_name', 'company_name'];
  };

  // Obtener texto descriptivo del canal
  const getChannelPreviewText = (channel: NotificationChannel): string => {
    const descriptions = {
      email: 'Se enviará como correo electrónico con asunto y contenido HTML.',
      whatsapp: 'Se enviará como mensaje de WhatsApp Business.',
      webhook: 'Se enviará como JSON a la URL del webhook configurada.',
      push: 'Se enviará como notificación push a dispositivos móviles.',
      sms: 'Se enviará como mensaje de texto SMS.',
    };
    return descriptions[channel] || 'Canal de notificación personalizado.';
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {template ? 'Editar Plantilla' : 'Crear Nueva Plantilla'}
          </DialogTitle>
          <DialogDescription>
            Crea una nueva plantilla de notificación personalizada
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Canal de Notificación */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Canal de Notificación</Label>
            <div className="flex gap-2">
              {Object.entries(channelConfigs).map(([key, config]) => {
                const isSelected = formData.channel === key;
                return (
                  <Button
                    key={key}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleChannelChange(key as NotificationChannel)}
                    className={`flex items-center gap-2 ${isSelected ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    <span className="text-sm">{config.icon || '📝'}</span>
                    {config.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Nombre de la Plantilla */}
          <div>
            <Label htmlFor="name" className="text-sm font-medium">Nombre de la Plantilla</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ej: Confirmación de Pedido"
              className="mt-1"
            />
          </div>

          {/* Asunto del Email (solo para email) */}
          {formData.channel === 'email' && (
            <div>
              <Label htmlFor="subject" className="text-sm font-medium">Asunto del Email</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Ej: ¡Gracias por tu pedido {order_id}!"
                className="mt-1"
              />
            </div>
          )}

          {/* Campo de Contenido */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content" className="text-sm font-medium">Contenido</Label>
              <div className="text-xs text-muted-foreground">
                Usa {'{nombre_variable}'} para insertar variables
              </div>
            </div>
            <div className="relative">
              <Textarea
                ref={textareaRef}
                id="content"
                value={formData.body_text}
                onChange={(e) => setFormData(prev => ({ ...prev, body_text: e.target.value }))}
                placeholder={`Ejemplo: Estimado/a {customer_name},\n\nGracias por tu pedido#{invoice_id}.\nMonto total: {amount} {currency}\n\nSaludos cordiales.`}
                className="min-h-[150px] text-sm resize-none pr-12"
                style={{ lineHeight: '1.5' }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-8 w-8 p-0 hover:bg-muted"
                onClick={() => setIsVariablesModalOpen(true)}
                title="Ver todas las variables"
              >
                📝
              </Button>
            </div>
          </div>

          {/* Variables Sugeridas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Variables Comunes</Label>
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={() => setIsVariablesModalOpen(true)}
                className="text-xs"
              >
                <Eye className="h-3 w-3 mr-1" />
                Ver todas
              </Button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {getDefaultVariables(formData.channel).map(variable => {
                const varInfo = AVAILABLE_VARIABLES.find(v => v.key === variable);
                return (
                  <Button
                    key={variable}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto py-2 px-3 text-left justify-start border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5"
                    onClick={() => insertVariable(variable)}
                  >
                    <div className="w-full">
                      <div className="font-mono text-xs text-primary">{`{${variable}}`}</div>
                      {varInfo && (
                        <div className="text-xs text-muted-foreground truncate">{varInfo.label}</div>
                      )}
                    </div>
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Haz clic en cualquier variable para insertarla en el contenido.
            </p>
          </div>

          {/* Gestión de Imágenes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Imágenes</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoDetectProductImages}
                  className="text-xs h-7"
                  title="Auto-detectar imágenes de productos basado en variables"
                >
                  🤖 Auto-detectar
                </Button>
                <Badge variant="secondary" className="text-xs">
                  {Object.keys(formData.images).length} subidas
                </Badge>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {getImageVariables().map(imageVar => {
                const hasImage = formData.images[imageVar.key];
                return (
                  <div key={imageVar.key} className="border border-dashed border-muted-foreground/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium">{imageVar.label}</div>
                        <div className="text-xs text-muted-foreground font-mono">{`{${imageVar.key}}`}</div>
                      </div>
                      {hasImage && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeImage(imageVar.key)}
                          className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                    
                    {hasImage ? (
                      <div className="space-y-2">
                        <img 
                          src={formData.images[imageVar.key]} 
                          alt={imageVar.label}
                          className="w-full h-16 object-cover rounded border"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs h-7"
                          onClick={() => insertVariable(imageVar.key)}
                        >
                          📝 Insertar en contenido
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(imageVar.key, e)}
                          className="hidden"
                          id={`image-${imageVar.key}`}
                        />
                        <label 
                          htmlFor={`image-${imageVar.key}`}
                          className="flex items-center justify-center w-full h-16 border-2 border-dashed border-muted-foreground/30 rounded cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                        >
                          <div className="text-center">
                            <Image className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                            <div className="text-xs text-muted-foreground">Subir imagen</div>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <p className="text-xs text-muted-foreground">
              Sube imágenes para personalizar tus plantillas. Las imágenes se insertan como variables.
            </p>
          </div>

          {/* Vista Previa del Canal */}
          <div className="bg-muted/30 p-4 rounded-lg">
            <Label className="text-sm font-medium mb-2 block">Vista Previa del Canal</Label>
            <p className="text-sm text-muted-foreground">
              {getChannelPreviewText(formData.channel)}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || !formData.name.trim() || !formData.body_text.trim()}>
            {loading ? 'Creando...' : (template ? 'Actualizar' : 'Crear Plantilla')}
          </Button>
        </div>

        {/* Modal de Variables Completas */}
        <Dialog open={isVariablesModalOpen} onOpenChange={setIsVariablesModalOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Variables Disponibles</DialogTitle>
              <DialogDescription>
                Haz clic en cualquier variable para insertarla en tu plantilla
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(getVariablesByCategory()).map(([category, variables]) => (
                <div key={category} className="space-y-2">
                  <h4 className="font-semibold text-sm capitalize bg-muted px-2 py-1 rounded">
                    {category}
                  </h4>
                  <div className="space-y-1">
                    {variables.map(variable => (
                      <Button
                        key={variable.key}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs h-auto py-2 px-3 hover:bg-primary/10"
                        onClick={() => {
                          insertVariable(variable.key);
                          setIsVariablesModalOpen(false);
                        }}
                      >
                        <div className="text-left w-full">
                          <div className="font-mono text-primary">{`{${variable.key}}`}</div>
                          <div className="text-muted-foreground text-xs">{variable.label}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
