'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Save, RotateCcw, Sun, Moon, Palette } from 'lucide-react';
import { WebsiteSettings, TEMPLATES, FONTS, DEFAULT_COLORS } from '@/lib/services/websiteSettingsService';
import { cn } from '@/utils/Utils';

interface BrandingThemeTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  isSaving: boolean;
}

export default function BrandingThemeTab({ settings, onSave, isSaving }: BrandingThemeTabProps) {
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {TEMPLATES.map((template) => (
              <div
                key={template.id}
                onClick={() => setFormData({ ...formData, template_id: template.id })}
                className={cn(
                  'cursor-pointer rounded-lg border-2 p-4 transition-all hover:border-blue-400',
                  formData.template_id === template.id
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                )}
              >
                <div className="h-20 rounded bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 mb-3" />
                <h4 className="font-medium text-sm dark:text-white">{template.name}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{template.description}</p>
              </div>
            ))}
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
