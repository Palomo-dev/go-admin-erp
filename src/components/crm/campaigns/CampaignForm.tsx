"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Loader2, Calendar, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { CampaignFormData, Segment } from './types';
import { getOrganizationId, validateCampaignForm } from './utils';

interface CampaignFormProps {
  onSuccess?: () => void;
  className?: string;
}

const CampaignForm: React.FC<CampaignFormProps> = ({ onSuccess, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  
  const [formData, setFormData] = useState<CampaignFormData>({
    name: '',
    channel: 'email',
    segment_id: '',
    content: '',
    scheduled_at: ''
  });

  // Cargar segmentos disponibles
  useEffect(() => {
    if (isOpen) {
      loadSegments();
    }
  }, [isOpen]);

  const loadSegments = async () => {
    setLoadingSegments(true);
    try {
      const organizationId = getOrganizationId();
      
      const { data, error } = await supabase
        .from('segments')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) {
        console.error('Error cargando segmentos:', error);
        toast.error('Error al cargar segmentos');
        return;
      }

      setSegments(data || []);
    } catch (error) {
      console.error('Error cargando segmentos:', error);
      toast.error('Error al cargar segmentos');
    } finally {
      setLoadingSegments(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar formulario
    const errors = validateCampaignForm(formData);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    setIsLoading(true);
    try {
      const organizationId = getOrganizationId();
      
      const campaignData = {
        organization_id: organizationId,
        name: formData.name.trim(),
        channel: formData.channel,
        segment_id: formData.segment_id,
        content: formData.content?.trim() || null,
        scheduled_at: formData.scheduled_at || null,
        status: formData.scheduled_at ? 'scheduled' : 'draft',
        statistics: {
          total_sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          open_rate: 0,
          click_rate: 0,
          conversion_rate: 0
        }
      };

      const { error } = await supabase
        .from('campaigns')
        .insert([campaignData]);

      if (error) {
        console.error('Error creando campaña:', error);
        toast.error('Error al crear la campaña');
        return;
      }

      toast.success('Campaña creada exitosamente');
      
      // Resetear formulario
      setFormData({
        name: '',
        channel: 'email',
        segment_id: '',
        content: '',
        scheduled_at: ''
      });
      
      setIsOpen(false);
      onSuccess?.();
      
    } catch (error) {
      console.error('Error creando campaña:', error);
      toast.error('Error al crear la campaña');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof CampaignFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          className={`bg-blue-600 hover:bg-blue-700 text-white ${className}`}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Campaña
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Crear Nueva Campaña
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información Básica */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Información Básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Nombre de la Campaña *</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Ej: Promoción Verano 2024"
                  required
                />
              </div>

              <div>
                <Label htmlFor="channel">Canal *</Label>
                <Select 
                  value={formData.channel} 
                  onValueChange={(value: 'email' | 'whatsapp') => handleInputChange('channel', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      <div className="flex items-center">
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                      </div>
                    </SelectItem>
                    <SelectItem value="whatsapp">
                      <div className="flex items-center">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        WhatsApp
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="segment">Segmento *</Label>
                <Select 
                  value={formData.segment_id} 
                  onValueChange={(value) => handleInputChange('segment_id', value)}
                  disabled={loadingSegments}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingSegments ? "Cargando..." : "Seleccionar segmento"} />
                  </SelectTrigger>
                  <SelectContent>
                    {segments.map((segment) => (
                      <SelectItem key={segment.id} value={segment.id}>
                        <div>
                          <div className="font-medium">{segment.name}</div>
                          <div className="text-sm text-gray-500">
                            {segment.customer_count} contactos
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Contenido */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Contenido</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="content">Mensaje</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => handleInputChange('content', e.target.value)}
                  placeholder="Escribe el contenido de tu campaña..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Programación */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Programación (Opcional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="scheduled_at">Fecha y Hora de Envío</Label>
                <Input
                  id="scheduled_at"
                  type="datetime-local"
                  value={formData.scheduled_at}
                  onChange={(e) => handleInputChange('scheduled_at', e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Si no seleccionas fecha, la campaña se guardará como borrador
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Botones */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear Campaña'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CampaignForm;
