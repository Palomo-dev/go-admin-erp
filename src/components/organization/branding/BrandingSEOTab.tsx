'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, Search, Image, Globe, Shield, X, Info, ImagePlus, Loader2, Sparkles, ExternalLink, Link2 } from 'lucide-react';
import { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import ImagePickerDialog from '@/components/common/ImagePickerDialog';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface BrandingSEOTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  onUploadImage: (file: File, type: 'favicon' | 'og_image') => Promise<string>;
  isSaving: boolean;
}

export default function BrandingSEOTab({ settings, onSave, onUploadImage, isSaving }: BrandingSEOTabProps) {
  const t = useTranslations('branding.seo');
  const tc = useTranslations('branding.common');
  const { organization } = useOrganization();
  const [formData, setFormData] = useState({
    meta_keywords: settings.meta_keywords || [],
    favicon_url: settings.favicon_url || '',
    canonical_url: settings.canonical_url || '',
    google_site_verification: settings.google_site_verification || '',
    bing_site_verification: settings.bing_site_verification || '',
  });
  const [newKeyword, setNewKeyword] = useState('');
  const [showFaviconPicker, setShowFaviconPicker] = useState(false);

  // IA Keywords
  const [aiKeywords, setAiKeywords] = useState<string[]>([]);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  // Dominio/Subdominio
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [customDomain, setCustomDomain] = useState<string | null>(null);

  // Cargar info de dominio
  const loadDomainInfo = useCallback(async () => {
    if (!organization?.id) return;
    try {
      const { data } = await supabase
        .from('organizations')
        .select('subdomain, custom_domain')
        .eq('id', organization.id)
        .single();
      if (data) {
        setSubdomain(data.subdomain);
        setCustomDomain(data.custom_domain);
        // Auto-popular canonical_url si está vacío
        if (!formData.canonical_url) {
          const url = data.custom_domain
            ? `https://${data.custom_domain}`
            : data.subdomain
              ? `https://${data.subdomain}.goadmin.io`
              : '';
          if (url) setFormData(prev => ({ ...prev, canonical_url: url }));
        }
      }
    } catch (err) {
      console.error('Error cargando info de dominio:', err);
    }
  }, [organization?.id]);

  useEffect(() => {
    loadDomainInfo();
  }, [loadDomainInfo]);

  // Generar keywords con IA
  const handleGenerateAIKeywords = async () => {
    if (!organization) return;
    setIsLoadingAI(true);
    setAiKeywords([]);
    try {
      const enabledServices: string[] = [];
      if (settings.enable_reservations) enabledServices.push('reservaciones');
      if (settings.enable_online_ordering) enabledServices.push('pedidos online');
      if (settings.enable_appointments) enabledServices.push('citas');
      if (settings.enable_memberships) enabledServices.push('membresías');
      if (settings.enable_tickets) enabledServices.push('tickets');
      if (settings.enable_parking_booking) enabledServices.push('parking');
      if (settings.show_products) enabledServices.push('productos');
      if (settings.show_gallery) enabledServices.push('galería');

      const res = await fetch('/api/ai-assistant/seo-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organization.id,
          organizationName: organization.name,
          description: settings.meta_description || '',
          city: (organization as any).city || '',
          country: (organization as any).country || '',
          services: enabledServices.join(', '),
          businessType: '',
          currentKeywords: formData.meta_keywords,
        }),
      });
      const data = await res.json();
      if (data.keywords?.length) {
        setAiKeywords(data.keywords);
      }
    } catch (err) {
      console.error('Error generando keywords IA:', err);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const handleAddAIKeyword = (keyword: string) => {
    if (!formData.meta_keywords.includes(keyword)) {
      setFormData(prev => ({
        ...prev,
        meta_keywords: [...prev.meta_keywords, keyword],
      }));
    }
    setAiKeywords(prev => prev.filter(k => k !== keyword));
  };

  const handleAddAllAIKeywords = () => {
    const newKws = aiKeywords.filter(k => !formData.meta_keywords.includes(k));
    setFormData(prev => ({
      ...prev,
      meta_keywords: [...prev.meta_keywords, ...newKws],
    }));
    setAiKeywords([]);
  };

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

  const handleFaviconSelect = (url: string) => {
    setFormData({ ...formData, favicon_url: url });
  };

  return (
    <div className="space-y-6">
      {/* Nota informativa */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
        <CardContent className="flex items-start gap-3 pt-6">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-800 dark:text-blue-300">{t('perPageTitle')}</h4>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              {t('perPageDesc')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Favicon */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Image className="h-5 w-5" />
            {t('faviconTitle')}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('faviconDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {formData.favicon_url ? (
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <img
                    src={formData.favicon_url}
                    alt="Favicon"
                    className="h-16 w-16 object-contain rounded-lg border dark:border-gray-600 p-1 cursor-pointer"
                    onClick={() => setShowFaviconPicker(true)}
                  />
                  <button
                    onClick={() => setFormData({ ...formData, favicon_url: '' })}
                    className="absolute -top-2 -right-2 p-0.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{formData.favicon_url}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFaviconPicker(true)}
                    className="dark:border-gray-600 dark:text-gray-300"
                  >
                    <ImagePlus className="h-3 w-3 mr-1" /> {t('changeFavicon')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowFaviconPicker(true)}
                className="w-full h-24 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 bg-transparent"
              >
                <div className="flex flex-col items-center gap-2">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-sm">{t('selectFavicon')}</span>
                  <span className="text-xs">{t('faviconFormats')}</span>
                </div>
              </Button>
            )}

            <ImagePickerDialog
              open={showFaviconPicker}
              onOpenChange={setShowFaviconPicker}
              onSelect={handleFaviconSelect}
              title={t('faviconDialogTitle')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Keywords globales */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <Search className="h-5 w-5" />
                {t('keywordsTitle')}
              </CardTitle>
              <CardDescription className="dark:text-gray-400 mt-1">
                {t('keywordsDesc')}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAIKeywords}
              disabled={isLoadingAI}
              className="border-purple-300 text-purple-600 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/20"
            >
              {isLoadingAI ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              {t('suggestAI')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sugerencias IA */}
          {aiKeywords.length > 0 && (
            <div className="p-3 rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('aiSuggestions', { count: aiKeywords.length })}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddAllAIKeywords}
                  className="h-6 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400"
                >
                  {t('addAll')}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {aiKeywords.map((kw) => (
                  <button
                    key={kw}
                    onClick={() => handleAddAIKeyword(kw)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-800/50 dark:text-purple-300 dark:hover:bg-purple-800 transition-colors cursor-pointer"
                  >
                    + {kw}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input manual */}
          <div className="flex gap-2">
            <Input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder={t('addKeywordPlaceholder')}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
            />
            <Button variant="outline" onClick={handleAddKeyword} className="dark:border-gray-600">
              {t('add')}
            </Button>
          </div>

          {/* Keywords actuales */}
          <div className="flex flex-wrap gap-2">
            {formData.meta_keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary" className="flex items-center gap-1">
                {keyword}
                <button onClick={() => handleRemoveKeyword(keyword)} className="ml-1 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {formData.meta_keywords.length === 0 && !aiKeywords.length && (
              <div className="text-center w-full py-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('noKeywords')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {t('noKeywordsHint')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dominio del Sitio */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <Link2 className="h-5 w-5" />
                {t('domainTitle')}
              </CardTitle>
              <CardDescription className="dark:text-gray-400 mt-1">
                {t('domainDesc')}
              </CardDescription>
            </div>
            <Link href="/app/organizacion/dominios">
              <Button variant="outline" size="sm" className="dark:border-gray-600 dark:text-gray-300">
                <Globe className="h-4 w-4 mr-1.5" />
                {t('manageDomains')}
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info de dominio actual */}
          <div className="space-y-3">
            {/* Subdominio */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">{t('subdomainLabel')}</p>
                {subdomain ? (
                  <a
                    href={`https://${subdomain}.goadmin.io`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {subdomain}.goadmin.io
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500">{t('notConfigured')}</p>
                )}
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                {t('active')}
              </Badge>
            </div>

            {/* Dominio personalizado */}
            {customDomain ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <Globe className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{t('customDomainLabel')}</p>
                  <a
                    href={`https://${customDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono text-gray-800 dark:text-gray-200 hover:underline flex items-center gap-1"
                  >
                    {customDomain}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                <Globe className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('noCustomDomain')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t('noCustomDomainHint')}</p>
                </div>
                <Link href="/app/organizacion/dominios">
                  <Button variant="ghost" size="sm" className="text-xs text-blue-600 dark:text-blue-400">
                    {t('configure')}
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* URL Canónica */}
          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <Label className="dark:text-gray-300">{t('canonicalUrl')}</Label>
            <Input
              value={formData.canonical_url}
              onChange={(e) => setFormData({ ...formData, canonical_url: e.target.value })}
              placeholder="https://tu-sitio.com"
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('canonicalUrlHint')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 dark:text-gray-300">
                <Shield className="h-4 w-4" />
                {t('googleVerification')}
              </Label>
              <Input
                value={formData.google_site_verification}
                onChange={(e) => setFormData({ ...formData, google_site_verification: e.target.value })}
                placeholder={t('googlePlaceholder')}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 dark:text-gray-300">
                <Shield className="h-4 w-4" />
                {t('bingVerification')}
              </Label>
              <Input
                value={formData.bing_site_verification}
                onChange={(e) => setFormData({ ...formData, bing_site_verification: e.target.value })}
                placeholder={t('bingPlaceholder')}
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
