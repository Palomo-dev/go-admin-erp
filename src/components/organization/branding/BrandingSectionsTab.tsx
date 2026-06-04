'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, LayoutGrid, ShoppingBag, Briefcase, ImageIcon, MessageSquare, Users, FileText, HelpCircle, Mail, MapPin, Share2 } from 'lucide-react';
import { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { useTranslations } from 'next-intl';

interface BrandingSectionsTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  isSaving: boolean;
}

const SECTIONS = [
  { key: 'show_products', labelKey: 'products', descKey: 'productsDesc', icon: ShoppingBag },
  { key: 'show_services', labelKey: 'services', descKey: 'servicesDesc', icon: Briefcase },
  { key: 'show_gallery', labelKey: 'gallery', descKey: 'galleryDesc', icon: ImageIcon },
  { key: 'show_testimonials', labelKey: 'testimonials', descKey: 'testimonialsDesc', icon: MessageSquare },
  { key: 'show_team', labelKey: 'team', descKey: 'teamDesc', icon: Users },
  { key: 'show_blog', labelKey: 'blog', descKey: 'blogDesc', icon: FileText },
  { key: 'show_faq', labelKey: 'faq', descKey: 'faqDesc', icon: HelpCircle },
  { key: 'show_contact', labelKey: 'contact', descKey: 'contactDesc', icon: Mail },
  { key: 'show_map', labelKey: 'map', descKey: 'mapDesc', icon: MapPin },
  { key: 'show_social_links', labelKey: 'socialLinks', descKey: 'socialLinksDesc', icon: Share2 },
];

export default function BrandingSectionsTab({ settings, onSave, isSaving }: BrandingSectionsTabProps) {
  const t = useTranslations('branding.sections');
  const tc = useTranslations('branding.common');
  const [formData, setFormData] = useState({
    show_products: settings.show_products ?? true,
    show_services: settings.show_services ?? true,
    show_gallery: settings.show_gallery ?? true,
    show_testimonials: settings.show_testimonials ?? true,
    show_team: settings.show_team ?? false,
    show_blog: settings.show_blog ?? false,
    show_faq: settings.show_faq ?? true,
    show_contact: settings.show_contact ?? true,
    show_map: settings.show_map ?? true,
    show_social_links: settings.show_social_links ?? true,
  });

  const handleToggle = (key: string, value: boolean) => {
    setFormData({ ...formData, [key]: value });
  };

  const handleSave = async () => {
    await onSave(formData);
  };

  const enabledCount = Object.values(formData).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <LayoutGrid className="h-5 w-5" />
            {t('title')}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('description', { enabled: enabledCount, total: SECTIONS.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isEnabled = formData[section.key as keyof typeof formData];
              
              return (
                <div
                  key={section.key}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                    isEnabled 
                      ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20' 
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isEnabled ? 'bg-blue-100 dark:bg-blue-800' : 'bg-gray-100 dark:bg-gray-700'}`}>
                      <Icon className={`h-5 w-5 ${isEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
                    </div>
                    <div>
                      <Label className="font-medium dark:text-white">{t(section.labelKey)}</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t(section.descKey)}</p>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggle(section.key, checked)}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Vista previa del orden */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">{t('orderTitle')}</CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('orderDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {SECTIONS.filter(s => formData[s.key as keyof typeof formData]).map((section, index) => {
              const Icon = section.icon;
              return (
                <div
                  key={section.key}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <span className="w-6 h-6 flex items-center justify-center bg-blue-600 text-white text-xs font-medium rounded-full">
                    {index + 1}
                  </span>
                  <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <span className="dark:text-white">{t(section.labelKey)}</span>
                </div>
              );
            })}
            {enabledCount === 0 && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                {t('noActiveSections')}
              </p>
            )}
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
