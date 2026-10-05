'use client';
import {useCallback} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {RED_COPY_KEYS} from './redCopyKeys';

export function useRedText() {
  const t = useTranslations('crm.red');
  const locale = useLocale();
  const tr = useCallback((source: string, values?: Record<string, string | number>) => {
    const key = RED_COPY_KEYS[source];
    // User-entered names and remote error messages are not translation keys.
    return key ? t(key, values) : /^El número (está incompleto|tiene demasiados dígitos|no es válido) para /.test(source) ? t(RED_COPY_KEYS['Número de teléfono no válido']) : source;
  }, [t]);
  return {tr, locale};
}
