/**
 * Selector de idioma para el módulo de campañas CRM
 */

import React from 'react';
import { Languages } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

const LanguageSelector: React.FC = () => {
  const { locale, changeLocale } = useTranslation();

  const languages = [
    { code: 'es' as Locale, name: 'Español', flag: '🇪🇸' },
    { code: 'en' as Locale, name: 'English', flag: '🇺🇸' },
    { code: 'pt' as Locale, name: 'Português', flag: '🇧🇷' },
    { code: 'fr' as Locale, name: 'Français', flag: '🇫🇷' }
  ];

  const currentLanguage = languages.find(lang => lang.code === locale);

  return (
    <Select value={locale} onValueChange={(value: Locale) => changeLocale(value)}>
      <SelectTrigger className="w-40">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4" />
          <span className="text-sm">
            {currentLanguage?.flag} {currentLanguage?.name}
          </span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {languages.map((language) => (
          <SelectItem key={language.code} value={language.code}>
            <div className="flex items-center gap-2">
              <span>{language.flag}</span>
              <span>{language.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default LanguageSelector;
