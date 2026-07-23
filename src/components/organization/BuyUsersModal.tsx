'use client';

import { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { UserPlusIcon, CheckIcon } from '@heroicons/react/24/outline';

interface BuyUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: number;
  currentUsers: number;
  maxUsers: number | null;
  onPurchased: () => void;
}

const USER_PACKAGES = [
  { id: '5', quantity: 5, label: '5 usuarios extra' },
  { id: '10', quantity: 10, label: '10 usuarios extra', popular: true },
  { id: '25', quantity: 25, label: '25 usuarios extra' },
  { id: '50', quantity: 50, label: '50 usuarios extra' },
];

const FALLBACK_UNIT_PRICE = 1000;

export default function BuyUsersModal({
  isOpen,
  onClose,
  organizationId,
  currentUsers,
  maxUsers,
  onPurchased,
}: BuyUsersModalProps) {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [customQuantity, setCustomQuantity] = useState<number | ''>('');
  const [unitPrice, setUnitPrice] = useState(FALLBACK_UNIT_PRICE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveMax = maxUsers !== null ? maxUsers : 0;
  const addonSlots = Math.max(0, currentUsers - effectiveMax);

  const handleBuy = async () => {
    const pkg = USER_PACKAGES.find((p) => p.id === selectedPackage);
    const qty = pkg ? pkg.quantity : customQuantity;

    if (!qty || qty < 1) {
      setError('Selecciona un paquete o ingresa al menos 1 usuario.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/stripe/create-addon-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          addonType: 'extra_users',
          quantity: qty,
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
      console.error('Error buying extra users:', err);
      setError(err.message || 'Error al procesar la compra');
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedPackage(null);
    setCustomQuantity('');
    setError(null);
    setLoading(false);
    onClose();
  };

  const getQuantity = (): number => {
    const pkg = USER_PACKAGES.find((p) => p.id === selectedPackage);
    if (pkg) return pkg.quantity;
    return customQuantity ? customQuantity : 0;
  };

  const getTotal = (): number => {
    return (getQuantity() * unitPrice) / 100;
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
                  <UserPlusIcon className="h-5 w-5 text-indigo-500" />
                  Comprar Usuarios Extra
                </Dialog.Title>

                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Agrega usuarios adicionales a tu plan. Se cobran mensualmente.
                  </p>
                  {maxUsers !== null && (
                    <p className="text-xs text-gray-400 mt-1">
                      Límite actual: {maxUsers} usuarios · Usados: {currentUsers}
                      {addonSlots > 0 && ` · Addons activos: ${addonSlots}`}
                    </p>
                  )}
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
                    {USER_PACKAGES.map((pkg) => {
                      const monthlyPrice = (pkg.quantity * unitPrice) / 100;
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => {
                            setSelectedPackage(pkg.id);
                            setCustomQuantity('');
                          }}
                          className={`relative text-left rounded-lg border-2 p-4 transition-all ${
                            selectedPackage === pkg.id
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200 hover:border-indigo-300'
                          }`}
                        >
                          {pkg.popular && (
                            <span className="absolute -top-2 left-3 bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full">
                              Popular
                            </span>
                          )}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-gray-900">{pkg.label}</p>
                              <p className="text-lg font-semibold text-indigo-600 mt-1">
                                ${monthlyPrice.toLocaleString()}/mes
                              </p>
                            </div>
                            {selectedPackage === pkg.id && (
                              <CheckIcon className="h-5 w-5 text-indigo-500" />
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
                      min={1}
                      step={1}
                      value={customQuantity}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomQuantity(val ? parseInt(val, 10) : '');
                        if (val) setSelectedPackage(null);
                      }}
                      placeholder="Ej: 7"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-sm text-gray-500">
                      {customQuantity ? `= $${((customQuantity * unitPrice) / 100).toLocaleString()}/mes` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Mínimo: 1 usuario</p>
                </div>

                {/* Resumen */}
                <div className="mt-6 bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Usuarios a agregar:</span>
                    <span className="font-semibold text-gray-900">
                      {getQuantity() || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-600">Costo mensual:</span>
                    <span className="font-bold text-indigo-600">
                      {getQuantity() > 0 ? `$${getTotal().toLocaleString()}/mes USD` : '—'}
                    </span>
                  </div>
                </div>

                {/* Botones */}
                <div className="mt-6 flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleBuy}
                    disabled={loading || (!selectedPackage && !customQuantity)}
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {loading ? 'Procesando...' : 'Suscribir'}
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
