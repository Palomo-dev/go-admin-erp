/**
 * Componente para gestionar plantillas de notificación
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RefreshCw, Plus, Mail, MessageSquare, Webhook, Smartphone, MessageCircle, Eye, Edit3, X, Save } from 'lucide-react';

interface NotificationTemplate {
  id: string;
  channel: 'email' | 'whatsapp' | 'webhook' | 'push' | 'sms';
  name: string;
  subject?: string;
  body_text: string;
  variables: string[];
  version: number;
  created_at: string;
}

const MOCK_TEMPLATES: NotificationTemplate[] = [
  {
    id: '1',
    channel: 'email',
    name: 'Factura Creada',
    subject: 'Nueva factura #{invoice_id} generada',
    body_text: 'Estimado/a {customer_name},\n\nSe ha generado una nueva factura #{invoice_id} por el monto de {amount} {currency}.\n\nGracias por su preferencia.',
    variables: ['invoice_id', 'customer_name', 'amount', 'currency'],
    version: 1,
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    channel: 'email',
    name: 'Factura Pagada',
    subject: 'Pago recibido - Factura #{invoice_id}',
    body_text: 'Estimado/a {customer_name},\n\nHemos recibido el pago de {amount_paid} {currency} para la factura #{invoice_id}.\n\n¡Gracias por su pago!',
    variables: ['invoice_id', 'customer_name', 'amount_paid', 'currency'],
    version: 1,
    created_at: new Date().toISOString()
  },
  {
    id: '3',
    channel: 'whatsapp',
    name: 'Stock Bajo',
    body_text: '⚠️ *Alerta de Stock*\n\nEl producto *{product_name}* tiene solo {current_stock} unidades disponibles.\n\nStock mínimo: {minimum_stock}\n\n_Sistema de Inventario_',
    variables: ['product_name', 'current_stock', 'minimum_stock'],
    version: 1,
    created_at: new Date().toISOString()
  },
  {
    id: '4',
    channel: 'webhook',
    name: 'Usuario Registrado',
    body_text: '{"event": "user.created", "user_id": "{user_id}", "email": "{email}", "name": "{name}", "timestamp": "{timestamp}"}',
    variables: ['user_id', 'email', 'name', 'timestamp'],
    version: 1,
    created_at: new Date().toISOString()
  }
];

const getChannelIcon = (channel: string) => {
  switch (channel) {
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'whatsapp':
      return <MessageSquare className="h-4 w-4" />;
    case 'webhook':
      return <Webhook className="h-4 w-4" />;
    case 'push':
      return <Smartphone className="h-4 w-4" />;
    case 'sms':
      return <MessageCircle className="h-4 w-4" />;
    default:
      return <Mail className="h-4 w-4" />;
  }
};

const getChannelColor = (channel: string) => {
  switch (channel) {
    case 'email':
      return 'bg-blue-100 text-blue-800';
    case 'whatsapp':
      return 'bg-green-100 text-green-800';
    case 'webhook':
      return 'bg-purple-100 text-purple-800';
    case 'push':
      return 'bg-orange-100 text-orange-800';
    case 'sms':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const TemplatesTab: React.FC = () => {
  const [templates, setTemplates] = useState<NotificationTemplate[]>(MOCK_TEMPLATES);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<Partial<NotificationTemplate>>({});
  const [selectedChannelForCreate, setSelectedChannelForCreate] = useState<'email' | 'whatsapp' | 'webhook' | 'push' | 'sms'>('email');
  const [isVariablesModalOpen, setIsVariablesModalOpen] = useState(false);

  // Filtrar plantillas
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.body_text.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesChannel = selectedChannel === 'all' || template.channel === selectedChannel;
    return matchesSearch && matchesChannel;
  });

  // Agrupar por canal
  const templatesByChannel = filteredTemplates.reduce((acc, template) => {
    if (!acc[template.channel]) {
      acc[template.channel] = [];
    }
    acc[template.channel].push(template);
    return acc;
  }, {} as Record<string, NotificationTemplate[]>);

  const channels = ['all', 'email', 'whatsapp', 'webhook', 'push', 'sms'];

  // Funciones para modals
  const handlePreview = (template: NotificationTemplate) => {
    setPreviewTemplate(template);
    setIsPreviewOpen(true);
  };

  const handleEdit = (template: NotificationTemplate) => {
    setEditingTemplate({ ...template });
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (editingTemplate) {
      setTemplates(templates.map(t => 
        t.id === editingTemplate.id ? editingTemplate : t
      ));
      setIsEditOpen(false);
      setEditingTemplate(null);
    }
  };

  const handleCreateNew = () => {
    setNewTemplate({
      name: '',
      channel: selectedChannelForCreate,
      body_text: '',
      variables: getDefaultVariables(selectedChannelForCreate),
      subject: selectedChannelForCreate === 'email' ? '' : undefined
    });
    setIsCreateOpen(true);
  };

  const handleSaveNew = () => {
    if (newTemplate.name && newTemplate.body_text) {
      const newTemplateComplete: NotificationTemplate = {
        id: Date.now().toString(),
        channel: selectedChannelForCreate,
        name: newTemplate.name,
        subject: newTemplate.subject,
        body_text: newTemplate.body_text,
        variables: newTemplate.variables || [],
        version: 1,
        created_at: new Date().toISOString()
      };
      
      setTemplates([...templates, newTemplateComplete]);
      setIsCreateOpen(false);
      setNewTemplate({});
    }
  };

  const getDefaultVariables = (channel: string): string[] => {
    switch (channel) {
      case 'email':
        return ['customer_name', 'invoice_id', 'amount', 'currency'];
      case 'whatsapp':
        return ['customer_name', 'product_name', 'current_stock'];
      case 'webhook':
        return ['user_id', 'email', 'name', 'timestamp'];
      case 'push':
        return ['user_name', 'notification_title', 'message'];
      case 'sms':
        return ['customer_name', 'code', 'expiration_time'];
      default:
        return ['variable1', 'variable2'];
    }
  };

  const getAllVariables = () => {
    return {
      "Información del Cliente": [
        { name: "customer_name", description: "Nombre completo del cliente" },
        { name: "customer_email", description: "Dirección de correo electrónico del cliente" },
        { name: "customer_phone", description: "Número de teléfono del cliente" },
        { name: "customer_id", description: "Identificador único del cliente" },
        { name: "customer_address", description: "Dirección del cliente" }
      ],
      "Pedidos e Inventario": [
        { name: "order_id", description: "Número de pedido único" },
        { name: "invoice_id", description: "Número de factura" },
        { name: "product_name", description: "Nombre del producto" },
        { name: "product_sku", description: "Código SKU del producto" },
        { name: "quantity", description: "Cantidad de productos" },
        { name: "amount", description: "Monto total" },
        { name: "currency", description: "Moneda (USD, EUR, etc.)" },
        { name: "current_stock", description: "Stock actual del producto" },
        { name: "low_stock_threshold", description: "Límite mínimo de stock" }
      ],
      "Fechas y Tiempos": [
        { name: "order_date", description: "Fecha del pedido" },
        { name: "delivery_date", description: "Fecha estimada de entrega" },
        { name: "timestamp", description: "Marca de tiempo actual" },
        { name: "expiration_time", description: "Tiempo de expiración" },
        { name: "created_at", description: "Fecha de creación" },
        { name: "updated_at", description: "Fecha de actualización" }
      ],
      "Usuarios y Autenticación": [
        { name: "user_id", description: "ID único del usuario" },
        { name: "user_name", description: "Nombre de usuario" },
        { name: "user_email", description: "Email del usuario" },
        { name: "code", description: "Código de verificación" },
        { name: "verification_link", description: "Enlace de verificación" },
        { name: "reset_password_link", description: "Enlace para restablecer contraseña" }
      ],
      "Notificaciones": [
        { name: "notification_title", description: "Título de la notificación" },
        { name: "message", description: "Mensaje de la notificación" },
        { name: "alert_type", description: "Tipo de alerta (info, warning, error)" },
        { name: "priority", description: "Prioridad de la notificación" }
      ],
      "Sistema": [
        { name: "company_name", description: "Nombre de la empresa" },
        { name: "company_logo", description: "URL del logo de la empresa" },
        { name: "support_email", description: "Email de soporte" },
        { name: "website_url", description: "URL del sitio web" },
        { name: "unsubscribe_link", description: "Enlace para darse de baja" },
        { name: "contact_phone", description: "Teléfono de contacto" }
      ]
    };
  };

  const renderPreviewContent = (template: NotificationTemplate) => {
    if (template.channel === 'email') {
      return (
        <div className="bg-white border rounded-lg p-6 shadow-sm max-w-2xl mx-auto">
          <div className="border-b pb-4 mb-4">
            <div className="flex justify-between items-center text-sm text-gray-600 mb-2">
              <span>De: sistema@go-admin-erp.com</span>
              <span>Para: cliente@ejemplo.com</span>
            </div>
            {template.subject && (
              <h2 className="text-lg font-semibold text-gray-900">{template.subject}</h2>
            )}
          </div>
          <div className="prose max-w-none">
            <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
              {template.body_text}
            </div>
          </div>
          <div className="mt-6 pt-4 border-t text-xs text-gray-500">
            <p>Este es un email automático generado por GO Admin ERP</p>
          </div>
        </div>
      );
    }
    
    if (template.channel === 'whatsapp') {
      return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-sm mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-5 w-5 text-green-600" />
            <span className="font-medium text-green-800">WhatsApp Message</span>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="whitespace-pre-wrap text-sm text-gray-800">
              {template.body_text}
            </div>
            <div className="text-xs text-gray-500 mt-2 text-right">
              Enviado por GO Admin ERP
            </div>
          </div>
        </div>
      );
    }

    // Para otros canales (webhook, push, sms)
    return (
      <div className="bg-gray-50 border rounded-lg p-4 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-3">
          {getChannelIcon(template.channel)}
          <span className="font-medium capitalize">{template.channel} Content</span>
        </div>
        <div className="bg-white rounded-lg p-3 border">
          <pre className="whitespace-pre-wrap text-sm text-gray-800 overflow-x-auto">
            {template.body_text}
          </pre>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Plantillas de Notificación
              </CardTitle>
              <CardDescription>
                {templates.length} plantillas disponibles para personalizar notificaciones
              </CardDescription>
            </div>
            <Button size="sm" onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Plantilla
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="flex gap-4 mb-6">
            <Input
              placeholder="Buscar plantillas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <div className="flex gap-2">
              {channels.map((channel) => (
                <Button
                  key={channel}
                  variant={selectedChannel === channel ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedChannel(channel)}
                  className="capitalize"
                >
                  {channel === 'all' ? 'Todos' : channel}
                </Button>
              ))}
            </div>
          </div>

          {/* Lista de plantillas */}
          <div className="space-y-6">
            {Object.entries(templatesByChannel).map(([channel, channelTemplates]) => (
              <div key={channel}>
                <div className="flex items-center gap-2 mb-3">
                  {getChannelIcon(channel)}
                  <h3 className="font-semibold capitalize">{channel}</h3>
                  <Badge variant="secondary">{channelTemplates.length}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {channelTemplates.map((template) => (
                    <Card key={template.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-sm">{template.name}</CardTitle>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge className={getChannelColor(template.channel)}>
                                {getChannelIcon(template.channel)}
                                <span className="ml-1 capitalize">{template.channel}</span>
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                v{template.version}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {template.subject && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-muted-foreground">Asunto:</p>
                            <p className="text-sm">{template.subject}</p>
                          </div>
                        )}
                        <div className="mb-3">
                          <p className="text-xs font-medium text-muted-foreground">Contenido:</p>
                          <p className="text-sm line-clamp-3">{template.body_text}</p>
                        </div>
                        <div className="mb-3">
                          <p className="text-xs font-medium text-muted-foreground">Variables:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {template.variables.map((variable) => (
                              <code key={variable} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                {'{' + variable + '}'}
                              </code>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => handlePreview(template)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Vista Previa
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(template)}
                          >
                            <Edit3 className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal de Vista Previa */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Vista Previa: {previewTemplate?.name}
              {previewTemplate && (
                <Badge className={getChannelColor(previewTemplate.channel)}>
                  {getChannelIcon(previewTemplate.channel)}
                  <span className="ml-1 capitalize">{previewTemplate.channel}</span>
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Así es como se vería esta plantilla cuando llegue al destinatario
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6">
            {previewTemplate && renderPreviewContent(previewTemplate)}
          </div>
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">Variables disponibles:</span>
              <div className="flex flex-wrap gap-1">
                {previewTemplate?.variables.map((variable) => (
                  <code key={variable} className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs">
                    {'{' + variable + '}'}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Edición */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Editar Plantilla: {editingTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Modifica el contenido de la plantilla de notificación
            </DialogDescription>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4 mt-6">
              <div>
                <Label htmlFor="template-name">Nombre de la Plantilla</Label>
                <Input
                  id="template-name"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({ 
                    ...editingTemplate, 
                    name: e.target.value 
                  })}
                  className="mt-1"
                />
              </div>
              
              {editingTemplate.channel === 'email' && (
                <div>
                  <Label htmlFor="template-subject">Asunto del Email</Label>
                  <Input
                    id="template-subject"
                    value={editingTemplate.subject || ''}
                    onChange={(e) => setEditingTemplate({ 
                      ...editingTemplate, 
                      subject: e.target.value 
                    })}
                    className="mt-1"
                    placeholder="Ej: Nueva factura #{invoice_id} generada"
                  />
                </div>
              )}
              
              <div>
                <Label htmlFor="template-body">Contenido</Label>
                <Textarea
                  id="template-body"
                  value={editingTemplate.body_text}
                  onChange={(e) => setEditingTemplate({ 
                    ...editingTemplate, 
                    body_text: e.target.value 
                  })}
                  rows={8}
                  className="mt-1 font-mono text-sm"
                  placeholder="Escribe el contenido de la plantilla aquí..."
                />
              </div>
              
              <div>
                <Label>Variables Disponibles</Label>
                <div className="flex flex-wrap gap-2 mt-2 p-3 bg-gray-50 rounded">
                  {editingTemplate.variables.map((variable) => (
                    <code 
                      key={variable} 
                      className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm cursor-pointer hover:bg-blue-200"
                      onClick={() => {
                        const textarea = document.getElementById('template-body') as HTMLTextAreaElement;
                        if (textarea) {
                          const cursorPos = textarea.selectionStart;
                          const textBefore = textarea.value.substring(0, cursorPos);
                          const textAfter = textarea.value.substring(cursorPos);
                          const newText = textBefore + '{' + variable + '}' + textAfter;
                          setEditingTemplate({ 
                            ...editingTemplate, 
                            body_text: newText 
                          });
                          setTimeout(() => {
                            textarea.focus();
                            textarea.setSelectionRange(cursorPos + variable.length + 2, cursorPos + variable.length + 2);
                          }, 10);
                        }
                      }}
                      title="Haz clic para insertar en el contenido"
                    >
                      {'{' + variable + '}'}
                    </code>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Haz clic en cualquier variable para insertarla en el contenido
                </p>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditOpen(false)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                <Button onClick={handleSaveEdit}>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Cambios
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Crear Nueva Plantilla */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Crear Nueva Plantilla
            </DialogTitle>
            <DialogDescription>
              Crea una nueva plantilla de notificación personalizada
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-6">
            {/* Selección de Canal */}
            <div>
              <Label htmlFor="channel-select">Canal de Notificación</Label>
              <div className="flex gap-2 mt-2">
                {(['email', 'whatsapp', 'webhook', 'push', 'sms'] as const).map((channel) => (
                  <Button
                    key={channel}
                    variant={selectedChannelForCreate === channel ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedChannelForCreate(channel);
                      setNewTemplate({
                        ...newTemplate,
                        channel,
                        variables: getDefaultVariables(channel),
                        subject: channel === 'email' ? (newTemplate.subject || '') : undefined
                      });
                    }}
                    className="capitalize flex items-center gap-1"
                  >
                    {getChannelIcon(channel)}
                    {channel}
                  </Button>
                ))}
              </div>
            </div>

            {/* Nombre de la Plantilla */}
            <div>
              <Label htmlFor="new-template-name">Nombre de la Plantilla</Label>
              <Input
                id="new-template-name"
                value={newTemplate.name || ''}
                onChange={(e) => setNewTemplate({ 
                  ...newTemplate, 
                  name: e.target.value 
                })}
                className="mt-1"
                placeholder="Ej: Confirmación de Pedido"
              />
            </div>
            
            {/* Asunto (solo para email) */}
            {selectedChannelForCreate === 'email' && (
              <div>
                <Label htmlFor="new-template-subject">Asunto del Email</Label>
                <Input
                  id="new-template-subject"
                  value={newTemplate.subject || ''}
                  onChange={(e) => setNewTemplate({ 
                    ...newTemplate, 
                    subject: e.target.value 
                  })}
                  className="mt-1"
                  placeholder="Ej: ¡Gracias por tu pedido #{order_id}!"
                />
              </div>
            )}
            
            {/* Contenido */}
            <div>
              <Label htmlFor="new-template-body">Contenido</Label>
              <Textarea
                id="new-template-body"
                value={newTemplate.body_text || ''}
                onChange={(e) => setNewTemplate({ 
                  ...newTemplate, 
                  body_text: e.target.value 
                })}
                rows={8}
                className="mt-1 font-mono text-sm"
                placeholder={
                  selectedChannelForCreate === 'email' 
                    ? "Estimado/a {customer_name},\n\n\u00a1Gracias por tu pedido!\n\nSaludos cordiales."
                    : selectedChannelForCreate === 'whatsapp'
                    ? "👋 ¡Hola {customer_name}!\n\nTu pedido ha sido confirmado \u2713\n\n¡Gracias!"
                    : "Escribe el contenido de la plantilla aquí..."
                }
              />
            </div>
            
            {/* Variables Disponibles */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Variables Sugeridas</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsVariablesModalOpen(true)}
                  className="text-xs"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Ver más Variables
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 p-3 bg-gray-50 rounded">
                {newTemplate.variables?.map((variable) => (
                  <code 
                    key={variable} 
                    className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm cursor-pointer hover:bg-blue-200"
                    onClick={() => {
                      const textarea = document.getElementById('new-template-body') as HTMLTextAreaElement;
                      if (textarea) {
                        const cursorPos = textarea.selectionStart;
                        const textBefore = textarea.value.substring(0, cursorPos);
                        const textAfter = textarea.value.substring(cursorPos);
                        const newText = textBefore + '{' + variable + '}' + textAfter;
                        setNewTemplate({ 
                          ...newTemplate, 
                          body_text: newText 
                        });
                        setTimeout(() => {
                          textarea.focus();
                          textarea.setSelectionRange(cursorPos + variable.length + 2, cursorPos + variable.length + 2);
                        }, 10);
                      }
                    }}
                    title="Haz clic para insertar en el contenido"
                  >
                    {'{' + variable + '}'}
                  </code>
                )) || []}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Variables sugeridas para este canal. Haz clic para insertar.
              </p>
            </div>
            
            {/* Vista previa del canal seleccionado */}
            <div className="p-3 bg-gray-50 rounded">
              <div className="flex items-center gap-2 mb-2">
                {getChannelIcon(selectedChannelForCreate)}
                <span className="font-medium text-sm capitalize">Vista previa: {selectedChannelForCreate}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedChannelForCreate === 'email' && 'Se enviará como correo electrónico con asunto y contenido HTML'}
                {selectedChannelForCreate === 'whatsapp' && 'Se enviará como mensaje de WhatsApp con formato de texto'}
                {selectedChannelForCreate === 'webhook' && 'Se enviará como petición HTTP POST con el contenido en JSON'}
                {selectedChannelForCreate === 'push' && 'Se enviará como notificación push al dispositivo'}
                {selectedChannelForCreate === 'sms' && 'Se enviará como mensaje de texto SMS'}
              </div>
            </div>
            
            {/* Botones de acción */}
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsCreateOpen(false);
                  setNewTemplate({});
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveNew}
                disabled={!newTemplate.name || !newTemplate.body_text}
              >
                <Save className="h-4 w-4 mr-2" />
                Crear Plantilla
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Ver Todas las Variables */}
      <Dialog open={isVariablesModalOpen} onOpenChange={setIsVariablesModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Variables Disponibles
            </DialogTitle>
            <DialogDescription>
              Listado completo de variables que puedes usar en tus plantillas de notificación
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-6">
            {Object.entries(getAllVariables()).map(([category, variables]) => (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-px bg-gradient-to-r from-blue-500 to-transparent flex-1" />
                  <h3 className="font-semibold text-lg text-blue-700">{category}</h3>
                  <div className="h-px bg-gradient-to-l from-blue-500 to-transparent flex-1" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {variables.map((variable) => (
                    <div 
                      key={variable.name} 
                      className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                      onClick={() => {
                        const textarea = document.getElementById('new-template-body') as HTMLTextAreaElement;
                        if (textarea && isCreateOpen) {
                          const cursorPos = textarea.selectionStart;
                          const textBefore = textarea.value.substring(0, cursorPos);
                          const textAfter = textarea.value.substring(cursorPos);
                          const newText = textBefore + '{' + variable.name + '}' + textAfter;
                          setNewTemplate({ 
                            ...newTemplate, 
                            body_text: newText 
                          });
                          
                          // Cerrar modal de variables
                          setIsVariablesModalOpen(false);
                          
                          // Enfocar textarea después de un pequeño delay
                          setTimeout(() => {
                            textarea.focus();
                            textarea.setSelectionRange(cursorPos + variable.name.length + 2, cursorPos + variable.name.length + 2);
                          }, 100);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <code className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-mono group-hover:bg-blue-200 transition-colors">
                              {'{' + variable.name + '}'}
                            </code>
                            {isCreateOpen && (
                              <span className="text-xs text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                Clic para insertar
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                            {variable.description}
                          </p>
                        </div>
                        
                        {isCreateOpen && (
                          <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus className="h-4 w-4 text-blue-500" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Información adicional */}
            <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 p-2 rounded-full">
                  <Eye className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-blue-900 mb-2">Cómo usar las variables</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Las variables se escriben entre llaves: <code className="bg-white px-1 rounded">{'{variable_name}'}</code></li>
                    <li>• {isCreateOpen ? 'Haz clic en cualquier variable para insertarla automáticamente en tu plantilla' : 'Al crear o editar una plantilla, puedes hacer clic en las variables para insertarlas'}</li>
                    <li>• Cada canal de notificación tiene variables sugeridas más relevantes</li>
                    <li>• Puedes combinar texto fijo con variables dinámicas</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Botones de acción */}
            <div className="flex justify-end pt-4">
              <Button 
                variant="outline" 
                onClick={() => setIsVariablesModalOpen(false)}
              >
                <X className="h-4 w-4 mr-2" />
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
