'use client';

import { useState, useMemo } from 'react';
import { X, Send, RefreshCw, Smartphone, Mail, MessageSquare, Globe, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Separator } from '@/components/ui/separator';

import { processTemplate, processTemplateWithProductImages } from '@/lib/services/templateService';
import type { NotificationTemplate, NotificationChannel } from '@/types/eventTrigger';

interface TemplatePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  template: NotificationTemplate;
}

// Datos de ejemplo para la vista previa
const SAMPLE_DATA = {
  customer_name: 'Juan Pérez',
  customer_email: 'juan.perez@example.com',
  customer_phone: '+34 123 456 789',
  invoice_id: 'INV-2025-001',
  invoice_number: '2025-001',
  total: '€1,250.00',
  amount: '€1,250.00',
  currency: 'EUR',
  due_date: '2025-02-15',
  product_name: 'Software de Gestión',
  product_sku: 'SW-GEST-001',
  quantity: '1',
  order_id: 'ORD-2025-001',
  order_date: '2025-01-31',
  delivery_date: '2025-02-05',
  company_name: 'GO Admin ERP',
  company_logo: 'https://example.com/logo.png',
  support_email: 'soporte@goadmin.com',
  website_url: 'https://goadmin.com',
  // Variables de imagen
  product_image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=200&fit=crop',
  product_gallery: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=300&h=200&fit=crop',
  organization_logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=100&fit=crop',
  organization_banner: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=200&fit=crop',
  custom_image_1: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=300&h=200&fit=crop',
  custom_image_2: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&h=200&fit=crop',
  custom_image_3: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=300&h=200&fit=crop',
  qr_code: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://goadmin.com',
  signature_image: 'https://images.unsplash.com/photo-1594736797933-d0601ba2fe65?w=200&h=100&fit=crop',
};

