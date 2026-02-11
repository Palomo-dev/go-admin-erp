'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Search, Image, Globe, Shield, Upload, X } from 'lucide-react';
import { WebsiteSettings } from '@/lib/services/websiteSettingsService';

interface BrandingSEOTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  onUploadImage: (file: File, type: 'favicon' | 'og_image') => Promise<string>;
  isSaving: boolean;
}

export default function BrandingSEOTab({ settings, onSave, onUploadImage, isSaving }: BrandingSEOTabProps) {
  const [formData, setFormData] = useState({
    meta_title: settings.meta_title || '',
    meta_description: settings.meta_description || '',
    meta_keywords: settings.meta_keywords || [],
    og_image_url: settings.og_image_url || '',
    favicon_url: settings.favicon_url || '',
    canonical_url: settings.canonical_url || '',
    google_site_verification: settings.google_site_verification || '',
    bing_site_verification: settings.bing_site_verification || '',
  });
  const [newKeyword, setNewKeyword] = useState('');
  const [isUploading, setIsUploading] = useState<'favicon' | 'og_image' | null>(null);

  const handleSave = async () => {
    await onSave(formData);
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !formData.meta_keywords.includes(newKeyword.trim())) {
      setFormData({
        ...formData,
        meta_keywords: [...formData.meta_keywords, newKeyword.trim()],
      });
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setFormData({
      ...formData,
      meta_keywords: formData.meta_keywords.filter((k) => k !== keyword),
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'favicon' | 'og_image') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(type);
    try {
      const url = await onUploadImage(file, type);
      setFormData({
        ...formData,
        [type === 'favicon' ? 'favicon_url' : 'og_image_url']: url,
      });
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsUploading(null);
    }
  };

  const titleLength = formData.meta_title.length;
  const descriptionLength = formData.meta_description.length;

  return (
    <div className="space-y-6">
      {/* Meta Tags */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Search className="h-5 w-5" />
            Meta Tags
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Configura la información que aparecerá en los motores de búsqueda
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="dark:text-gray-300">Título (Meta Title)</Label>
              <span className={`text-xs ${titleLength > 60 ? 'text-red-500' : 'text-gray-500'}`}>
                {titleLength}/60 caracteres
              </span>
            </div>
            <Input
              value={formData.meta_title}
              onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })}
              placeholder="Mi Empresa - Servicios de Calidad"
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              maxLength={70}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="dark:text-gray-300">Descripción (Meta Description)</Label>
              <span className={`text-xs ${descriptionLength > 160 ? 'text-red-500' : 'text-gray-500'}`}>
                {descriptionLength}/160 caracteres
              </span>
            </div>
            <Textarea
              value={formData.meta_description}
              onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
              placeholder="Descripción breve de tu negocio que aparecerá en los resultados de búsqueda..."
              rows={3}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Palabras Clave (Keywords)</Label>
            <div className="flex gap-2">
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Agregar palabra clave..."
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
              />
              <Button variant="outline" onClick={handleAddKeyword} className="dark:border-gray-600">
                Agregar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.meta_keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary" className="flex items-center gap-1">
                  {keyword}
                  <button onClick={() => handleRemoveKeyword(keyword)} className="ml-1 hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Preview de Google */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Vista previa en Google:</p>
            <div className="space-y-1">
              <p className="text-blue-600 dark:text-blue-400 text-lg hover:underline cursor-pointer">
                {formData.meta_title || 'Título de tu página'}
              </p>
              <p className="text-green-700 dark:text-green-500 text-sm">
                {formData.canonical_url || 'https://tu-sitio.com'}
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {formData.meta_description || 'Descripción de tu página que aparecerá aquí...'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Imágenes SEO */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Image className="h-5 w-5" />
            Imágenes SEO
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Favicon y Open Graph image para compartir en redes sociales
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Favicon */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Favicon</Label>
            <div className="flex items-center gap-4">
              {formData.favicon_url && (
                <img src={formData.favicon_url} alt="Favicon" className="h-8 w-8 object-contain" />
              )}
              <Input
                value={formData.favicon_url}
                onChange={(e) => setFormData({ ...formData, favicon_url: e.target.value })}
                placeholder="https://..."
                className="flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <div className="relative">
                <input
                  type="file"
                  accept=".ico,.png,.svg"
                  onChange={(e) => handleImageUpload(e, 'favicon')}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={isUploading === 'favicon'}
                />
                <Button variant="outline" disabled={isUploading === 'favicon'} className="dark:border-gray-600">
                  {isUploading === 'favicon' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Recomendado: 32x32px o 64x64px en formato .ico o .png</p>
          </div>

          {/* OG Image */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Imagen para Redes Sociales (OG Image)</Label>
            <div className="flex items-center gap-4">
              <Input
                value={formData.og_image_url}
                onChange={(e) => setFormData({ ...formData, og_image_url: e.target.value })}
                placeholder="https://..."
                className="flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'og_image')}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={isUploading === 'og_image'}
                />
                <Button variant="outline" disabled={isUploading === 'og_image'} className="dark:border-gray-600">
                  {isUploading === 'og_image' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {formData.og_image_url && (
              <img src={formData.og_image_url} alt="OG Image" className="mt-2 h-32 object-cover rounded-lg" />
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">Recomendado: 1200x630px para mejor visualización</p>
          </div>
        </CardContent>
      </Card>

      {/* URLs y Verificación */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Globe className="h-5 w-5" />
            URLs y Verificación
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            URL canónica y códigos de verificación de motores de búsqueda
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">URL Canónica</Label>
            <Input
              value={formData.canonical_url}
              onChange={(e) => setFormData({ ...formData, canonical_url: e.target.value })}
              placeholder="https://tu-sitio.com"
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              La URL principal de tu sitio para evitar contenido duplicado
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 dark:text-gray-300">
                <Shield className="h-4 w-4" />
                Google Site Verification
              </Label>
              <Input
                value={formData.google_site_verification}
                onChange={(e) => setFormData({ ...formData, google_site_verification: e.target.value })}
                placeholder="Código de verificación de Google"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 dark:text-gray-300">
                <Shield className="h-4 w-4" />
                Bing Site Verification
              </Label>
              <Input
                value={formData.bing_site_verification}
                onChange={(e) => setFormData({ ...formData, bing_site_verification: e.target.value })}
                placeholder="Código de verificación de Bing"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botón Guardar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
