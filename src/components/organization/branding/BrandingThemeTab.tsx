'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Save, RotateCcw, Sun, Moon, Palette, ExternalLink, Edit, Globe, Filter, RefreshCw } from 'lucide-react';
import { WebsiteSettings, TEMPLATE_PRESETS, getPresetsForType, FONTS, DEFAULT_COLORS, TemplatePresetInfo, TYPE_ID_TO_BUSINESS } from '@/lib/services/websiteSettingsService';
import { websitePageBuilderService } from '@/lib/services/websitePageBuilderService';
import { supabase } from '@/lib/supabase/config';
import { cn } from '@/utils/Utils';

interface BrandingThemeTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  isSaving: boolean;
  organizationTypeId?: number | null;
  organizationId?: number | null;
  subdomain?: string | null;
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurante',
  hotel: 'Hotel',
  retail: 'Retail',
  services: 'Servicios',
  gym: 'Gimnasio',
  transport: 'Transporte',
  parking: 'Parking',
};

export default function BrandingThemeTab({ settings, onSave, isSaving, organizationTypeId, organizationId, subdomain }: BrandingThemeTabProps) {
  const router = useRouter();
  const [homePageId, setHomePageId] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [filterType, setFilterType] = useState<string>(organizationTypeId ? (TYPE_ID_TO_BUSINESS[organizationTypeId] || 'all') : 'all');
  const [resolvedSubdomain, setResolvedSubdomain] = useState<string | null>(subdomain ?? null);

  // Cargar subdomain y home page ID
  useEffect(() => {
    if (!organizationId) return;

    // Cargar subdomain directo de BD (patrón consistente con BrandingSEOTab)
    supabase
      .from('organizations')
      .select('subdomain')
      .eq('id', organizationId)
      .single()
      .then(({ data }) => {
        if (data?.subdomain) setResolvedSubdomain(data.subdomain);
      });

    // Cargar home page para botón Editar
    websitePageBuilderService.getPages(organizationId).then((pages) => {
      const home = pages.find((p) => p.slug === 'home');
      if (home) setHomePageId(home.id);
    }).catch(console.error);
  }, [organizationId]);

  const siteUrl = resolvedSubdomain ? `https://${resolvedSubdomain}.goadmin.io` : null;

  // Filtrar presets según el filtro seleccionado
  const presets = filterType === 'all' ? TEMPLATE_PRESETS : TEMPLATE_PRESETS.filter(p => p.business_type === filterType);
  const [formData, setFormData] = useState({
    template_id: settings.template_id || 'modern',
    theme_mode: settings.theme_mode || 'light',
    primary_color: settings.primary_color || DEFAULT_COLORS.primary,
    secondary_color: settings.secondary_color || DEFAULT_COLORS.secondary,
    accent_color: settings.accent_color || DEFAULT_COLORS.accent,
    background_color: settings.background_color || DEFAULT_COLORS.background,
    text_color: settings.text_color || DEFAULT_COLORS.text,
    font_heading: settings.font_heading || 'Inter',
    font_body: settings.font_body || 'Inter',
  });

  const handleSave = async () => {
    await onSave(formData);
  };

  const handleReset = () => {
    setFormData({
      ...formData,
      primary_color: DEFAULT_COLORS.primary,
      secondary_color: DEFAULT_COLORS.secondary,
      accent_color: DEFAULT_COLORS.accent,
      background_color: DEFAULT_COLORS.background,
      text_color: DEFAULT_COLORS.text,
    });
  };

  return (
    <div className="space-y-6">
      {/* Preview del sitio — ocupa solo la mitad del ancho */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="max-w-md">
            <h3 className="text-sm font-semibold dark:text-white mb-3">Tema aplicado</h3>
            {siteUrl ? (
              <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                {/* Barra de navegador simulada */}
                <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 px-2 py-0.5 bg-white dark:bg-gray-800 rounded text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate">
                    {siteUrl}
                  </div>
                </div>
                {/* Iframe escalado */}
                <div className="relative overflow-hidden" style={{ height: '320px' }}>
                  <iframe
                    key={iframeKey}
                    src={siteUrl}
                    className="absolute top-0 left-0 border-0"
                    style={{ width: '1440px', height: '900px', transform: 'scale(0.31)', transformOrigin: 'top left' }}
                    title="Vista previa del sitio"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                <Globe className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-xs">No hay subdominio configurado.</p>
              </div>
            )}
            {/* Info + botones */}
            <div className="mt-2 flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium dark:text-white">{settings.template_id || 'Sin template'}</span>
                {settings.updated_at && (
                  <span className="ml-2">· Modificado {new Date(settings.updated_at).toLocaleDateString('es')}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {siteUrl && (
                  <Button variant="outline" size="sm" onClick={() => setIframeKey((k) => k + 1)} className="h-7 w-7 p-0 dark:border-gray-600">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                )}
                {siteUrl && (
                  <Button variant="outline" size="sm" onClick={() => window.open(siteUrl, '_blank')} className="h-7 text-xs dark:border-gray-600">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Ver sitio
                  </Button>
                )}
                {homePageId && (
                  <Button size="sm" onClick={() => router.push(`/app/organizacion/branding/editor/${homePageId}`)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700">
                    <Edit className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plantilla */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Palette className="h-5 w-5" />
            Plantilla
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Selecciona el estilo base para tu sitio web
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filtro por tipo de organización */}
          <div className="flex items-center gap-3 mb-4">
            <Filter className="h-4 w-4 text-gray-400" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px] dark:bg-gray-700 dark:border-gray-600">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {Object.entries(BUSINESS_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {presets.length} {presets.length === 1 ? 'tema' : 'temas'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {presets.map((preset) => {
              const bgColor = preset.theme_mode === 'dark' ? preset.colors.secondary : '#FFFFFF';
              const textColor = preset.theme_mode === 'dark' ? '#FFFFFF' : '#1F2937';
              return (
                <div
                  key={preset.id}
                  onClick={() => {
                    setFormData({
                      ...formData,
                      template_id: preset.id,
                      primary_color: preset.colors.primary,
                      secondary_color: preset.colors.secondary,
                      theme_mode: preset.theme_mode,
                      font_heading: preset.fonts.heading,
                      font_body: preset.fonts.body,
                    });
                  }}
                  className={cn(
                    'cursor-pointer rounded-lg border-2 p-4 transition-all hover:border-blue-400 relative',
                    formData.template_id === preset.id
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  )}
                >
                  {preset.is_default && (
                    <span className="absolute top-2 right-2 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 px-1.5 py-0.5 rounded font-medium">⭐ Default</span>
                  )}
                  {/* Mini preview */}
                  <div
                    className="h-24 rounded overflow-hidden mb-3 border border-gray-100 dark:border-gray-600"
                    style={{ backgroundColor: bgColor }}
                  >
                    {/* Mini header */}
                    <div
                      className="h-5 flex items-center px-2 gap-1"
                      style={{ backgroundColor: preset.colors.primary }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                      <div className="w-6 h-1 rounded bg-white/40" />
                      <div className="ml-auto flex gap-0.5">
                        <div className="w-4 h-1 rounded bg-white/30" />
                        <div className="w-4 h-1 rounded bg-white/30" />
                      </div>
                    </div>
                    {/* Mini hero */}
                    <div className="px-2 pt-1.5">
                      <div className="w-12 h-1.5 rounded mb-1" style={{ backgroundColor: textColor }} />
                      <div className="w-16 h-1 rounded mb-1.5" style={{ backgroundColor: textColor, opacity: 0.4 }} />
                      <div className="w-8 h-2.5 rounded" style={{ backgroundColor: preset.colors.primary }} />
                    </div>
                    {/* Mini content blocks */}
                    <div className="px-2 pt-1.5 flex gap-1">
                      <div className="flex-1 h-4 rounded" style={{ backgroundColor: preset.colors.secondary, opacity: 0.15 }} />
                      <div className="flex-1 h-4 rounded" style={{ backgroundColor: preset.colors.secondary, opacity: 0.15 }} />
                      <div className="flex-1 h-4 rounded" style={{ backgroundColor: preset.colors.secondary, opacity: 0.15 }} />
                    </div>
                  </div>
                  <h4 className="font-medium text-sm dark:text-white" style={{ fontFamily: preset.fonts.heading }}>{preset.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{preset.description}</p>
                  {/* Color swatches + mode badge */}
                  <div className="flex items-center gap-1 mt-2">
                    <div className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-600" style={{ backgroundColor: preset.colors.primary }} title="Principal" />
                    <div className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-600" style={{ backgroundColor: preset.colors.secondary }} title="Secundario" />
                    <span className="ml-auto text-[10px] text-gray-400">
                      {preset.theme_mode === 'dark' ? '🌙' : '☀️'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Modo de tema */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            {formData.theme_mode === 'light' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            Modo de Tema
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Elige entre modo claro u oscuro
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={formData.theme_mode}
            onValueChange={(value) => setFormData({ ...formData, theme_mode: value as 'light' | 'dark' })}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="light" id="light" />
              <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer dark:text-white">
                <Sun className="h-4 w-4" /> Claro
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="dark" id="dark" />
              <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer dark:text-white">
                <Moon className="h-4 w-4" /> Oscuro
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Colores */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="dark:text-white">Colores</CardTitle>
            <CardDescription className="dark:text-gray-400">
              Personaliza los colores de tu marca
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset} className="dark:border-gray-600">
            <RotateCcw className="h-4 w-4 mr-2" />
            Restablecer
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Principal</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.primary_color}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  className="h-10 w-full rounded cursor-pointer"
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{formData.primary_color}</span>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Secundario</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.secondary_color}
                  onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                  className="h-10 w-full rounded cursor-pointer"
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{formData.secondary_color}</span>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Acento</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.accent_color}
                  onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                  className="h-10 w-full rounded cursor-pointer"
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{formData.accent_color}</span>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Fondo</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.background_color}
                  onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
                  className="h-10 w-full rounded cursor-pointer"
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{formData.background_color}</span>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Texto</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.text_color}
                  onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                  className="h-10 w-full rounded cursor-pointer"
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{formData.text_color}</span>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-6 p-4 rounded-lg border dark:border-gray-700" style={{ backgroundColor: formData.background_color }}>
            <h3 className="text-lg font-bold mb-2" style={{ color: formData.primary_color, fontFamily: formData.font_heading }}>
              Vista Previa del Tema
            </h3>
            <p className="mb-3" style={{ color: formData.text_color, fontFamily: formData.font_body }}>
              Este es un texto de ejemplo para ver cómo se verán los colores en tu sitio web.
            </p>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded text-white text-sm" style={{ backgroundColor: formData.primary_color }}>
                Botón Principal
              </button>
              <button className="px-4 py-2 rounded text-white text-sm" style={{ backgroundColor: formData.secondary_color }}>
                Botón Secundario
              </button>
              <button className="px-4 py-2 rounded text-white text-sm" style={{ backgroundColor: formData.accent_color }}>
                Acento
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tipografía */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">Tipografía</CardTitle>
          <CardDescription className="dark:text-gray-400">
            Selecciona las fuentes para títulos y texto
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Fuente de Títulos</Label>
              <Select
                value={formData.font_heading}
                onValueChange={(value) => setFormData({ ...formData, font_heading: value })}
              >
                <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((font) => (
                    <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-2xl mt-2 dark:text-white" style={{ fontFamily: formData.font_heading }}>
                Título de Ejemplo
              </p>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Fuente de Cuerpo</Label>
              <Select
                value={formData.font_body}
                onValueChange={(value) => setFormData({ ...formData, font_body: value })}
              >
                <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((font) => (
                    <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 dark:text-gray-300" style={{ fontFamily: formData.font_body }}>
                Este es un texto de ejemplo para ver cómo se ve la fuente del cuerpo.
              </p>
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
