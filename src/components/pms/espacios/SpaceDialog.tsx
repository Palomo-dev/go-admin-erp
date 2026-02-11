'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, ImagePlus, Star, Trash2, Loader2, X, Tag, FileText, MapPin,
  Activity, Image as ImageIcon, Settings2, AlertTriangle, Wifi, Tv, Lock, Car,
  Bath, Flame, Wind, Phone, Laptop, Waves, Dumbbell, Coffee, PawPrint, Circle,
  Sparkles, Wand2,
} from 'lucide-react';
import spaceImageService, { SpaceImage } from '@/lib/services/spaceImageService';
import spaceServicesService, { OrgServiceView } from '@/lib/services/spaceServicesService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Space, SpaceType, SpaceStatus } from '@/lib/services/spacesService';

// Mapa de iconos lucide para servicios
const SVC_ICON_MAP: Record<string, React.ElementType> = {
  wifi: Wifi, tv: Tv, lock: Lock, car: Car, bath: Bath, flame: Flame,
  wind: Wind, phone: Phone, laptop: Laptop, waves: Waves, dumbbell: Dumbbell,
  coffee: Coffee, 'paw-print': PawPrint,
};

interface SpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: Space | null;
  spaceTypes: SpaceType[];
  availableZones?: string[];
  onSave: (data: any) => Promise<any>;
  onCreateType?: () => void;
  organizationId?: number;
  userId?: string;
}

const STATUS_OPTIONS: { value: SpaceStatus; label: string }[] = [
  { value: 'available', label: 'Disponible' },
  { value: 'occupied', label: 'Ocupado' },
  { value: 'reserved', label: 'Reservado' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'cleaning', label: 'Limpieza' },
  { value: 'out_of_order', label: 'Fuera de Servicio' },
];

