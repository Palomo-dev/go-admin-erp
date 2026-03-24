'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Upload, Image, Video, Link, Type } from 'lucide-react';
import { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { useTranslations } from 'next-intl';

interface BrandingHeroTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  onUploadImage: (file: File, type: 'hero') => Promise<string>;
  isSaving: boolean;
}

export default function BrandingHeroTab({ settings, onSave, onUploadImage, isSaving }: BrandingHeroTabProps) {
  const t = useTranslations('branding.hero');
  const tc = useTranslations('branding.common');
  const [formData, setFormData] = useState({
    hero_title: settings.hero_title || '',
    hero_subtitle: settings.hero_subtitle || '',
    hero_image_url: settings.hero_image_url || '',
    hero_video_url: settings.hero_video_url || '',
    hero_cta_text: settings.hero_cta_text || 'Contáctanos',
    hero_cta_url: settings.hero_cta_url || '',
  });
  const [isUploading, setIsUploading] = useState(false);

  const handleSave = async () => {
    await onSave(formData);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await onUploadImage(file, 'hero');
      setFormData({ ...formData, hero_image_url: url });
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Título y Subtítulo */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Type className="h-5 w-5" />
            {t('textsTitle')}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('textsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">{t('mainTitle')}</Label>
            <Input
              value={formData.hero_title}
              onChange={(e) => setFormData({ ...formData, hero_title: e.target.value })}
              placeholder={t('mainTitlePlaceholder')}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="dark:text-gray-300">{t('subtitle')}</Label>
            <Textarea
              value={formData.hero_subtitle}
              onChange={(e) => setFormData({ ...formData, hero_subtitle: e.target.value })}
              placeholder={t('subtitlePlaceholder')}
              rows={3}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* Imagen/Video */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Image className="h-5 w-5" />
            {t('mediaTitle')}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('mediaDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">{t('bgImage')}</Label>
            <div className="flex items-center gap-4">
              <Input
                value={formData.hero_image_url}
                onChange={(e) => setFormData({ ...formData, hero_image_url: e.target.value })}
                placeholder="https://ejemplo.com/imagen.jpg"
                className="flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={isUploading}
                />
                <Button variant="outline" disabled={isUploading} className="dark:border-gray-600">
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      {t('upload')}
                    </>
                  )}
                </Button>
              </div>
            </div>
            {formData.hero_image_url && (
              <div className="mt-4 relative rounded-lg overflow-hidden">
                <img
                  src={formData.hero_image_url}
                  alt="Hero preview"
                  className="w-full h-48 object-cover"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2 dark:text-gray-300">
              <Video className="h-4 w-4" />
              {t('videoLabel')}
            </Label>
            <Input
              value={formData.hero_video_url}
              onChange={(e) => setFormData({ ...formData, hero_video_url: e.target.value })}
              placeholder="https://youtube.com/watch?v=... o https://vimeo.com/..."
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('videoHint')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Link className="h-5 w-5" />
            {t('ctaTitle')}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('ctaDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">{t('ctaBtnText')}</Label>
              <Input
                value={formData.hero_cta_text}
                onChange={(e) => setFormData({ ...formData, hero_cta_text: e.target.value })}
                placeholder={t('ctaBtnPlaceholder')}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">{t('ctaBtnUrl')}</Label>
              <Input
                value={formData.hero_cta_url}
                onChange={(e) => setFormData({ ...formData, hero_cta_url: e.target.value })}
                placeholder="/contacto o https://..."
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">{tc('saveChanges').split(' ')[0]}</CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            className="relative rounded-lg overflow-hidden h-64 flex items-center justify-center"
            style={{
              backgroundImage: formData.hero_image_url ? `url(${formData.hero_image_url})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative z-10 text-center text-white px-4">
              <h1 className="text-3xl font-bold mb-2">
                {formData.hero_title || t('previewTitleFallback')}
              </h1>
              <p className="text-lg mb-4 opacity-90">
                {formData.hero_subtitle || t('previewSubtitleFallback')}
              </p>
              {formData.hero_cta_text && (
                <button className="px-6 py-2 bg-blue-600 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  {formData.hero_cta_text}
                </button>
              )}
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
              {tc('saving')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {tc('saveChanges')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
