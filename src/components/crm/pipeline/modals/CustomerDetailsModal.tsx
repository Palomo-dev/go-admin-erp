"use client";

import React from "react";
import { Customer } from "../types";
import { formatCurrency } from "@/utils/Utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Users,
  Mail,
  Phone,
  MapPin
} from "lucide-react";

// Definir la interfaz localmente hasta completar la refactorización
interface CustomerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onEdit: (customer: Customer) => void;
}

const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({
  isOpen,
  onClose,
  customer,
  onEdit,
}: CustomerDetailsModalProps) => {
  if (!customer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-semibold">
            <Users className="h-6 w-6 text-blue-500" />
            Detalles del Cliente
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-6">
          <div className="space-y-4 bg-gray-50 dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300">
              Información de contacto
            </h3>

            <div className="flex flex-col gap-4 text-sm">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Nombre:</span>
                <span>{customer.full_name}</span>
              </div>

              {customer.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">Correo:</span>
                  <a
                    href={`mailto:${customer.email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {customer.email}
                  </a>
                </div>
              )}

              {customer.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">Teléfono:</span>
                  <a
                    href={`tel:${customer.phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {customer.phone}
                  </a>
                </div>
              )}

              {customer.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-blue-500 mt-0.5" />
                  <span className="font-medium">Dirección:</span>
                  <span>{customer.address}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 bg-gray-50 dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300">
              Resumen de oportunidades
            </h3>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">Total oportunidades:</span>
                <span className="font-medium text-blue-600">
                  {customer.total_opportunities}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm">Oportunidades activas:</span>
                <span className="font-medium text-amber-600">
                  {customer.active_opportunities}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm">Oportunidades ganadas:</span>
                <span className="font-medium text-green-600">
                  {customer.won_opportunities}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm">Valor total:</span>
                <span className="font-medium text-blue-600">
                  {formatCurrency(customer.total_value)}
                </span>
              </div>
            </div>
          </div>

          {customer.notes && (
            <div className="space-y-3 bg-gray-50 dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                Notas
              </h3>
              <p className="text-sm bg-white dark:bg-gray-900 p-4 rounded-md border border-gray-100 dark:border-gray-700">
                {customer.notes}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 bg-white dark:bg-gray-950 pt-3 pb-1 mt-4 border-t border-gray-100 dark:border-gray-800">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            onClick={() => {
              onClose();
              onEdit(customer);
            }}
          >
            Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerDetailsModal;
