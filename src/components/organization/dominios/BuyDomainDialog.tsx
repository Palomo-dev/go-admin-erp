'use client';

import { useState, useEffect, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Globe, Search, Check, X, Loader2, ShoppingCart, AlertTriangle, CreditCard, ChevronRight, ChevronLeft } from 'lucide-react';
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
import { cn } from '@/utils/Utils';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface DomainCheckResult {
  domain: string;
  available: boolean;
  price: number | null;
  renewalPrice: number | null;
  currency: string;
  years: number;
  error?: string;
}

interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface BuyDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  userEmail: string;
  userName: string;
  onPurchaseComplete: (domain: string) => void;
}

// Estilos para Stripe Elements
const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1f2937',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#dc2626' },
  },
  hidePostalCode: true,
};

type Step = 'search' | 'contact' | 'payment' | 'success';

function BuyDomainForm({
  open,
  onOpenChange,
  organizationId,
  userEmail,
  userName,
  onPurchaseComplete,
}: BuyDomainDialogProps) {
  const stripe = useStripe();
  const elements = useElements();
  
  const [step, setStep] = useState<Step>('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [domainResult, setDomainResult] = useState<DomainCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  
  // Stripe
  const [setupIntentSecret, setSetupIntentSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  
  // Contacto
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    firstName: userName.split(' ')[0] || '',
    lastName: userName.split(' ').slice(1).join(' ') || '',
    email: userEmail,
    phone: '',
    address1: '',
    city: '',
    state: '',
    zip: '',
    country: 'CO',
  });

  // Resetear al cerrar
  useEffect(() => {
    if (!open) {
      setStep('search');
      setSearchTerm('');
      setDomainResult(null);
      setError(null);
      setSetupIntentSecret(null);
    }
  }, [open]);

  // Crear Setup Intent al llegar al paso de pago
  useEffect(() => {
    const initSetupIntent = async () => {
      if (step === 'payment' && !setupIntentSecret) {
        try {
          const response = await fetch('/api/stripe/setup-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: contactInfo.email, name: `${contactInfo.firstName} ${contactInfo.lastName}` }),
          });
          const data = await response.json();
          if (data.success) {
            setSetupIntentSecret(data.clientSecret);
            setCustomerId(data.customerId);
          } else {
            setError('Error preparando el sistema de pago');
          }
        } catch {
          setError('Error de conexión con el sistema de pago');
        }
      }
    };
    initSetupIntent();
  }, [step, setupIntentSecret, contactInfo.email, contactInfo.firstName, contactInfo.lastName]);


  // Verificar disponibilidad
  const checkDomain = useCallback(async (domain: string) => {
    if (!domain || !domain.includes('.')) return;
    
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) return;

    setIsChecking(true);
    setError(null);

    try {
      const response = await fetch('/api/domains/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await response.json();
      if (data.success) {
        setDomainResult(data.data);
      } else {
        setError(data.error || 'Error verificando dominio');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Debounce búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.includes('.')) {
        checkDomain(searchTerm.toLowerCase());
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [searchTerm, checkDomain]);

  // Validar contacto
  const isContactValid = () => {
    return contactInfo.firstName && contactInfo.lastName && contactInfo.email && 
           contactInfo.phone && contactInfo.address1 && contactInfo.city && 
           contactInfo.state && contactInfo.zip && contactInfo.country;
  };

  // Verificar tarjeta y procesar compra
  const handlePurchase = async () => {
    if (!stripe || !elements || !setupIntentSecret || !domainResult?.available) return;

    setIsProcessing(true);
    setError(null);

    try {
      // 1. Confirmar Setup Intent
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Error con la tarjeta');

      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(
        setupIntentSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              email: contactInfo.email,
              name: `${contactInfo.firstName} ${contactInfo.lastName}`,
            },
          },
        }
      );

      if (confirmError) throw new Error(confirmError.message);
      if (setupIntent?.status !== 'succeeded') throw new Error('La verificación de tarjeta falló');

      const pmId = setupIntent.payment_method as string;

      // 2. Procesar compra
      const purchaseResponse = await fetch('/api/domains/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainResult.domain,
          organizationId,
          expectedPrice: domainResult.price,
          stripePaymentMethodId: pmId,
          stripeCustomerId: customerId,
          contactInfo,
        }),
      });

      const purchaseData = await purchaseResponse.json();
      
      if (!purchaseData.success) {
        throw new Error(purchaseData.error || 'Error al comprar el dominio');
      }

      setStep('success');
      setTimeout(() => {
        onPurchaseComplete(domainResult.domain);
        onOpenChange(false);
      }, 3000);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error procesando la compra';
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const suggestions = !searchTerm.includes('.') && searchTerm.length > 2
    ? ['.com', '.io', '.co', '.app'].map(ext => searchTerm + ext)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <ShoppingCart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="dark:text-white">Comprar Dominio</DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                {step === 'search' && 'Busca un dominio disponible'}
                {step === 'contact' && 'Información de contacto para el registro'}
                {step === 'payment' && 'Completa el pago'}
                {step === 'success' && '¡Compra completada!'}
              </DialogDescription>
            </div>
          </div>
          
          {/* Progress */}
          {step !== 'success' && (
            <div className="flex items-center gap-2 mt-4">
              {['search', 'contact', 'payment'].map((s, i) => (
                <div key={s} className="flex items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                    step === s ? "bg-blue-600 text-white" :
                    ['search', 'contact', 'payment'].indexOf(step) > i ? "bg-green-600 text-white" :
                    "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  )}>
                    {['search', 'contact', 'payment'].indexOf(step) > i ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  {i < 2 && <div className="w-8 h-0.5 bg-gray-200 dark:bg-gray-700 mx-1" />}
                </div>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="py-4 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* PASO 1: Búsqueda */}
          {step === 'search' && (
            <>
              <div className="space-y-2">
                <Label className="dark:text-gray-200">Buscar Dominio</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    placeholder="miempresa.com"
                    className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  {isChecking && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />}
                </div>
              </div>

              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Button key={s} variant="outline" size="sm" onClick={() => setSearchTerm(s)}
                      className="text-xs dark:border-gray-600 dark:text-gray-300">{s}</Button>
                  ))}
                </div>
              )}

              {domainResult && (
                <div className={cn(
                  "p-4 rounded-lg border-2",
                  domainResult.available && domainResult.price ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" :
                  domainResult.available && !domainResult.price ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800" :
                  "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-full", 
                        domainResult.available && domainResult.price ? "bg-green-100 dark:bg-green-900/50" : 
                        domainResult.available && !domainResult.price ? "bg-yellow-100 dark:bg-yellow-900/50" :
                        "bg-red-100 dark:bg-red-900/50"
                      )}>
                        {domainResult.available && domainResult.price ? <Check className="h-5 w-5 text-green-600" /> : 
                         domainResult.available && !domainResult.price ? <AlertTriangle className="h-5 w-5 text-yellow-600" /> :
                         <X className="h-5 w-5 text-red-600" />}
                      </div>
                      <div>
                        <p className="font-semibold dark:text-white">{domainResult.domain}</p>
                        <p className={cn("text-sm", 
                          domainResult.available && domainResult.price ? "text-green-600" : 
                          domainResult.available && !domainResult.price ? "text-yellow-600" :
                          "text-red-600"
                        )}>
                          {domainResult.available && domainResult.price ? '¡Disponible!' : 
                           domainResult.available && !domainResult.price ? 'TLD no disponible para compra directa' :
                           domainResult.error || 'No disponible'}
                        </p>
                        {domainResult.available && !domainResult.price && (
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                            Prueba con .com, .io, .co, .net, .org, .app
                          </p>
                        )}
                      </div>
                    </div>
                    {domainResult.available && domainResult.price && (
                      <div className="text-right">
                        <span className="text-2xl font-bold dark:text-white">${domainResult.price.toFixed(2)}</span>
                        <span className="text-sm text-gray-500 ml-1">USD/año</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* PASO 2: Contacto */}
          {step === 'contact' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="dark:text-gray-200">Nombre *</Label>
                <Input value={contactInfo.firstName} onChange={(e) => setContactInfo({...contactInfo, firstName: e.target.value})}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <Label className="dark:text-gray-200">Apellido *</Label>
                <Input value={contactInfo.lastName} onChange={(e) => setContactInfo({...contactInfo, lastName: e.target.value})}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <Label className="dark:text-gray-200">Email *</Label>
                <Input type="email" value={contactInfo.email} onChange={(e) => setContactInfo({...contactInfo, email: e.target.value})}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <Label className="dark:text-gray-200">Teléfono * (E.164)</Label>
                <Input value={contactInfo.phone} onChange={(e) => setContactInfo({...contactInfo, phone: e.target.value})}
                  placeholder="+573001234567" className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="col-span-2">
                <Label className="dark:text-gray-200">Dirección *</Label>
                <Input value={contactInfo.address1} onChange={(e) => setContactInfo({...contactInfo, address1: e.target.value})}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <Label className="dark:text-gray-200">Ciudad *</Label>
                <Input value={contactInfo.city} onChange={(e) => setContactInfo({...contactInfo, city: e.target.value})}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <Label className="dark:text-gray-200">Estado/Depto *</Label>
                <Input value={contactInfo.state} onChange={(e) => setContactInfo({...contactInfo, state: e.target.value})}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <Label className="dark:text-gray-200">Código Postal *</Label>
                <Input value={contactInfo.zip} onChange={(e) => setContactInfo({...contactInfo, zip: e.target.value})}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <Label className="dark:text-gray-200">País (código) *</Label>
                <Input value={contactInfo.country} onChange={(e) => setContactInfo({...contactInfo, country: e.target.value.toUpperCase()})}
                  placeholder="CO" maxLength={2} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
          )}

          {/* PASO 3: Pago */}
          {step === 'payment' && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-medium dark:text-white">{domainResult?.domain}</span>
                  <span className="text-xl font-bold dark:text-white">${domainResult?.price?.toFixed(2)} USD</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Registro por 1 año con renovación automática</p>
              </div>

              <div>
                <Label className="dark:text-gray-200 flex items-center gap-2 mb-2">
                  <CreditCard className="h-4 w-4" /> Tarjeta de Crédito/Débito
                </Label>
                <div className="bg-white dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 p-3">
                  <CardElement options={cardElementOptions} onChange={(e) => setCardComplete(e.complete)} />
                </div>
              </div>

              <Alert className="dark:bg-blue-900/20 dark:border-blue-800">
                <Globe className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm dark:text-gray-300">
                  El pago se procesará de forma segura con Stripe. El dominio se registrará a través de Vercel.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* ÉXITO */}
          {step === 'success' && (
            <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                <strong>¡Dominio comprado exitosamente!</strong><br />
                <strong>{domainResult?.domain}</strong> ha sido registrado y se agregará a tu lista.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step !== 'success' && (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}
              className="dark:border-gray-600 dark:text-gray-300">Cancelar</Button>
          )}

          {step === 'search' && (
            <Button onClick={() => setStep('contact')} disabled={!domainResult?.available || !domainResult?.price}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              Continuar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {step === 'contact' && (
            <>
              <Button variant="outline" onClick={() => setStep('search')} className="dark:border-gray-600 dark:text-gray-300">
                <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
              </Button>
              <Button onClick={() => setStep('payment')} disabled={!isContactValid()}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                Continuar <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}

          {step === 'payment' && (
            <>
              <Button variant="outline" onClick={() => setStep('contact')} disabled={isProcessing}
                className="dark:border-gray-600 dark:text-gray-300">
                <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
              </Button>
              <Button onClick={handlePurchase} disabled={!stripe || !cardComplete || isProcessing || !setupIntentSecret}
                className="bg-green-600 hover:bg-green-700 text-white">
                {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</> :
                  <><ShoppingCart className="h-4 w-4 mr-2" />Pagar ${domainResult?.price?.toFixed(2)}</>}
              </Button>
            </>
          )}

          {step === 'success' && (
            <Button onClick={() => onOpenChange(false)} className="bg-blue-600 hover:bg-blue-700 text-white">Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BuyDomainDialog(props: BuyDomainDialogProps) {
  return (
    <Elements stripe={stripePromise}>
      <BuyDomainForm {...props} />
    </Elements>
  );
}

export default BuyDomainDialog;