export function SpaceDialog({ open, onOpenChange, space, spaceTypes, availableZones = [], onSave, onCreateType, organizationId, userId }: SpaceDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewZoneInput, setShowNewZoneInput] = useState(false);
  const [images, setImages] = useState<SpaceImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imgActionId, setImgActionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Servicios
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [orgServices, setOrgServices] = useState<OrgServiceView[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  // IA
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingImg, setGeneratingImg] = useState(false);

  const [formData, setFormData] = useState({
    label: '',
    description: '',
    space_type_id: '',
    floor_zone: '',
    status: 'available' as SpaceStatus,
    maintenance_notes: '',
  });

  // Reset solo al abrir el dialog (no al cambiar space ref durante save)
  useEffect(() => {
    if (!open) return;
    if (space) {
      setFormData({
        label: space.label,
        description: space.description || '',
        space_type_id: space.space_type_id,
        floor_zone: space.floor_zone || '',
        status: space.status,
        maintenance_notes: space.maintenance_notes || '',
      });
      spaceImageService.getImages(space.id).then(setImages).catch(() => setImages([]));
    } else {
      setFormData({ label: '', description: '', space_type_id: '', floor_zone: '', status: 'available', maintenance_notes: '' });
      setImages([]);
    }
    setPendingFiles([]);
    setSelectedServiceIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cargar servicios de la org (solo al abrir el dialog)
  useEffect(() => {
    if (!organizationId || !open) return;
    const load = async () => {
      setServicesLoading(true);
      const data = await spaceServicesService.getActiveOrgServices(organizationId);
      setOrgServices(data);
      if (space) {
        const ids = await spaceServicesService.getSpaceServiceIds(space.id);
        setSelectedServiceIds(ids);
      }
      setServicesLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, open]);

  // ── Imágenes: modo editar ─────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !organizationId || !userId) return;

    if (space) {
      // Modo editar: subir directo
      setUploading(true);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) continue;
          await spaceImageService.uploadImage(file, space.id, organizationId, userId);
        }
        const updated = await spaceImageService.getImages(space.id);
        setImages(updated);
      } catch (err) {
        console.error('Error uploading:', err);
      } finally {
        setUploading(false);
      }
    } else {
      // Modo crear: guardar archivos pendientes
      const newFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024) {
          newFiles.push(f);
        }
      }
      setPendingFiles((prev) => [...prev, ...newFiles].slice(0, 10));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePending = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetPrimary = async (img: SpaceImage) => {
    if (!space) return;
    setImgActionId(img.id);
    await spaceImageService.setPrimary(img.id, space.id);
    const updated = await spaceImageService.getImages(space.id);
    setImages(updated);
    setImgActionId(null);
  };

  const handleDeleteImage = async (img: SpaceImage) => {
    setImgActionId(img.id);
    await spaceImageService.deleteImage(img.id);
    setImages((prev) => prev.filter((i) => i.id !== img.id));
    setImgActionId(null);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.label || !formData.space_type_id) return;

    setIsSubmitting(true);
    try {
      const result = await onSave(formData);

      // Obtener el ID del espacio (nuevo o existente)
      const targetSpaceId = space?.id || result?.id;

      // Subir imágenes pendientes (modo crear)
      if (targetSpaceId && pendingFiles.length > 0 && organizationId && userId) {
        for (const file of pendingFiles) {
          await spaceImageService.uploadImage(file, targetSpaceId, organizationId, userId);
        }
      }

      // Sync servicios (incluyendo array vacío para limpiar deseleccionados)
      if (targetSpaceId && organizationId) {
        await spaceServicesService.syncSpaceServices(targetSpaceId, selectedServiceIds, organizationId);
      }

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── IA: Generar descripción ──────────────────────────────────────────────
  const handleAIDescription = async () => {
    if (!formData.label) {
      toast({ title: 'Escribe un nombre primero', description: 'La IA necesita al menos el nombre del espacio para generar la descripción.', variant: 'destructive' });
      return;
    }
    setGeneratingDesc(true);
    try {
      const selectedType = spaceTypes.find((t) => t.id === formData.space_type_id);
      const selectedSvcNames = orgServices.filter((s) => selectedServiceIds.includes(s.org_service_id)).map((s) => s.name).join(', ');
      const res = await fetch('/api/ai-assistant/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: formData.label,
          currentDescription: formData.description,
          type: 'space_description',
          organizationId,
          spaceType: selectedType?.name || '',
          zone: formData.floor_zone || '',
          services: selectedSvcNames || '',
        }),
      });
      if (!res.ok) throw new Error('Error generando descripción');
      const data = await res.json();
      if (data.improvedText) {
        setFormData((prev) => ({ ...prev, description: data.improvedText }));
        toast({ title: 'Descripción generada', description: 'Puedes editarla manualmente si lo deseas.' });
      }
    } catch (err) {
      console.error('Error AI description:', err);
      toast({ title: 'Error', description: 'No se pudo generar la descripción con IA.', variant: 'destructive' });
    } finally {
      setGeneratingDesc(false);
    }
  };

  // ── IA: Generar imagen ────────────────────────────────────────────────────
  const handleAIImage = async () => {
    if (!formData.label || !organizationId) {
      toast({ title: 'Datos insuficientes', description: 'Escribe un nombre y selecciona un tipo para generar la imagen.', variant: 'destructive' });
      return;
    }
    setGeneratingImg(true);
    try {
      const selectedType = spaceTypes.find((t) => t.id === formData.space_type_id);
      const res = await fetch('/api/ai-assistant/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: `${formData.label} - ${selectedType?.name || 'Habitación'}`,
          description: formData.description || `Espacio de hospedaje tipo ${selectedType?.name || 'habitación'}`,
          organizationId,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error generando imagen');
      }
      const data = await res.json();
      if (data.imageUrl) {
        // Descargar la imagen y crear un File para pendingFiles
        const imgRes = await fetch(data.imageUrl);
        const blob = await imgRes.blob();
        const file = new File([blob], `ai-${Date.now()}.png`, { type: 'image/png' });

        if (space) {
          // Modo editar: subir directo
          await spaceImageService.uploadImage(file, space.id, organizationId, userId!);
          const updated = await spaceImageService.getImages(space.id);
          setImages(updated);
        } else {
          // Modo crear: agregar a pendientes
          setPendingFiles((prev) => [...prev, file].slice(0, 10));
        }
        toast({ title: 'Imagen generada con IA', description: data.isTemporary ? 'URL temporal (1 hora). Se guardará al crear el espacio.' : 'Imagen guardada.' });
      }
    } catch (err: any) {
      console.error('Error AI image:', err);
      toast({ title: 'Error', description: err.message || 'No se pudo generar la imagen con IA.', variant: 'destructive' });
    } finally {
      setGeneratingImg(false);
    }
  };

  // ── Toggle servicio ───────────────────────────────────────────────────────
  const handleServiceToggle = (orgServiceId: string, checked: boolean) => {
    if (checked) {
      setSelectedServiceIds((prev) => [...prev, orgServiceId]);
    } else {
      setSelectedServiceIds((prev) => prev.filter((id) => id !== orgServiceId));
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const SectionTitle = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col p-0">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {space ? 'Editar Espacio' : 'Nuevo Espacio'}
              </DialogTitle>
              <DialogDescription>
                {space ? 'Modifica los detalles del espacio' : 'Crea un nuevo espacio en el inventario'}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable content */}
          <ScrollArea className="flex-1 px-6 pb-2" style={{ maxHeight: 'calc(90vh - 160px)' }}>
            <div className="space-y-4 py-2">

              {/* ── Información General ──────────────────────────────────── */}
              <SectionTitle icon={Tag} label="Información General" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Etiqueta */}
                <div className="grid gap-1.5">
                  <Label htmlFor="label" className="text-xs">
                    Etiqueta <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="label"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder="Ej: Habitación 101"
                    required
                  />
                </div>

                {/* Tipo */}
                <div className="grid gap-1.5">
                  <Label htmlFor="space_type_id" className="text-xs">
                    Tipo <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.space_type_id}
                    onValueChange={(value) => setFormData({ ...formData, space_type_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {spaceTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}{type.category && ` (${type.category.display_name})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {onCreateType && (
                    <Button type="button" variant="ghost" size="sm" onClick={onCreateType} className="w-full text-xs h-7">
                      <Plus className="h-3 w-3 mr-1" /> Crear Nuevo Tipo
                    </Button>
                  )}
                </div>
              </div>

              {/* Descripción */}
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description" className="text-xs flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-gray-400" /> Descripción
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAIDescription}
                    disabled={generatingDesc || !formData.label}
                    className="h-6 px-2 text-[10px] text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 gap-1"
                  >
                    {generatingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {generatingDesc ? 'Generando...' : 'Generar con IA'}
                  </Button>
                </div>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ej: Habitación con vista al mar, cama king, balcón privado"
                  rows={2}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Piso/Zona */}
                <div className="grid gap-1.5">
                  <Label htmlFor="floor_zone" className="text-xs flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" /> Piso/Zona
                  </Label>
                  {showNewZoneInput ? (
                    <div className="space-y-1.5">
                      <Input
                        id="floor_zone"
                        value={formData.floor_zone}
                        onChange={(e) => setFormData({ ...formData, floor_zone: e.target.value })}
                        placeholder="Ej: Piso 1, Zona A"
                        autoFocus
                      />
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setShowNewZoneInput(false); setFormData({ ...formData, floor_zone: '' }); }} className="w-full text-xs h-7">
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={formData.floor_zone}
                      onValueChange={(value) => {
                        if (value === '__create_new__') { setShowNewZoneInput(true); setFormData({ ...formData, floor_zone: '' }); }
                        else setFormData({ ...formData, floor_zone: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una zona" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableZones.map((zone) => (
                          <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                        ))}
                        <SelectItem value="__create_new__">
                          <span className="flex items-center"><Plus className="h-3 w-3 mr-1" /> Crear Nueva Zona</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Estado */}
                <div className="grid gap-1.5">
                  <Label htmlFor="status" className="text-xs flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-gray-400" /> Estado
                  </Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: SpaceStatus) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Imágenes ─────────────────────────────────────────────── */}
              {organizationId && userId && (
                <>
                  <div className="flex items-center justify-between">
                    <SectionTitle icon={ImageIcon} label="Imágenes" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAIImage}
                      disabled={generatingImg || !formData.label}
                      className="h-6 px-2 text-[10px] text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 gap-1 flex-shrink-0"
                    >
                      {generatingImg ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      {generatingImg ? 'Generando...' : 'Generar con IA'}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Imágenes ya subidas (modo editar) */}
                    {images.map((img) => (
                      <div key={img.id} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
                        <img src={img.image_url} alt={img.alt_text || ''} className="w-full h-full object-cover" />
                        {img.is_primary && (
                          <div className="absolute top-0 left-0 bg-blue-600 rounded-br-lg px-1 py-0.5">
                            <Star className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                          {imgActionId === img.id ? (
                            <Loader2 className="h-4 w-4 text-white animate-spin" />
                          ) : (
                            <>
                              {!img.is_primary && (
                                <button type="button" onClick={() => handleSetPrimary(img)} className="p-1 bg-black/50 rounded-md text-white hover:bg-blue-600 transition-colors" title="Hacer portada">
                                  <Star className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button type="button" onClick={() => handleDeleteImage(img)} className="p-1 bg-black/50 rounded-md text-white hover:bg-red-600 transition-colors" title="Eliminar">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Previews de archivos pendientes (modo crear) */}
                    {pendingFiles.map((file, idx) => (
                      <div key={`pending-${idx}`} className="relative group w-20 h-20 rounded-lg overflow-hidden border-2 border-dashed border-blue-300 dark:border-blue-700 shadow-sm">
                        <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <button type="button" onClick={() => handleRemovePending(idx)} className="p-1 bg-black/50 rounded-md text-white hover:bg-red-600 transition-colors" title="Quitar">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-blue-600/80 text-[9px] text-white text-center py-0.5">
                          Pendiente
                        </div>
                      </div>
                    ))}

                    {/* Botón subir */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors gap-1"
                    >
                      {uploading ? (
                        <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                      ) : (
                        <>
                          <ImagePlus className="h-5 w-5 text-gray-400" />
                          <span className="text-[9px] text-gray-400">Subir</span>
                        </>
                      )}
                    </button>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    JPG, PNG, WebP · Máx 5MB · Hasta 10 imágenes
                    {!space && pendingFiles.length > 0 && (
                      <span className="text-blue-500 ml-1">· {pendingFiles.length} pendiente{pendingFiles.length > 1 ? 's' : ''} (se subirán al crear)</span>
                    )}
                  </p>
                </>
              )}

              {/* ── Servicios ────────────────────────────────────────────── */}
              {organizationId && (
                <>
                  <SectionTitle icon={Settings2} label="Servicios" />
                  {servicesLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 py-1">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800">
                          <div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                          <div className="h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" style={{ width: `${50 + i * 10}px` }} />
                        </div>
                      ))}
                    </div>
                  ) : orgServices.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">
                      No hay servicios configurados. Configúralos en PMS → Servicios.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-1">
                      {orgServices.map((svc) => {
                        const IconComp = svc.icon ? (SVC_ICON_MAP[svc.icon] || Circle) : Circle;
                        const isChecked = selectedServiceIds.includes(svc.org_service_id);
                        return (
                          <label
                            key={svc.org_service_id}
                            className={`flex items-center gap-2 cursor-pointer rounded-md px-2.5 py-2 border transition-colors ${
                              isChecked
                                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => handleServiceToggle(svc.org_service_id, !!checked)}
                              className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                            <IconComp className={`h-3.5 w-3.5 flex-shrink-0 ${isChecked ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                            <span className={`text-xs truncate ${isChecked ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                              {svc.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── Notas de mantenimiento ────────────────────────────────── */}
              {(formData.status === 'maintenance' || formData.status === 'out_of_order') && (
                <>
                  <SectionTitle icon={AlertTriangle} label="Notas de Mantenimiento" />
                  <Textarea
                    id="maintenance_notes"
                    value={formData.maintenance_notes}
                    onChange={(e) => setFormData({ ...formData, maintenance_notes: e.target.value })}
                    placeholder="Describe el problema o mantenimiento requerido"
                    rows={3}
                    className="resize-none"
                  />
                </>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-[100px]">
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</>
              ) : (
                space ? 'Actualizar' : 'Crear'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
