'use client';

import { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { SparklesIcon, CheckIcon } from '@heroicons/react/24/outline';

interface BuyAiCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: number;
  onPurchased: () => void;
}

interface CreditPackage {
  id: string;
  credits: number;
  label: string;
  bonus: string;
  popular?: boolean;
}

const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'small', credits: 5000, label: '5,000 créditos', bonus: '' },
  { id: 'medium', credits: 15000, label: '15,000 créditos', bonus: '+10% bonus', popular: true },
  { id: 'large', credits: 50000, label: '50,000 créditos', bonus: '+15% bonus' },
  { id: 'xl', credits: 100000, label: '100,000 créditos', bonus: '+20% bonus' },
];

const UNIT_PRICE_CENTS = 4;

function calculatePrice(pkg: CreditPackage): { basePrice: number; bonusCredits: number; totalPrice: number } {
  const basePrice = Math.round((pkg.credits * UNIT_PRICE_CENTS) / 100);
  let bonusCredits = 0;
  if (pkg.id === 'medium') bonusCredits = Math.round(pkg.credits * 0.10);
  if (pkg.id === 'large') bonusCredits = Math.round(pkg.credits * 0.15);
  if (pkg.id === 'xl') bonusCredits = Math.round(pkg.credits * 0.20);
  return { basePrice, bonusCredits, totalPrice: basePrice };
}

export default function BuyAiCreditsModal({
  isOpen,
  onClose,
  organizationId,
  onPurchased,
}: BuyAiCreditsModalProps) {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [customCredits, setCustomCredits] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async () => {
    const pkg = CREDIT_PACKAGES.find((p) => p.id === selectedPackage);
    const credits = pkg ? pkg.credits + calculatePrice(pkg).bonusCredits : customCredits;

    if (!credits || credits < 100) {
      setError('Selecciona un paquete o ingresa al menos 100 créditos.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/stripe/purchase-ai-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          creditsAmount: credits,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al procesar la compra');
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('No se recibió URL de pago');
      }
    } catch (err: any) {
      console.error('Error buying AI credits:', err);
      setError(err.message || 'Error al procesar la compra');
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedPackage(null);
    setCustomCredits('');
    setError(null);
    setLoading(false);
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex items-center gap-2"
                >
                  <SparklesIcon className="h-5 w-5 text-amber-500" />
                  Comprar Créditos de IA
                </Dialog.Title>

                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Los créditos comprados no expiran y se suman a tu saldo actual. Elige un paquete o una cantidad personalizada.
                  </p>
                </div>

                {error && (
                  <div className="mt-4 bg-red-50 border-l-4 border-red-500 p-4">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* Paquetes predefinidos */}
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Paquetes</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {CREDIT_PACKAGES.map((pkg) => {
                      const { basePrice, bonusCredits } = calculatePrice(pkg);
                      const totalCredits = pkg.credits + bonusCredits;
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => {
                            setSelectedPackage(pkg.id);
                            setCustomCredits('');
                          }}
                          className={`relative text-left rounded-lg border-2 p-4 transition-all ${
                            selectedPackage === pkg.id
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-gray-200 hover:border-amber-300'
                          }`}
                        >
                          {pkg.popular && (
                            <span className="absolute -top-2 left-3 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                              Popular
                            </span>
                          )}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-gray-900">{pkg.label}</p>
                              {bonusCredits > 0 && (
                                <p className="text-xs text-green-600 mt-0.5">
                                  {pkg.bonus} = {totalCredits.toLocaleString()} total
                                </p>
                              )}
                              <p className="text-lg font-semibold text-amber-600 mt-1">
                                ${basePrice.toLocaleString()} USD
                              </p>
                            </div>
                            {selectedPackage === pkg.id && (
                              <CheckIcon className="h-5 w-5 text-amber-500" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cantidad personalizada */}
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Cantidad personalizada</h4>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={100}
                      step={100}
                      value={customCredits}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomCredits(val ? parseInt(val, 10) : '');
                        if (val) setSelectedPackage(null);
                      }}
                      placeholder="Ej: 8000"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                    />
                    <span className="text-sm text-gray-500">
                      {customCredits ? `= $${((customCredits * UNIT_PRICE_CENTS) / 100).toLocaleString()} USD` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Mínimo: 100 créditos</p>
                </div>

                {/* Resumen */}
                <div className="mt-6 bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Créditos a comprar:</span>
                    <span className="font-semibold text-gray-900">
                      {(() => {
                        const pkg = CREDIT_PACKAGES.find((p) => p.id === selectedPackage);
                        if (pkg) return (pkg.credits + calculatePrice(pkg).bonusCredits).toLocaleString();
                        return customCredits ? customCredits.toLocaleString() : '—';
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-600">Total a pagar:</span>
                    <span className="font-bold text-amber-600">
                      {(() => {
                        const pkg = CREDIT_PACKAGES.find((p) => p.id === selectedPackage);
                        if (pkg) return `$${calculatePrice(pkg).basePrice.toLocaleString()} USD`;
                        return customCredits ? `$${((customCredits * UNIT_PRICE_CENTS) / 100).toLocaleString()} USD` : '—';
                      })()}
                    </span>
                  </div>
                </div>

                {/* Botones */}
                <div className="mt-6 flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleBuy}
                    disabled={loading || (!selectedPackage && !customCredits)}
                    className="inline-flex justify-center rounded-md border border-transparent bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {loading ? 'Procesando...' : 'Comprar ahora'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
