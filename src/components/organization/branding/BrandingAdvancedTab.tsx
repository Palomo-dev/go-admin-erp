'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Code, BarChart3, AlertTriangle } from 'lucide-react';
import { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { useTranslations } from 'next-intl';

interface BrandingAdvancedTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  isSaving: boolean;
}

export default function BrandingAdvancedTab({ settings, onSave, isSaving }: BrandingAdvancedTabProps) {
  const t = useTranslations('branding.advanced');
  const tc = useTranslations('branding.common');
  const [formData, setFormData] = useState({
    custom_css: settings.custom_css || '',
    custom_scripts: settings.custom_scripts || '',
    analytics_id: settings.analytics_id || '',
  });

  const handleSave = async () => {
    await onSave(formData);
  };

  return (
    <div className="space-y-6">
      {/* Advertencia */}
      <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        <AlertDescription className="text-yellow-700 dark:text-yellow-400">
          {t('cautionAlert')}
        </AlertDescription>
      </Alert>

      {/* Analytics */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <BarChart3 className="h-5 w-5" />
            {t('analyticsTitle')}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('analyticsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">{t('measurementId')}</Label>
            <Input
              value={formData.analytics_id}
              onChange={(e) => setFormData({ ...formData, analytics_id: e.target.value })}
              placeholder="G-XXXXXXXXXX"
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('measurementIdHint')}
            </p>
          </div>

          {formData.analytics_id && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-400">
                ✓ {t('analyticsConfigured')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CSS Personalizado */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Code className="h-5 w-5" />
            {t('customCssTitle')}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('customCssDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Textarea
              value={formData.custom_css}
              onChange={(e) => setFormData({ ...formData, custom_css: e.target.value })}
              placeholder={`/* Ejemplo de CSS personalizado */
.hero-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.btn-primary {
  border-radius: 9999px;
}`}
              rows={10}
              className="font-mono text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('customCssHint')}
            </p>
          </div>

          {/* Preview de CSS */}
          {formData.custom_css && (
            <div className="mt-4">
              <Label className="text-sm dark:text-gray-300">{t('codePreview')}</Label>
              <pre className="mt-2 p-3 bg-gray-900 text-green-400 rounded-lg text-xs overflow-x-auto">
                <code>{formData.custom_css}</code>
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scripts Personalizados */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Code className="h-5 w-5" />
            {t('customScriptsTitle')}
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {t('customScriptsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-700 dark:text-red-400">
              {t('scriptsWarning')}
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Textarea
              value={formData.custom_scripts}
              onChange={(e) => setFormData({ ...formData, custom_scripts: e.target.value })}
              placeholder={`<!-- Ejemplo: Pixel de Facebook -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  // ... resto del código
</script>

<!-- Ejemplo: Chat widget -->
<script src="https://chat-widget.com/widget.js"></script>`}
              rows={10}
              className="font-mono text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('scriptsHint')}
            </p>
          </div>

          {/* Preview de Scripts */}
          {formData.custom_scripts && (
            <div className="mt-4">
              <Label className="text-sm dark:text-gray-300">{t('codePreview')}</Label>
              <pre className="mt-2 p-3 bg-gray-900 text-blue-400 rounded-lg text-xs overflow-x-auto max-h-48">
                <code>{formData.custom_scripts}</code>
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">{t('summaryTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className={`text-2xl font-bold ${formData.analytics_id ? 'text-green-600' : 'text-gray-400'}`}>
                {formData.analytics_id ? '✓' : '○'}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t('analytics')}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className={`text-2xl font-bold ${formData.custom_css ? 'text-green-600' : 'text-gray-400'}`}>
                {formData.custom_css ? formData.custom_css.split('\n').length : 0}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t('cssLines')}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className={`text-2xl font-bold ${formData.custom_scripts ? 'text-green-600' : 'text-gray-400'}`}>
                {formData.custom_scripts ? formData.custom_scripts.split('\n').length : 0}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t('scriptLines')}</p>
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
