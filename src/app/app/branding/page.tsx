'use client';

import React from 'react';
import { Palette, Construction } from 'lucide-react';

export default function BrandingPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto text-center">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-orange-100 p-3 rounded-full">
              <Palette className="h-8 w-8 text-orange-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Branding
          </h1>
          <p className="text-gray-600">
            Personalización de la experiencia de usuario
          </p>
        </div>

        {/* En Desarrollo */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8">
          <div className="flex items-center justify-center mb-4">
            <Construction className="h-12 w-12 text-yellow-600" />
          </div>
          <h2 className="text-xl font-semibold text-yellow-800 mb-2">
            En Desarrollo
          </h2>
          <p className="text-yellow-700 mb-4">
            Este módulo está actualmente en desarrollo. Pronto podrás personalizar:
          </p>
          <ul className="text-left text-yellow-700 space-y-2 max-w-md mx-auto">
            <li className="flex items-center">
              <span className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
              Tema de colores corporativos
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
              Favicon personalizado
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
              Plantillas de facturas
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
              Configuración de módulos
            </li>
          </ul>
        </div>

        {/* Información adicional */}
        <div className="mt-8 text-sm text-gray-500">
          <p>
            ¿Tienes sugerencias para este módulo?{' '}
            <a href="mailto:support@goadminerp.com" className="text-blue-600 hover:underline">
              Contáctanos
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
