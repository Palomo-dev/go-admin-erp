"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, Edit, Trash2, Search, Filter, Calendar, RefreshCw, Download, Play, Pause } from "lucide-react";
import { toast } from "sonner";

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

interface SegmentListProps {
  segments: Segment[];
  loading: boolean;
  onEdit: (segment: Segment) => void;
  onDelete: (segmentId: string) => void;
  onRefresh: () => void;
}

/**
 * Componente para mostrar y gestionar la lista de segmentos
 * Incluye filtros, búsqueda y acciones CRUD
 */
export default function SegmentList({ segments, loading, onEdit, onDelete, onRefresh }: SegmentListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "dynamic" | "static">("all");
  const [sortBy, setSortBy] = useState<"name" | "created_at" | "customer_count">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filtrar y ordenar segmentos
  const filteredSegments = segments
    .filter(segment => {
      const matchesSearch = segment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (segment.description && segment.description.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesType = filterType === "all" || 
                         (filterType === "dynamic" && segment.is_dynamic) ||
                         (filterType === "static" && !segment.is_dynamic);
      
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "customer_count":
          aValue = a.customer_count;
          bValue = b.customer_count;
          break;
        case "created_at":
        default:
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
      }
      
      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  const handleExportSegment = (segment: Segment) => {
    const exportData = {
      name: segment.name,
      description: segment.description,
      filter_json: segment.filter_json,
      is_dynamic: segment.is_dynamic,
      customer_count: segment.customer_count,
      created_at: segment.created_at
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `segmento_${segment.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Segmento exportado exitosamente');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFilterCount = (filterJson: any): number => {
    if (!filterJson) return 0;
    const countRules = (group: any): number => {
      let count = group.rules ? group.rules.length : 0;
      if (group.groups) {
        count += group.groups.reduce((acc: number, subGroup: any) => acc + countRules(subGroup), 0);
      }
      return count;
    };
    return countRules(filterJson);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controles de filtrado y búsqueda */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-blue-600" />
            <span>Gestión de Segmentos</span>
          </CardTitle>
          <CardDescription>
            Administra tus segmentos de clientes y controla su configuración
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            {/* Búsqueda */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar segmentos por nombre o descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Filtros */}
            <div className="flex gap-2">
              <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="dynamic">Dinámicos</SelectItem>
                  <SelectItem value="static">Estáticos</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Fecha</SelectItem>
                  <SelectItem value="name">Nombre</SelectItem>
                  <SelectItem value="customer_count">Contactos</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              >
                {sortOrder === "asc" ? "↑" : "↓"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Estadísticas */}
          <div className="flex items-center space-x-4 mt-4 pt-4 border-t">
            <Badge variant="outline">
              Total: {segments.length}
            </Badge>
            <Badge variant="outline">
              Dinámicos: {segments.filter(s => s.is_dynamic).length}
            </Badge>
            <Badge variant="outline">
              Estáticos: {segments.filter(s => !s.is_dynamic).length}
            </Badge>
            <Badge variant="outline">
              Contactos totales: {segments.reduce((acc, s) => acc + s.customer_count, 0).toLocaleString()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Lista de segmentos */}
      <div className="grid gap-4">
        {filteredSegments.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                {searchTerm || filterType !== "all" ? "No se encontraron segmentos" : "No hay segmentos creados"}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {searchTerm || filterType !== "all" 
                  ? "Intenta ajustar los filtros de búsqueda"
                  : "Crea tu primer segmento para comenzar a organizar tus contactos"
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredSegments.map((segment) => (
            <Card key={segment.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {segment.name}
                      </h3>
                      
                      <Badge 
                        variant={segment.is_dynamic ? "default" : "secondary"}
                        className={segment.is_dynamic ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
                      >
                        {segment.is_dynamic ? (
                          <div className="flex items-center space-x-1">
                            <Play className="h-3 w-3" />
                            <span>Dinámico</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1">
                            <Pause className="h-3 w-3" />
                            <span>Estático</span>
                          </div>
                        )}
                      </Badge>

                      <Badge variant="outline" className="flex items-center space-x-1">
                        <Users className="h-3 w-3" />
                        <span>{segment.customer_count.toLocaleString()}</span>
                      </Badge>

                      <Badge variant="outline" className="flex items-center space-x-1">
                        <Filter className="h-3 w-3" />
                        <span>{getFilterCount(segment.filter_json)} filtros</span>
                      </Badge>
                    </div>

                    {segment.description && (
                      <p className="text-gray-600 dark:text-gray-400 mb-3">
                        {segment.description}
                      </p>
                    )}

                    <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>Creado: {formatDate(segment.created_at)}</span>
                      </div>
                      {segment.last_run_at && (
                        <div className="flex items-center space-x-1">
                          <RefreshCw className="h-4 w-4" />
                          <span>Última ejecución: {formatDate(segment.last_run_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center space-x-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(segment)}
                      className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportSegment(segment)}
                      className="text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-900/20"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Exportar
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Eliminar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar segmento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará permanentemente el segmento
                            "{segment.name}" y todos sus filtros configurados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDelete(segment.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
