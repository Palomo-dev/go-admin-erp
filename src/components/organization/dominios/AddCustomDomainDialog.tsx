'use client';

import { useState } from 'react';
import { Globe, Check, Copy, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase/config';
import { useTranslations } from 'next-intl';

interface AddCustomDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  onDomainAdded: () => void;
}

export function AddCustomDomainDialog({
  open,
  onOpenChange,
  organizationId,
  onDomainAdded,
}: AddCustomDomainDialogProps) {
  const t = useTranslations('org.domains.addCustom');
  const [domain, setDomain] = useState('');
  const [step, setStep] = useState<'input' | 'dns'>('input');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [verificationToken] = useState(() => 
    `goadmin-verify-${Math.random().toString(36).substring(2, 15)}`
  );

  // Validar formato de dominio
  const isValidDomain = (value: string): boolean => {
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(value);
  };

  // Normalizar dominio
  const normalizeDomain = (value: string): string => {
    return value.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  };

  // Copiar al portapapeles
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Error copiando:', err);
    }
  };

  // Verificar si el dominio ya está registrado
  const checkDomainExists = async (host: string): Promise<boolean> => {
    const { data } = await supabase
      .from('organization_domains')
      .select('id')
      .eq('host', host)
      .maybeSingle();
    
    return !!data;
  };

  // Avanzar al paso de DNS
  const handleContinue = async () => {
    const normalized = normalizeDomain(domain);
    
    if (!normalized) {
      setError(t('errorEnterDomain'));
      return;
    }

    if (!isValidDomain(normalized)) {
      setError(t('errorInvalidFormat'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const exists = await checkDomainExists(normalized);
      if (exists) {
        setError(t('errorAlreadyRegistered'));
        return;
      }

      setDomain(normalized);
      setStep('dns');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('errorVerifying');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guardar dominio
  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('organization_domains')
        .insert({
          organization_id: organizationId,
          host: domain,
          domain_type: 'custom_domain',
          status: 'pending',
          is_primary: false,
          is_active: false,
          verification_type: 'TXT',
          verification_token: verificationToken,
          verification_record: `_goadmin-challenge.${domain}`,
          verification_value: verificationToken,
        });

      if (insertError) throw insertError;

      onDomainAdded();
      handleClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('errorSaving');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cerrar y resetear
  const handleClose = () => {
    setDomain('');
    setStep('input');
    setError(null);
    onOpenChange(false);
  };

  // Registros DNS requeridos
  const dnsRecords = [
    {
      type: 'CNAME',
      name: domain.startsWith('www.') ? 'www' : domain.split('.')[0],
      value: 'cname.vercel-dns.com',
      description: t('cnameDesc'),
    },
    {
      type: 'TXT',
      name: `_goadmin-challenge`,
      value: verificationToken,
      description: t('txtDesc'),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="dark:text-white">
                {step === 'input' ? t('title') : t('configureDns')}
              </DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                {step === 'input' 
                  ? t('connectDomain') 
                  : t('configureDnsDesc')
                }
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'input' ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="domain" className="dark:text-gray-200">
                  {t('domainLabel')}
                </Label>
                <Input
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value.toLowerCase())}
                  placeholder={t('domainPlaceholder')}
                  className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('domainHint')}
                </p>
              </div>

              <Alert className="dark:bg-blue-900/20 dark:border-blue-800">
                <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-sm dark:text-gray-300">
                  <strong>{t('requirements')}</strong>
                  <ul className="mt-2 space-y-1 list-disc list-inside">
                    <li>{t('req1')}</li>
                    <li>{t('req2')}</li>
                    <li>{t('req3')}</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div className="space-y-6">
              <Alert className="dark:bg-yellow-900/20 dark:border-yellow-800">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <AlertDescription className="text-sm dark:text-gray-300">
                  <strong>{t('dnsImportant')}</strong> {t('dnsDelay')}
                </AlertDescription>
              </Alert>

              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  {t('configureDnsRecords')} <strong>{domain}</strong>:
                </h4>
                
                <div className="space-y-4">
                  {dnsRecords.map((record, idx) => (
                    <div 
                      key={idx}
                      className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                          {record.type}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {record.description}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-gray-500 dark:text-gray-400">{t('nameHost')}</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="flex-1 bg-white dark:bg-gray-800 px-2 py-1 rounded text-sm border border-gray-200 dark:border-gray-600 dark:text-gray-200">
                              {record.name}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(record.name, `name-${idx}`)}
                              className="h-8 w-8 p-0"
                            >
                              {copiedField === `name-${idx}` ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-xs text-gray-500 dark:text-gray-400">{t('valueTarget')}</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="flex-1 bg-white dark:bg-gray-800 px-2 py-1 rounded text-sm border border-gray-200 dark:border-gray-600 truncate dark:text-gray-200">
                              {record.value}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(record.value, `value-${idx}`)}
                              className="h-8 w-8 p-0"
                            >
                              {copiedField === `value-${idx}` ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <ExternalLink className="h-4 w-4" />
                <span>
                  {t('needHelp')} 
                  <a href="https://support.google.com/domains/answer/9211383" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline ml-1">
                    Google Domains
                  </a>,{' '}
                  <a href="https://www.godaddy.com/help/add-a-cname-record-19236" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                    GoDaddy
                  </a>,{' '}
                  <a href="https://www.namecheap.com/support/knowledgebase/article.aspx/319/2237/how-can-i-set-up-a-cname-record-for-my-domain/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Namecheap
                  </a>
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'input' ? (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="dark:border-gray-600 dark:text-gray-300"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleContinue}
                disabled={!domain || isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('verifying')}
                  </>
                ) : (
                  t('continue')
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep('input')}
                className="dark:border-gray-600 dark:text-gray-300"
              >
                {t('back')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('saving')}
                  </>
                ) : (
                  t('saveDomain')
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddCustomDomainDialog;
