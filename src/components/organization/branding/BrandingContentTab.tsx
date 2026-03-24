'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, Save, Share2, Clock, MessageSquare,
  Plus, Trash2, Facebook, Instagram, Twitter, Linkedin, Youtube, FileText, Info
} from 'lucide-react';
import { WebsiteSettings, FooterLink, BusinessHours } from '@/lib/services/websiteSettingsService';
import { useTranslations } from 'next-intl';

interface BrandingContentTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  onUploadImage?: (file: File, type: 'gallery') => Promise<string>;
  isSaving: boolean;
}

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const SOCIAL_PLATFORMS = [
  { key: 'facebook', label: 'Facebook', icon: Facebook, placeholder: 'https://facebook.com/...' },
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/...' },
  { key: 'twitter', label: 'Twitter/X', icon: Twitter, placeholder: 'https://twitter.com/...' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, placeholder: 'https://linkedin.com/...' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, placeholder: 'https://youtube.com/...' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, placeholder: '+57 300 123 4567' },
];

export default function BrandingContentTab({ settings, onSave, isSaving }: BrandingContentTabProps) {
  const t = useTranslations('branding.content');
  const tc = useTranslations('branding.common');
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(settings.social_links || {});
  const [businessHours, setBusinessHours] = useState<BusinessHours>(settings.business_hours || {});
  const [footerText, setFooterText] = useState(settings.footer_text || '');
  const [footerLinks, setFooterLinks] = useState<FooterLink[]>(settings.footer_links || []);

  const handleSave = async () => {
    await onSave({
      social_links: socialLinks,
      business_hours: businessHours,
      footer_text: footerText,
      footer_links: footerLinks,
    });
  };

  const addFooterLink = () => {
    setFooterLinks([
      ...footerLinks,
      { id: crypto.randomUUID(), label: '', url: '', order: footerLinks.length },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Nota informativa */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          {t('infoNote')}
        </p>
      </div>

      <Tabs defaultValue="social" className="w-full">
        <TabsList className="grid w-full grid-cols-3 dark:bg-gray-800">
          <TabsTrigger value="social">{t('tabSocial')}</TabsTrigger>
          <TabsTrigger value="hours">{t('tabHours')}</TabsTrigger>
          <TabsTrigger value="footer">{t('tabFooter')}</TabsTrigger>
        </TabsList>

        {/* Redes Sociales */}
        <TabsContent value="social" className="mt-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <Share2 className="h-5 w-5" />
                {t('socialTitle')}
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                {t('socialDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {SOCIAL_PLATFORMS.map((platform) => {
                const Icon = platform.icon;
                return (
                  <div key={platform.key} className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                      <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <Label className="text-sm dark:text-gray-300">{platform.label}</Label>
                      <Input
                        value={(socialLinks as any)[platform.key] || ''}
                        onChange={(e) => setSocialLinks({ ...socialLinks, [platform.key]: e.target.value })}
                        placeholder={platform.placeholder}
                        className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Horarios */}
        <TabsContent value="hours" className="mt-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <Clock className="h-5 w-5" />
                {t('hoursTitle')}
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                {t('hoursDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {DAY_KEYS.map((dayKey) => {
                  const hours = (businessHours as any)[dayKey] || { open: '09:00', close: '18:00', closed: false };
                  return (
                    <div key={dayKey} className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                      <div className="w-24">
                        <span className="font-medium dark:text-white">{t(dayKey)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!hours.closed}
                          onCheckedChange={(checked) => 
                            setBusinessHours({ ...businessHours, [dayKey]: { ...hours, closed: !checked } })
                          }
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {hours.closed ? t('closed') : t('open')}
                        </span>
                      </div>
                      {!hours.closed && (
                        <>
                          <Input
                            type="time"
                            value={hours.open}
                            onChange={(e) => 
                              setBusinessHours({ ...businessHours, [dayKey]: { ...hours, open: e.target.value } })
                            }
                            className="w-32 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                          <span className="dark:text-gray-400">{t('timeSeparator')}</span>
                          <Input
                            type="time"
                            value={hours.close}
                            onChange={(e) => 
                              setBusinessHours({ ...businessHours, [dayKey]: { ...hours, close: e.target.value } })
                            }
                            className="w-32 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Footer */}
        <TabsContent value="footer" className="mt-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <FileText className="h-5 w-5" />
                {t('footerTitle')}
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                {t('footerDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="dark:text-gray-300">{t('footerTextLabel')}</Label>
                <Textarea
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder={t('footerTextPlaceholder')}
                  rows={2}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="dark:text-gray-300">{t('footerLinksLabel')}</Label>
                  <Button variant="outline" size="sm" onClick={addFooterLink} className="dark:border-gray-600">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('addLink')}
                  </Button>
                </div>
                <div className="space-y-2">
                  {footerLinks.map((link, index) => (
                    <div key={link.id} className="flex items-center gap-2">
                      <Input
                        value={link.label}
                        onChange={(e) => {
                          const updated = [...footerLinks];
                          updated[index].label = e.target.value;
                          setFooterLinks(updated);
                        }}
                        placeholder={t('linkTextPlaceholder')}
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                      <Input
                        value={link.url}
                        onChange={(e) => {
                          const updated = [...footerLinks];
                          updated[index].url = e.target.value;
                          setFooterLinks(updated);
                        }}
                        placeholder={t('linkUrlPlaceholder')}
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFooterLinks(footerLinks.filter((f) => f.id !== link.id))}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
