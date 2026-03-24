'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, Globe, GlobeLock, Eye, ExternalLink, Copy, Check, 
  Calendar, AlertTriangle, CheckCircle, XCircle, RotateCcw
} from 'lucide-react';
import { WebsiteSettings, TEMPLATES } from '@/lib/services/websiteSettingsService';
import { useTranslations } from 'next-intl';

interface BrandingPublishTabProps {
  settings: WebsiteSettings;
  organizationName: string;
  subdomain?: string;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onResetToTemplate: (templateId: string) => Promise<void>;
  isPublishing: boolean;
}

export default function BrandingPublishTab({ 
  settings, 
  organizationName,
  subdomain,
  onPublish, 
  onUnpublish, 
  onResetToTemplate,
  isPublishing 
}: BrandingPublishTabProps) {
  const t = useTranslations('branding.publish');
  const [copied, setCopied] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(settings.template_id);
  const [isResetting, setIsResetting] = useState(false);

  const siteUrl = subdomain ? `https://${subdomain}.goadmin.io` : t('notConfigured');

  const handleCopyUrl = () => {
    if (subdomain) {
      navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await onResetToTemplate(selectedTemplate);
    } finally {
      setIsResetting(false);
    }
  };

  // Verificar completitud de configuración
  const checks = [
    { label: t('checkTemplate'), passed: !!settings.template_id },
    { label: t('checkMetaTitle'), passed: !!settings.meta_title },
    { label: t('checkMetaDesc'), passed: !!settings.meta_description },
    { label: t('checkPrimaryColor'), passed: !!settings.primary_color },
    { label: t('checkSections'), passed: settings.show_products || settings.show_services || settings.show_contact },
  ];

  const passedChecks = checks.filter(c => c.passed).length;
  const allChecksPassed = passedChecks === checks.length;

  return (
    <div className="space-y-6">
      {/* Estado de Publicación */}
      <Card className={`${settings.is_published ? 'border-green-200 dark:border-green-800' : 'border-gray-200 dark:border-gray-700'} dark:bg-gray-800`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.is_published ? (
                <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                  <Globe className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              ) : (
                <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-700">
                  <GlobeLock className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                </div>
              )}
              <div>
                <CardTitle className="dark:text-white">
                  {settings.is_published ? t('sitePublished') : t('siteUnpublished')}
                </CardTitle>
                <CardDescription className="dark:text-gray-400">
                  {settings.is_published 
                    ? t('sitePublishedDesc')
                    : t('siteUnpublishedDesc')}
                </CardDescription>
              </div>
            </div>
            <Badge variant={settings.is_published ? 'default' : 'secondary'} className="text-sm">
              {settings.is_published ? t('online') : t('draft')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL del sitio */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <Globe className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="flex-1 text-sm font-mono dark:text-gray-300">{siteUrl}</span>
            {subdomain && (
              <>
                <Button variant="ghost" size="sm" onClick={handleCopyUrl}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
                {settings.is_published && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </>
            )}
          </div>

          {settings.published_at && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Calendar className="h-4 w-4" />
              {t('publishedAt')} {new Date(settings.published_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex gap-3 pt-2">
            {settings.is_published ? (
              <>
                {subdomain ? (
                  <Button variant="outline" asChild className="dark:border-gray-600">
                    <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                      <Eye className="h-4 w-4 mr-2" />
                      {t('viewSite')}
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" disabled className="dark:border-gray-600">
                    <Eye className="h-4 w-4 mr-2" />
                    {t('viewSite')}
                  </Button>
                )}
                <Button 
                  variant="destructive" 
                  onClick={onUnpublish}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <GlobeLock className="h-4 w-4 mr-2" />
                  )}
                  {t('unpublish')}
                </Button>
              </>
            ) : (
              <Button 
                onClick={onPublish}
                disabled={isPublishing || !allChecksPassed}
                className="bg-green-600 hover:bg-green-700"
              >
                {isPublishing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4 mr-2" />
                )}
                {t('publishSite')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de verificación */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">{t('checklistTitle')}</CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('checklistDesc', { passed: passedChecks, total: checks.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {checks.map((check, index) => (
              <div 
                key={index} 
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  check.passed 
                    ? 'bg-green-50 dark:bg-green-900/20' 
                    : 'bg-red-50 dark:bg-red-900/20'
                }`}
              >
                {check.passed ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
                )}
                <span className={check.passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>

          {!allChecksPassed && (
            <Alert className="mt-4 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                {t('checklistWarning')}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Restablecer a plantilla */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <RotateCcw className="h-5 w-5" />
            {t('resetTitle')}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('resetDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {TEMPLATES.map((template) => (
              <div
                key={template.id}
                onClick={() => setSelectedTemplate(template.id)}
                className={`cursor-pointer rounded-lg border-2 p-3 transition-all hover:border-blue-400 ${
                  selectedTemplate === template.id
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <h4 className="font-medium text-sm dark:text-white">{template.name}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{template.description}</p>
              </div>
            ))}
          </div>

          <Alert className="mb-4 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription className="text-orange-700 dark:text-orange-400">
              {t('resetWarning')}
            </AlertDescription>
          </Alert>

          <Button 
            variant="outline" 
            onClick={handleReset}
            disabled={isResetting}
            className="dark:border-gray-600"
          >
            {isResetting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            {t('resetTo', { name: TEMPLATES.find(tmpl => tmpl.id === selectedTemplate)?.name || '' })}
          </Button>
        </CardContent>
      </Card>

      {/* Información */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">{t('infoTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{organizationName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('organization')}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 capitalize">{settings.template_id}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('template')}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 capitalize">{settings.theme_mode}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('mode')}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {new Date(settings.updated_at).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('lastUpdate')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
