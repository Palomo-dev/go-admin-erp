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
    <Card className={`dark:bg-gray-800/50 dark:border-gray-700 ${className}`}>
      <CardHeader>
        <CardTitle className="dark:text-white flex items-center">
          <Building2 className="w-5 h-5 mr-2" />
          Proveedor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Nombre del proveedor */}
        <div>
          <p className="font-medium text-lg dark:text-white">
            {factura.supplier.name}
          </p>
          {factura.supplier.nit && (
            <div className="flex items-center mt-1">
              <IdCard className="w-4 h-4 text-gray-400 mr-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                NIT: {factura.supplier.nit}
              </p>
            </div>
          )}
        </div>

        {/* Información de contacto */}
        {(factura.supplier.contact || factura.supplier.phone || factura.supplier.email) && (
          <div className="space-y-2 pt-2 border-t dark:border-gray-600">
            {factura.supplier.contact && (
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-400" />
                <p className="text-sm dark:text-gray-300">
                  {factura.supplier.contact}
                </p>
              </div>
            )}

            {factura.supplier.phone && (
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <p className="text-sm dark:text-gray-300">
                  {factura.supplier.phone}
                </p>
              </div>
            )}

            {factura.supplier.email && (
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <p className="text-sm dark:text-gray-300">
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
