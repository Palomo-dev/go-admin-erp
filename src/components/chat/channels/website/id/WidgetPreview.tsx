'use client';

import React, { useState } from 'react';
import { Eye, MessageCircle, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BrandConfig, 
  CollectIdentity,
  WidgetPosition,
  WidgetStyle
} from '@/lib/services/chatChannelsService';

interface WidgetPreviewProps {
  brandConfig: BrandConfig;
  welcomeMessage?: string;
  collectIdentity: CollectIdentity;
}

const defaultPosition: WidgetPosition = {
  side: 'right',
  vertical: 'bottom',
  offsetX: 20,
  offsetY: 20
};

const defaultStyle: WidgetStyle = {
  primaryColor: '#3B82F6',
  iconColor: '#FFFFFF',
  iconType: 'chat',
  buttonSize: 56,
  borderRadius: 28,
  borderWidth: 0,
  borderColor: '#FFFFFF',
  shadowEnabled: true,
  shadowStrength: 'medium'
};

export default function WidgetPreview({
  brandConfig,
  welcomeMessage,
  collectIdentity
}: WidgetPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'chat'>('form');

  // Handle both legacy and new config formats
  const position = brandConfig?.position || defaultPosition;
  const style = brandConfig?.style || defaultStyle;
  
  // Legacy support
  const primaryColor = style?.primaryColor || brandConfig?.primary_color || '#3B82F6';
  const needsForm = collectIdentity?.name || collectIdentity?.email || collectIdentity?.phone;

  const resetPreview = () => {
    setIsOpen(false);
    setStep('form');
  };

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="h-5 w-5 text-blue-600" />
          Vista Previa del Widget
        </CardTitle>
        <CardDescription>
          Prueba cómo se verá el widget en tu sitio web
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Preview Container */}
        <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 rounded-lg p-8 min-h-[400px] overflow-hidden">
          {/* Fake website content */}
          <div className="space-y-4">
            <div className="h-8 w-48 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-4 w-full bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-4 w-3/4 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-4 w-5/6 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-32 w-full bg-gray-300 dark:bg-gray-700 rounded" />
          </div>

          {/* Widget */}
          <div className={`absolute ${position.vertical === 'bottom' ? 'bottom-4' : 'top-4'} ${position.side === 'left' ? 'left-4' : 'right-4'}`}>
            {isOpen ? (
              <div className="w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5">
                {/* Header */}
                <div 
                  className="p-4 text-white flex items-center justify-between"
                  style={{ backgroundColor: primaryColor }}
                >
                  <div className="flex items-center gap-2">
                    {brandConfig.logo_url ? (
                      <img 
                        src={brandConfig.logo_url} 
                        alt="Logo" 
                        className="w-8 h-8 rounded-full object-cover bg-white"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <MessageCircle className="h-4 w-4" />
                      </div>
                    )}
                    <span className="font-semibold">Chat</span>
                  </div>
                  <button 
                    onClick={resetPreview}
                    className="hover:bg-white/20 p-1 rounded transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-4 h-64 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                  {step === 'form' && needsForm ? (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Por favor ingresa tus datos para continuar:
                      </p>
                      {collectIdentity.name && (
                        <div>
                          <label className="text-xs text-gray-500">Nombre *</label>
                          <input 
                            className="w-full mt-1 px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                            placeholder="Tu nombre"
                          />
                        </div>
                      )}
                      {collectIdentity.email && (
                        <div>
                          <label className="text-xs text-gray-500">Email *</label>
                          <input 
                            className="w-full mt-1 px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                            placeholder="tu@email.com"
                            type="email"
                          />
                        </div>
                      )}
                      {collectIdentity.phone && (
                        <div>
                          <label className="text-xs text-gray-500">Teléfono</label>
                          <input 
                            className="w-full mt-1 px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                            placeholder="+1 234 567 890"
                          />
                        </div>
                      )}
                      <button 
                        onClick={() => setStep('chat')}
                        className="w-full py-2 text-white rounded-lg text-sm font-medium transition-colors"
                        style={{ backgroundColor: primaryColor }}
                      >
                        Continuar
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div 
                        className="text-sm p-3 rounded-lg max-w-[80%]"
                        style={{ backgroundColor: `${primaryColor}20` }}
                      >
                        {welcomeMessage || '¡Hola! ¿En qué podemos ayudarte?'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                {(step === 'chat' || !needsForm) && (
                  <div className="p-3 border-t dark:border-gray-700">
                    <div className="flex gap-2">
                      <input 
                        className="flex-1 px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                        placeholder="Escribe un mensaje..."
                      />
                      <button 
                        className="p-2 rounded-lg text-white transition-colors"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsOpen(true)}
                className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-110"
                style={{ backgroundColor: primaryColor }}
              >
                <MessageCircle className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>

        {/* Reset button */}
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={resetPreview}>
            Reiniciar Vista Previa
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
