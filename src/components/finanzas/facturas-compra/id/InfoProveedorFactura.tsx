'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, User, Phone, Mail, IdCard } from 'lucide-react';
import { InvoicePurchase } from '../types';

interface InfoProveedorFacturaProps {
  factura: InvoicePurchase;
  className?: string;
}

export function InfoProveedorFactura({ 
  factura, 
  className = '' 
}: InfoProveedorFacturaProps) {
  if (!factura.supplier) {
    return null;
  }

  return (
    <Card className={`dark:bg-gray-800/50 dark:border-gray-700 border-gray-200 ${className}`}>
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white flex items-center">
          <Building2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          <span>Proveedor</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3">
        {/* Nombre del proveedor */}
        <div>
          <p className="font-medium text-base sm:text-lg text-gray-900 dark:text-white">
            {factura.supplier.name}
          </p>
          {factura.supplier.nit && (
            <div className="flex items-center mt-1 gap-2">
              <IdCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                NIT: {factura.supplier.nit}
              </p>
            </div>
          )}
        </div>

        {/* Información de contacto */}
        {(factura.supplier.contact || factura.supplier.phone || factura.supplier.email) && (
          <div className="space-y-1.5 sm:space-y-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            {factura.supplier.contact && (
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 truncate">
                  {factura.supplier.contact}
                </p>
              </div>
            )}

            {factura.supplier.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  {factura.supplier.phone}
                </p>
              </div>
            )}

            {factura.supplier.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 truncate">
                  {factura.supplier.email}
                </p>
              </div>
            )}
          </div>
        )}


      </CardContent>
    </Card>
  );
}