export function TemplatePreview({ isOpen, onClose, template }: TemplatePreviewProps) {
  const [testData, setTestData] = useState<Record<string, string>>(SAMPLE_DATA);
  const [activeChannel, setActiveChannel] = useState<'preview' | 'test'>('preview');
  const { toast } = useToast();

  // Procesar contenido y convertir variables de imagen en elementos HTML
  const processContentWithImages = (content: string, isHtml: boolean = false) => {
    let processedContent = processTemplate(content, testData);
    
    // Lista de variables de imagen
    const imageVariables = [
      'product_image', 'product_gallery', 'organization_logo', 'organization_banner',
      'custom_image_1', 'custom_image_2', 'custom_image_3', 'qr_code', 'signature_image', 'company_logo'
    ];
    
    if (isHtml) {
      // En HTML, convertir variables de imagen en elementos img
      imageVariables.forEach(imageVar => {
        const imageUrl = testData[imageVar];
        if (imageUrl && processedContent.includes(`{${imageVar}}`)) {
          const imgTag = `<img src="${imageUrl}" alt="${imageVar.replace('_', ' ')}" style="max-width: 300px; height: auto; border-radius: 4px; margin: 8px 0;" />`;
          processedContent = processedContent.replace(new RegExp(`\\{${imageVar}\\}`, 'g'), imgTag);
        }
      });
    } else {
      // En texto plano, reemplazar con descripción
      imageVariables.forEach(imageVar => {
        const imageUrl = testData[imageVar];
        if (imageUrl && processedContent.includes(`{${imageVar}}`)) {
          const description = `[Imagen: ${imageVar.replace('_', ' ')}]`;
          processedContent = processedContent.replace(new RegExp(`\\{${imageVar}\\}`, 'g'), description);
        }
      });
    }
    
    return processedContent;
  };

  // Procesar plantilla con datos de prueba
  const processedTemplate = useMemo(() => {
    try {
      return {
        subject: template.subject ? processTemplate(template.subject, testData) : '',
        body_text: processContentWithImages(template.body_text, false),
        body_html: template.body_html ? processContentWithImages(template.body_html, true) : '',
      };
    } catch (error) {
      console.error('Error processing template:', error);
      return {
        subject: '',
        body_text: 'Error procesando plantilla',
        body_html: '',
      };
    }
  }, [template, testData]);

  const getChannelIcon = (channel: NotificationChannel) => {
    const icons = {
      email: Mail,
      whatsapp: MessageSquare,
      sms: Smartphone,
      push: Bell,
      webhook: Globe
    };
    return icons[channel] || Mail;
  };

  const getChannelColor = (channel: NotificationChannel) => {
    const colors = {
      email: 'bg-blue-500',
      whatsapp: 'bg-green-500',
      sms: 'bg-purple-500',
      push: 'bg-orange-500',
      webhook: 'bg-gray-500'
    };
    return colors[channel] || 'bg-gray-500';
  };

  const renderEmailPreview = () => (
    <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
      {/* Header de email */}
      <div className="bg-gray-50 px-4 py-3 border-b">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="font-medium">De:</span>
            <span>{testData.company_name} &lt;{testData.support_email}&gt;</span>
          </div>
          <Badge variant="secondary">Borrador</Badge>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <span className="font-medium">Para:</span>
          <span className="ml-2">{testData.customer_name} &lt;{testData.customer_email}&gt;</span>
        </div>
        {processedTemplate.subject && (
          <div className="mt-2">
            <span className="font-medium text-gray-900 text-base">
              {processedTemplate.subject}
            </span>
          </div>
        )}
      </div>

      {/* Contenido del email */}
      <div className="p-6">
        {template.body_html ? (
          <div 
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: processedTemplate.body_html }}
          />
        ) : (
          <div className="whitespace-pre-wrap text-gray-800">
            {processedTemplate.body_text}
          </div>
        )}
      </div>

      {/* Footer del email */}
      <div className="bg-gray-50 px-6 py-4 border-t">
        <div className="text-xs text-gray-500 text-center">
          <p>Este email fue enviado por {testData.company_name}</p>
          <p className="mt-1">
            <a href={testData.website_url} className="text-blue-600 hover:underline">
              {testData.website_url}
            </a>
            {' | '}
            <a href={`mailto:${testData.support_email}`} className="text-blue-600 hover:underline">
              Contacto
            </a>
          </p>
        </div>
      </div>
    </div>
  );

  const renderWhatsAppPreview = () => {
    // Extraer imágenes del contenido para WhatsApp
    const imageVariables = [
      'product_image', 'product_gallery', 'organization_logo', 'organization_banner',
      'custom_image_1', 'custom_image_2', 'custom_image_3', 'qr_code', 'signature_image', 'company_logo'
    ];
    
    const imagesInContent = imageVariables.filter(imageVar => 
      template.body_text.includes(`{${imageVar}}`) && testData[imageVar]
    );
    
    return (
      <div className="bg-[#128C7E] p-4 rounded-lg">
        <div className="bg-white rounded-lg p-4 max-w-xs ml-auto">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-xs font-semibold">GO</span>
            </div>
            <div>
              <div className="font-semibold text-sm">{testData.company_name}</div>
              <div className="text-xs text-gray-500">Business</div>
            </div>
          </div>
          
          {/* Mostrar imágenes primero */}
          {imagesInContent.length > 0 && (
            <div className="mb-2 space-y-1">
              {imagesInContent.slice(0, 2).map(imageVar => (
                <img 
                  key={imageVar}
                  src={testData[imageVar]} 
                  alt={imageVar.replace('_', ' ')}
                  className="w-full h-24 object-cover rounded"
                />
              ))}
              {imagesInContent.length > 2 && (
                <div className="text-xs text-gray-500 text-center">
                  +{imagesInContent.length - 2} más
                </div>
              )}
            </div>
          )}
          
          <div className="whitespace-pre-wrap text-sm">
            {processedTemplate.body_text}
          </div>
          <div className="text-xs text-gray-500 mt-2 text-right">
            12:34 ✓✓
          </div>
        </div>
      </div>
    );
  };

  const renderSMSPreview = () => (
    <div className="bg-gray-900 text-white p-4 rounded-lg">
      <div className="flex items-center gap-2 mb-4">
        <Smartphone className="h-5 w-5" />
        <span className="font-medium">Vista Previa SMS</span>
      </div>
      <div className="bg-blue-600 text-white p-3 rounded-lg max-w-xs">
        <div className="text-sm whitespace-pre-wrap">
          {processedTemplate.body_text}
        </div>
        <div className="text-xs opacity-75 mt-2">
          {processedTemplate.body_text.length}/160 caracteres
        </div>
      </div>
    </div>
  );

  const renderPushPreview = () => (
    <div className="bg-gray-100 p-4 rounded-lg">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5" />
        <span className="font-medium">Notificación Push</span>
      </div>
      <div className="bg-white border rounded-lg p-4 shadow-sm max-w-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-semibold">
            GO
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">{testData.company_name}</div>
            <div className="text-sm text-gray-600 line-clamp-2">
              {processedTemplate.body_text}
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">Ahora</div>
      </div>
    </div>
  );

  const renderWebhookPreview = () => (
    <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
      <div className="flex items-center gap-2 mb-4 text-white">
        <Globe className="h-5 w-5" />
        <span className="font-medium">Webhook Payload</span>
      </div>
      <pre className="whitespace-pre-wrap overflow-x-auto">
        {JSON.stringify({
          event: "template_message",
          template: {
            id: template.id,
            name: template.name,
            channel: template.channel,
          },
          message: {
            text: processedTemplate.body_text,
            variables_used: template.variables,
          },
          timestamp: new Date().toISOString(),
        }, null, 2)}
      </pre>
    </div>
  );

  const renderPreview = () => {
    switch (template.channel) {
      case 'email':
        return renderEmailPreview();
      case 'whatsapp':
        return renderWhatsAppPreview();
      case 'sms':
        return renderSMSPreview();
      case 'push':
        return renderPushPreview();
      case 'webhook':
        return renderWebhookPreview();
      default:
        return renderEmailPreview();
    }
  };

  const handleSendTest = () => {
    toast({
      title: 'Prueba enviada',
      description: `Se enviará una prueba de la plantilla por ${template.channel}`,
    });
  };

  if (!isOpen) return null;

  const ChannelIcon = getChannelIcon(template.channel);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <ChannelIcon className="h-5 w-5" />
            Vista Previa: {template.name}
            <Badge variant="secondary" className={getChannelColor(template.channel) + ' text-white'}>
              {template.channel.toUpperCase()}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Visualiza cómo se verá tu plantilla antes de enviarla
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeChannel} onValueChange={(tab) => setActiveChannel(tab as any)} className="h-[70vh] flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview">Vista Previa</TabsTrigger>
            <TabsTrigger value="test">Datos de Prueba</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="preview" className="h-full mt-4">
              <div className="h-full overflow-y-auto">
                {renderPreview()}
              </div>
            </TabsContent>

            <TabsContent value="test" className="h-full mt-4">
              <div className="h-full overflow-y-auto">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Datos de Prueba</CardTitle>
                    <CardDescription>
                      Modifica estos valores para ver cómo cambia la vista previa
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {template.variables.map(variable => (
                        <div key={variable}>
                          <Label htmlFor={variable} className="capitalize">
                            {variable.replace(/_/g, ' ')}
                          </Label>
                          <Input
                            id={variable}
                            value={testData[variable] || ''}
                            onChange={(e) => setTestData(prev => ({
                              ...prev,
                              [variable]: e.target.value
                            }))}
                            placeholder={`Valor para {${variable}}`}
                          />
                        </div>
                      ))}
                    </div>

                    {template.variables.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Esta plantilla no utiliza variables</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <Separator />

        {/* Footer */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            Plantilla v{template.version} • {template.variables.length} variables
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSendTest}>
              <Send className="h-4 w-4 mr-2" />
              Enviar Prueba
            </Button>
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
