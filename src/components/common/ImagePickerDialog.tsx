'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  Search,
  Sparkles,
  Images,
  Loader2,
  Link2,
  Check,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

const STORAGE_BUCKET = 'organization_images';
const PAGE_SIZE = 12;

type SortOrder = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

interface ImagePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  organizationId?: number;
  title?: string;
}

interface GalleryImage {
  id: number;
  url: string;
  name: string;
  created_at: string;
}

export default function ImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
  organizationId,
  title = 'Agrega o escoge una imagen',
}: ImagePickerDialogProps) {
  const [activeTab, setActiveTab] = useState('upload');

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gallery state
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [gallerySearch, setGallerySearch] = useState('');
  const [gallerySortOrder, setGallerySortOrder] = useState<SortOrder>('newest');
  const [galleryPage, setGalleryPage] = useState(0);
  const [galleryTotal, setGalleryTotal] = useState(0);

  // AI state
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [aiError, setAiError] = useState('');

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GalleryImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setUploadedUrl('');
      setUrlInput('');
      setGeneratedUrl('');
      setAiPrompt('');
      setAiError('');
      setIsDragging(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [open]);

  // ---- GALLERY: query shared_images + resolve from organization_images bucket ----
  const loadGalleryImages = useCallback(async (page: number, sort: SortOrder, search: string) => {
    setIsLoadingGallery(true);
    try {
      const orgId = organizationId || getOrganizationId();
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Build query
      let query = supabase
        .from('shared_images')
        .select('id, storage_path, file_name, created_at', { count: 'exact' })
        .or(`organization_id.eq.${orgId},is_public.eq.true`);

      // Text filter
      if (search) {
        query = query.ilike('file_name', `%${search}%`);
      }

      // Sort
      switch (sort) {
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
        case 'oldest':
          query = query.order('created_at', { ascending: true });
          break;
        case 'name_asc':
          query = query.order('file_name', { ascending: true });
          break;
        case 'name_desc':
          query = query.order('file_name', { ascending: false });
          break;
      }

      // Pagination
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setGalleryTotal(count || 0);

      // Resolve public URLs from the correct bucket
      const mapped: GalleryImage[] = (data || [])
        .filter((img) => img.storage_path)
        .map((img) => {
          const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(img.storage_path);

          return {
            id: img.id,
            url: urlData?.publicUrl || '',
            name: img.file_name,
            created_at: img.created_at,
          };
        })
        .filter((img) => img.url);

      setGalleryImages(mapped);
    } catch (error) {
      console.error('Error loading gallery:', error);
    } finally {
      setIsLoadingGallery(false);
    }
  }, [organizationId]);

  // Load gallery when tab opens or filters change
  useEffect(() => {
    if (open && activeTab === 'gallery') {
      loadGalleryImages(galleryPage, gallerySortOrder, gallerySearch);
    }
  }, [open, activeTab, galleryPage, gallerySortOrder, loadGalleryImages]);

  // Debounced search in gallery
  useEffect(() => {
    if (!open || activeTab !== 'gallery') return;
    const timer = setTimeout(() => {
      setGalleryPage(0);
      loadGalleryImages(0, gallerySortOrder, gallerySearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [gallerySearch]);

  // ---- SEARCH TAB ----
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const orgId = organizationId || getOrganizationId();
      const { data, error } = await supabase
        .from('shared_images')
        .select('id, storage_path, file_name, created_at')
        .or(`organization_id.eq.${orgId},is_public.eq.true`)
        .ilike('file_name', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const mapped = (data || [])
        .filter((img) => img.storage_path)
        .map((img) => {
          const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(img.storage_path);
          return {
            id: img.id,
            url: urlData?.publicUrl || '',
            name: img.file_name,
            created_at: img.created_at,
          };
        })
        .filter((img) => img.url);

      setSearchResults(mapped);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setIsSearching(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!open || activeTab !== 'search') return;
    const timer = setTimeout(() => handleSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, open, activeTab, handleSearch]);

  // ---- UPLOAD: upload to organization_images bucket + register in shared_images ----
  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return;

    setIsUploading(true);
    try {
      const orgId = organizationId || getOrganizationId();
      const fileName = `${orgId}/${Date.now()}-${file.name}`;

      // Upload to correct bucket
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      // Register in shared_images
      await supabase.from('shared_images').insert({
        organization_id: orgId,
        storage_path: fileName,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        is_public: false,
        tags: [],
      });

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName);

      if (urlData?.publicUrl) setUploadedUrl(urlData.publicUrl);
    } catch (error) {
      console.error('Error uploading:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleFetchUrl = () => {
    if (urlInput.trim()) {
      handleSelect(urlInput.trim());
    }
  };

  // ---- AI GENERATE ----
  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;

    setIsGenerating(true);
    setAiError('');
    setGeneratedUrl('');
    try {
      const orgId = organizationId || getOrganizationId();
      const res = await fetch('/api/ai-assistant/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: aiPrompt,
          description: 'Professional image for website',
          organizationId: orgId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || 'Error generando imagen');
        return;
      }
      if (data.imageUrl) {
        setGeneratedUrl(data.imageUrl);
      }
    } catch (error: any) {
      setAiError(error?.message || 'Error generando imagen');
    } finally {
      setIsGenerating(false);
    }
  };

  // ---- SELECT ----
  const handleSelect = (url: string) => {
    onSelect(url);
    onOpenChange(false);
  };

  // ---- PAGINATION HELPERS ----
  const totalPages = Math.ceil(galleryTotal / PAGE_SIZE);
  const canPrev = galleryPage > 0;
  const canNext = galleryPage < totalPages - 1;

  // ---- IMAGE GRID (reusable) ----
  const renderImageGrid = (images: GalleryImage[]) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {images.map((img) => (
        <button
          key={img.id}
          onClick={() => handleSelect(img.url)}
          className="group relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all bg-gray-100 dark:bg-gray-800"
        >
          <img
            src={img.url}
            alt={img.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
            <Check className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-[10px] text-white truncate">{img.name}</p>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0 gap-0 dark:bg-gray-900 dark:border-gray-700">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-lg dark:text-white">{title}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b dark:border-gray-700 bg-transparent px-4 h-auto gap-1 shrink-0">
            <TabsTrigger
              value="upload"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md px-4 py-2 text-sm dark:text-gray-300 dark:data-[state=active]:bg-blue-600"
            >
              <Upload className="h-4 w-4 mr-2" />
              Subir
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md px-4 py-2 text-sm dark:text-gray-300 dark:data-[state=active]:bg-blue-600"
            >
              <Search className="h-4 w-4 mr-2" />
              Búsqueda
            </TabsTrigger>
            <TabsTrigger
              value="generator"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md px-4 py-2 text-sm dark:text-gray-300 dark:data-[state=active]:bg-blue-600"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generador
            </TabsTrigger>
            <TabsTrigger
              value="gallery"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md px-4 py-2 text-sm dark:text-gray-300 dark:data-[state=active]:bg-blue-600"
            >
              <Images className="h-4 w-4 mr-2" />
              Galería
            </TabsTrigger>
          </TabsList>

          {/* ═══════ TAB: SUBIR ═══════ */}
          <TabsContent value="upload" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            <div className="space-y-4">
              <Label className="text-sm font-medium dark:text-gray-300">Subir desde el dispositivo</Label>

              {/* Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative flex flex-col items-center justify-center h-56 rounded-lg border-2 border-dashed cursor-pointer transition-all
                  ${isDragging
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 bg-gray-50 dark:bg-gray-800/50'
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />

                {isUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Subiendo imagen...</p>
                  </div>
                ) : uploadedUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <img src={uploadedUrl} alt="Subida" className="h-32 object-contain rounded" />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleSelect(uploadedUrl); }}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Check className="h-4 w-4 mr-1" /> Usar imagen
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setUploadedUrl(''); }}
                        className="dark:border-gray-600 dark:text-gray-300"
                      >
                        Subir otra
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                    <p className="text-sm font-medium dark:text-gray-300">
                      Elige o Arrastra un Archivo Aquí
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      PNG, JPG, WEBP hasta 5MB
                    </p>
                  </div>
                )}
              </div>

              {/* URL upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium dark:text-gray-300">Subir desde URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://website.com/image.jpg"
                    className="flex-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
                  />
                  <Button
                    onClick={handleFetchUrl}
                    disabled={!urlInput.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Link2 className="h-4 w-4 mr-1" />
                    Usar URL
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ═══════ TAB: BÚSQUEDA ═══════ */}
          <TabsContent value="search" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            <div className="space-y-4">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre de archivo..."
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />

              {isSearching ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : searchQuery && searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
                  <Search className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No se encontraron imágenes para &quot;{searchQuery}&quot;</p>
                </div>
              ) : searchQuery ? (
                renderImageGrid(searchResults)
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
                  <Search className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Escribe para buscar en las imágenes de tu organización</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══════ TAB: GENERADOR IA ═══════ */}
          <TabsContent value="generator" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium dark:text-gray-300">Describe la imagen que deseas generar</Label>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ej: Imagen profesional de un hotel con piscina al atardecer, estilo moderno..."
                  rows={3}
                  className="resize-none dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !aiPrompt.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generando imagen con IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generar Imagen (5 créditos IA)
                  </>
                )}
              </Button>

              {aiError && (
                <p className="text-sm text-red-500 dark:text-red-400">{aiError}</p>
              )}

              {generatedUrl && (
                <div className="space-y-3">
                  <div className="rounded-lg overflow-hidden border dark:border-gray-700">
                    <img src={generatedUrl} alt="Generada por IA" className="w-full h-56 object-cover" />
                  </div>
                  <Button
                    onClick={() => handleSelect(generatedUrl)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Usar esta imagen
                  </Button>
                </div>
              )}

              {!generatedUrl && !isGenerating && (
                <div className="flex flex-col items-center justify-center h-32 rounded-lg border border-dashed dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <Sparkles className="h-6 w-6 mb-2 opacity-50" />
                  <p className="text-xs text-center">La imagen generada aparecerá aquí</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══════ TAB: GALERÍA ═══════ */}
          <TabsContent value="gallery" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            <div className="space-y-4">
              {/* Filters bar */}
              <div className="flex gap-2">
                <Input
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  placeholder="Filtrar por nombre..."
                  className="flex-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
                <Select value={gallerySortOrder} onValueChange={(v) => { setGallerySortOrder(v as SortOrder); setGalleryPage(0); }}>
                  <SelectTrigger className="w-[160px] dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Más recientes</SelectItem>
                    <SelectItem value="oldest">Más antiguas</SelectItem>
                    <SelectItem value="name_asc">Nombre A-Z</SelectItem>
                    <SelectItem value="name_desc">Nombre Z-A</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoadingGallery ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : galleryImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
                  <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">
                    {gallerySearch ? 'No se encontraron imágenes' : 'No hay imágenes en la galería'}
                  </p>
                </div>
              ) : (
                <>
                  {renderImageGrid(galleryImages)}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {galleryPage * PAGE_SIZE + 1}–{Math.min((galleryPage + 1) * PAGE_SIZE, galleryTotal)} de {galleryTotal}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGalleryPage((p) => p - 1)}
                          disabled={!canPrev}
                          className="h-8 w-8 p-0 dark:border-gray-600"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="flex items-center px-2 text-xs text-gray-600 dark:text-gray-400">
                          {galleryPage + 1} / {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGalleryPage((p) => p + 1)}
                          disabled={!canNext}
                          className="h-8 w-8 p-0 dark:border-gray-600"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
