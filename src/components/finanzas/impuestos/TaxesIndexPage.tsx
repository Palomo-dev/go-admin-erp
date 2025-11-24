"use client";

import React from 'react';
import TaxesTable from './TaxesTable';

const TaxesIndexPage = () => {
  return (
    <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-3 sm:px-4 md:px-6">
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 dark:text-blue-400">
            Gestión de Impuestos
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Administra los tipos de impuestos aplicables a los productos y servicios de tu organización.
          </p>
        </div>
        
        <TaxesTable />
      </div>
    </div>
  );
};

export default TaxesIndexPage;
