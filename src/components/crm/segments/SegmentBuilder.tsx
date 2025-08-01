"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Users, Filter, Code, Save, Eye, Download } from "lucide-react";
import { supabase } from "@/lib/supabase/config";
import { toast } from "sonner";
import FilterBuilder from "./FilterBuilder";
import SegmentPreview from "./SegmentPreview";
import SegmentList from "./SegmentList";
import { getOrganizationId } from "../pipeline/utils/pipelineUtils";

interface Segment {
  id: string;
  organization_id: number;
  name: string;
  description?: string;
  filter_json: any;
  is_dynamic: boolean;
  customer_count: number;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: any;
  type: 'customer' | 'event';
}

interface FilterGroup {
  id: string;
  operator: 'AND' | 'OR';
  rules: FilterRule[];
  groups: FilterGroup[];
}

/**
 * Componente principal del builder de segmentos CRM
 * Permite crear, editar y gestionar segmentos de clientes
 */
export default function SegmentBuilder() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [currentSegment, setCurrentSegment] = useState<Partial<Segment>>({
    name: "",
    description: "",
    is_dynamic: true,
    filter_json: { operator: 'AND', rules: [], groups: [] }
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [activeTab, setActiveTab] = useState("list");
  const [organizationId, setOrganizationId] = useState<number | null>(null);

  // Obtener ID de organización al cargar
  useEffect(() => {
    const orgId = getOrganizationId();
    if (orgId) {
      setOrganizationId(parseInt(orgId));
    }
  }, []);

  // Cargar segmentos existentes
  useEffect(() => {
    if (organizationId) {
      loadSegments();
    }
  }, [organizationId]);

  const loadSegments = async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('segments')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSegments(data || []);
    } catch (error) {
      console.error('Error cargando segmentos:', error);
      toast.error('Error al cargar los segmentos');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSegment = async () => {
    if (!organizationId || !currentSegment.name) {
      toast.error('Nombre del segmento es requerido');
      return;
    }

    setLoading(true);
    try {
      const segmentData = {
        organization_id: organizationId,
        name: currentSegment.name,
        description: currentSegment.description,
        filter_json: currentSegment.filter_json,
        is_dynamic: currentSegment.is_dynamic,
        customer_count: previewCount
      };

      if (isEditing && currentSegment.id) {
        const { error } = await supabase
          .from('segments')
          .update(segmentData)
          .eq('id', currentSegment.id);

        if (error) throw error;
        toast.success('Segmento actualizado exitosamente');
      } else {
        const { error } = await supabase
          .from('segments')
          .insert(segmentData);

        if (error) throw error;
        toast.success('Segmento creado exitosamente');
      }

      setIsDialogOpen(false);
      setCurrentSegment({
        name: "",
        description: "",
        is_dynamic: true,
        filter_json: { operator: 'AND', rules: [], groups: [] }
      });
      setIsEditing(false);
      loadSegments();
    } catch (error) {
      console.error('Error guardando segmento:', error);
      toast.error('Error al guardar el segmento');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSegment = (segment: Segment) => {
    setCurrentSegment(segment);
    setIsEditing(true);
    setIsDialogOpen(true);
    setActiveTab("builder");
  };

  const handleNewSegment = () => {
    setCurrentSegment({
      name: "",
      description: "",
      is_dynamic: true,
      filter_json: { operator: 'AND', rules: [], groups: [] }
    });
    setIsEditing(false);
    setIsDialogOpen(true);
    setActiveTab("builder");
  };

  const handleDeleteSegment = async (segmentId: string) => {
    try {
      const { error } = await supabase
        .from('segments')
        .delete()
        .eq('id', segmentId);

      if (error) throw error;
      toast.success('Segmento eliminado exitosamente');
      loadSegments();
    } catch (error) {
      console.error('Error eliminando segmento:', error);
      toast.error('Error al eliminar el segmento');
    }
  };

  const handleFilterChange = (filterData: FilterGroup) => {
    setCurrentSegment(prev => ({
      ...prev,
      filter_json: filterData
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header con acciones principales */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Badge variant="outline" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>{segments.length} segmentos</span>
          </Badge>
        </div>
        
        <Button onClick={handleNewSegment} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Segmento
        </Button>
      </div>

      {/* Tabs principales */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Lista de Segmentos</span>
          </TabsTrigger>
          <TabsTrigger value="builder" className="flex items-center space-x-2">
            <Filter className="h-4 w-4" />
            <span>Constructor</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <SegmentList 
            segments={segments}
            loading={loading}
            onEdit={handleEditSegment}
            onDelete={handleDeleteSegment}
            onRefresh={loadSegments}
          />
        </TabsContent>

        <TabsContent value="builder" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Filter className="h-5 w-5 text-blue-600" />
                <span>Constructor de Segmentos</span>
              </CardTitle>
              <CardDescription>
                Crea segmentos personalizados combinando campos de clientes y eventos comportamentales
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Información básica del segmento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="segment-name">Nombre del Segmento *</Label>
                  <Input
                    id="segment-name"
                    placeholder="Ej: Clientes VIP activos"
                    value={currentSegment.name || ""}
                    onChange={(e) => setCurrentSegment(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="flex items-center space-x-2">
                    <span>Tipo de Segmento</span>
                  </Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={currentSegment.is_dynamic}
                      onCheckedChange={(checked) => setCurrentSegment(prev => ({ ...prev, is_dynamic: checked }))}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {currentSegment.is_dynamic ? "Dinámico (se recalcula)" : "Estático (fotografía)"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="segment-description">Descripción</Label>
                <Textarea
                  id="segment-description"
                  placeholder="Describe el propósito y criterios de este segmento..."
                  value={currentSegment.description || ""}
                  onChange={(e) => setCurrentSegment(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>

              {/* Constructor de filtros */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Filtros y Criterios</h3>
                  <Badge variant="secondary" className="flex items-center space-x-1">
                    <Eye className="h-3 w-3" />
                    <span>{previewCount} contactos</span>
                  </Badge>
                </div>
                
                <FilterBuilder
                  filterData={currentSegment.filter_json}
                  onChange={handleFilterChange}
                  onPreviewChange={setPreviewCount}
                  organizationId={organizationId}
                />
              </div>

              {/* Vista previa */}
              <SegmentPreview
                filterData={currentSegment.filter_json}
                organizationId={organizationId}
                onCountChange={setPreviewCount}
              />

              {/* Acciones */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm">
                    <Code className="h-4 w-4 mr-2" />
                    Ver SQL
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setCurrentSegment({
                        name: "",
                        description: "",
                        is_dynamic: true,
                        filter_json: { operator: 'AND', rules: [], groups: [] }
                      });
                      setIsEditing(false);
                    }}
                  >
                    Limpiar
                  </Button>
                  <Button 
                    onClick={handleSaveSegment}
                    disabled={loading || !currentSegment.name}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? "Guardando..." : (isEditing ? "Actualizar" : "Guardar")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
