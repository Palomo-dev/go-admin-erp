'use client';

import { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface CancelSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: number;
  organizationName: string;
  currentPeriodEnd: string;
  onCanceled: () => void;
}

export default function CancelSubscriptionModal({
  isOpen,
  onClose,
  organizationId,
  organizationName,
  currentPeriodEnd,
  onCanceled
}: CancelSubscriptionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelType, setCancelType] = useState<'end_of_period' | 'immediate'>('end_of_period');
  const [confirmText, setConfirmText] = useState('');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleCancel = async () => {
    if (confirmText !== 'CANCELAR') {
      setError('Por favor escribe CANCELAR para confirmar');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          immediate: cancelType === 'immediate',
          action: 'cancel'
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error cancelando suscripción');
      }

      onCanceled();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="ml-3 flex-1">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium leading-6 text-gray-900"
                    >
                      Cancelar Suscripción
                    </Dialog.Title>
                    <button
                      onClick={onClose}
                      className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm text-gray-500">
                    Estás a punto de cancelar la suscripción de <strong>{organizationName}</strong>.
                  </p>

                  {error && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  <div className="mt-4 space-y-3">
                    <label className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="cancelType"
                        value="end_of_period"
                        checked={cancelType === 'end_of_period'}
                        onChange={() => setCancelType('end_of_period')}
                        className="mt-1 h-4 w-4 text-blue-600"
                      />
                      <div className="ml-3">
                        <span className="block text-sm font-medium text-gray-900">
                          Cancelar al final del período
                        </span>
                        <span className="block text-xs text-gray-500 mt-1">
                          Mantendrás acceso hasta el {formatDate(currentPeriodEnd)}.
                          No se realizarán más cobros.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="cancelType"
                        value="immediate"
                        checked={cancelType === 'immediate'}
                        onChange={() => setCancelType('immediate')}
                        className="mt-1 h-4 w-4 text-red-600"
                      />
                      <div className="ml-3">
                        <span className="block text-sm font-medium text-gray-900">
                          Cancelar inmediatamente
                        </span>
                        <span className="block text-xs text-red-600 mt-1">
                          ⚠️ Perderás acceso a las funciones premium de inmediato.
                          No hay reembolso por el tiempo restante.
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">
                      Escribe <strong>CANCELAR</strong> para confirmar
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                      placeholder="CANCELAR"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Mantener Suscripción
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={loading || confirmText !== 'CANCELAR'}
                    className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Cancelando...' : 'Confirmar Cancelación'}
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
