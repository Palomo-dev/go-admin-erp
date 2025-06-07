"use client";

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Producto } from './types';

interface ImportarProductosProps {
  onImportComplete: (productos: Producto[]) => void;
  onCancel: () => void;
}

// Definición de interfaces para manejo de datos de archivos
interface FileData {
  [key: string]: string | number | boolean;
}

/**
 * Componente para importar productos desde archivos CSV o Excel
 * 
 * Este componente permite al usuario cargar archivos CSV o Excel (.xlsx, .xls)
 * y los convierte en datos de productos que pueden ser utilizados en el catálogo.
 */
const ImportarProductos: React.FC<ImportarProductosProps> = ({ onImportComplete, onCancel }): React.ReactNode => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [previewData, setPreviewData] = useState<FileData[] | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    nombre: '',
    sku: '',
    categoria: '',
    precio: '',
    stock: '',
    estado: '',
    descripcion: '',
    codigoBarras: '',
    codigoQR: '',
    ubicacion: '',
    etiquetas: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Columnas requeridas para el catálogo de productos
  const requiredColumns = ['nombre', 'sku', 'categoria', 'precio'];
  const optionalColumns = [
    'stock', 
    'estado', 
    'descripcion', 
    'tieneVariantes', 
    'codigoBarras', 
    'codigoQR', 
    'ubicacion', 
    'etiquetas'
  ];
  
  // Columnas disponibles (se llenará al cargar un archivo)
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  // Manejar el cambio de archivo seleccionado
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setErrorMessage('');
    setPreviewData(null);
    
    if (!selectedFile) return;
    
    const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
    
    if (!fileExtension || !['csv', 'xlsx', 'xls'].includes(fileExtension)) {
      setErrorMessage('Formato de archivo no soportado. Por favor, sube un archivo CSV o Excel (.xlsx, .xls)');
      return;
    }
    
    setFile(selectedFile);
    processFile(selectedFile);
  };

  // Procesar el archivo para obtener una vista previa
  const processFile = (selectedFile: File) => {
    setIsProcessing(true);
    
    const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'csv') {
      processCsvFile(selectedFile);
    } else {
      processExcelFile(selectedFile);
    }
  };

  // Procesar archivo CSV
  const processCsvFile = (csvFile: File) => {
    Papa.parse(csvFile, {
      header: true,
      complete: (results) => {
        handleFileParseComplete(results.data as FileData[]);
      },
      error: (error) => {
        setErrorMessage(`Error al procesar el archivo CSV: ${error.message}`);
        setIsProcessing(false);
      }
    });
  };

  // Procesar archivo Excel
  const processExcelFile = async (excelFile: File) => {
    try {
      const data = await excelFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as FileData[];
      handleFileParseComplete(jsonData);
    } catch (error) {
      setErrorMessage(`Error al procesar el archivo Excel: ${(error as Error).message}`);
      setIsProcessing(false);
    }
  };

  // Manejar los datos parseados del archivo
  const handleFileParseComplete = (data: FileData[]) => {
    // Filtrar filas vacías (donde todos los campos son vacíos o undefined)
    const filteredData = data.filter(row => {
      return Object.values(row).some(val => 
        val !== undefined && val !== null && val !== ''
      );
    });
    
    if (filteredData.length === 0) {
      setErrorMessage('El archivo está vacío o no contiene datos válidos.');
      setIsProcessing(false);
      return;
    }

    // Obtener las columnas disponibles del archivo
    const columns = Object.keys(filteredData[0]);
    setAvailableColumns(columns);
    
    // Crear un mapeo inicial basado en nombres similares
    const initialMapping: Record<string, string> = {};
    const requiredAndOptionalColumns = [...requiredColumns, ...optionalColumns];
    
    requiredAndOptionalColumns.forEach(requiredCol => {
      // Buscar coincidencia exacta
      const exactMatch = columns.find(col => col.toLowerCase() === requiredCol.toLowerCase());
      if (exactMatch) {
        initialMapping[requiredCol] = exactMatch;
        return;
      }
      
      // Buscar coincidencia parcial
      const partialMatch = columns.find(col => 
        col.toLowerCase().includes(requiredCol.toLowerCase()) || 
        requiredCol.toLowerCase().includes(col.toLowerCase())
      );
      
      if (partialMatch) {
        initialMapping[requiredCol] = partialMatch;
      }
    });
    
    // Hacer un mapeo automático si es posible y mostrar una vista previa
    setColumnMapping(initialMapping);
    setPreviewData(filteredData.slice(0, 5)); // Mostrar hasta 5 filas en la vista previa
    setIsProcessing(false);
  };

  // Actualizar el mapeo de columnas
  const handleColumnMappingChange = (field: string, columnName: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [field]: columnName
    }));
  };

  // Importar los datos con el mapeo configurado
  const handleImport = () => {
    setIsProcessing(true);
    
    if (!file) {
      setErrorMessage('No se ha seleccionado ningún archivo.');
      setIsProcessing(false);
      return;
    }
    
    // Validamos que no falte ningún campo requerido en el mapeo
    const missingRequiredFields = requiredColumns.filter(
      field => !columnMapping[field] || columnMapping[field] === ''
    );
    
    if (missingRequiredFields.length > 0) {
      setErrorMessage(`Faltan campos requeridos: ${missingRequiredFields.join(', ')}`);
      setIsProcessing(false);
      return;
    }

    // Si es CSV, procesamos con PapaParse
    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          try {
            // Filtrar filas vacías
            const filteredData = (results.data as FileData[]).filter(row => 
              Object.values(row).some(val => val !== undefined && val !== null && val !== '')
            );
            
            const transformedData = transformData(filteredData);
            onImportComplete(transformedData);
          } catch (err) {
            setErrorMessage(`Error al procesar los datos: ${(err as Error).message}`);
          } finally {
            setIsProcessing(false);
          }
        },
        error: (error) => {
          setErrorMessage(`Error al procesar el archivo CSV: ${error.message}`);
          setIsProcessing(false);
        }
      });
    }
    // Si es Excel, usamos XLSX.js
    else {
      // Para Excel, leemos como BinaryString
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          if (!e.target?.result) {
            throw new Error('No se pudo leer el contenido del archivo');
          }
          
          const binary = e.target.result as string;
          const workbook = XLSX.read(binary, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as FileData[];
          
          // Filtrar filas vacías
          const filteredData = jsonData.filter(row => 
            Object.values(row).some(val => val !== undefined && val !== null && val !== '')
          );
          
          const transformedData = transformData(filteredData);
          onImportComplete(transformedData);
        } catch (err) {
          setErrorMessage(`Error al procesar el archivo Excel: ${(err as Error).message}`);
        } finally {
          setIsProcessing(false);
        }
      };
      
      reader.onerror = () => {
        setErrorMessage('Error al leer el archivo');
        setIsProcessing(false);
      };
      
      reader.readAsBinaryString(file);
    }  
  };

  // Transformar los datos según el mapeo
  const transformData = (data: FileData[]) => {
    return data.map((item) => {
      const producto: Producto = {
        id: Math.random().toString(36).substring(2, 15),
        nombre: '',
        sku: '',
        categoria: '',
        precio: 0,
        stock: 0,
        estado: 'inactivo',
        tieneVariantes: false,
        descripcion: '',
        codigoBarras: '',
        codigoQR: '',
        ubicacion: '',
        etiquetas: [],
      };

      // Mapear los campos según la configuración
      Object.keys(columnMapping).forEach((field) => {
        const sourceColumn = columnMapping[field];
        if (!sourceColumn) return;

        const value = item[sourceColumn];

        // Transformaciones según el tipo de campo
        switch (field) {
          case 'precio':
            // Convertir a número, asegurándose de manejar valores vacíos
            if (typeof value === 'string') {
              const parsedValue = parseFloat(value);
              producto.precio = isNaN(parsedValue) ? 0 : parsedValue;
            } else if (typeof value === 'number') {
              producto.precio = value;
            } else {
              producto.precio = 0;
            }
            break;

          case 'stock':
            // Convertir a número entero
            if (typeof value === 'string') {
              const parsedValue = parseInt(value, 10);
              producto.stock = isNaN(parsedValue) ? 0 : parsedValue;
            } else if (typeof value === 'number') {
              producto.stock = Math.floor(value);
            } else {
              producto.stock = 0;
            }
            break;

          case 'tieneVariantes':
            // Convertir a booleano
            if (typeof value === 'string') {
              const lowerValue = value.toLowerCase();
              producto.tieneVariantes = lowerValue === 'sí' || lowerValue === 'si' || lowerValue === 'true' || lowerValue === '1';
            } else {
              producto.tieneVariantes = Boolean(value);
            }
            break;

          case 'estado':
            // Asegurar que sea uno de los valores permitidos
            if (typeof value === 'string') {
              const lowerValue = value.toLowerCase();
              producto.estado = lowerValue === 'activo' ? 'activo' : 'inactivo';
            } else {
              producto.estado = 'inactivo'; // Valor por defecto
            }
            break;
            
          case 'etiquetas':
            // Transformar una lista separada por comas en un array de objetos etiqueta
            if (typeof value === 'string' && value.trim() !== '') {
              // Dividir por comas y eliminar espacios en blanco
              const etiquetasNombres = value.split(',').map(e => e.trim()).filter(e => e !== '');
              
              // Colores predefinidos para asignar a las etiquetas
              const coloresPredefinidos = [
                '#3B82F6', // azul
                '#10B981', // verde
                '#F59E0B', // amarillo
                '#EF4444', // rojo
                '#8B5CF6', // violeta
                '#EC4899', // rosa
              ];
              
              // Crear objetos etiqueta
              producto.etiquetas = etiquetasNombres.map((nombre, index) => ({
                id: Math.random().toString(36).substring(2, 15),
                nombre,
                color: coloresPredefinidos[index % coloresPredefinidos.length]
              }));
            } else {
              producto.etiquetas = [];
            }
            break;
            
          case 'descripcion':
            producto.descripcion = value !== undefined ? String(value) : '';
            break;
            
          case 'codigoBarras':
            producto.codigoBarras = value !== undefined ? String(value) : '';
            break;
            
          case 'codigoQR':
            producto.codigoQR = value !== undefined ? String(value) : '';
            break;
            
          case 'ubicacion':
            producto.ubicacion = value !== undefined ? String(value) : '';
            break;
            
          case 'nombre':
            producto.nombre = value !== undefined ? String(value) : '';
            break;
            
          case 'categoria':
            producto.categoria = value !== undefined ? String(value) : '';
            break;
            
          case 'sku':
            producto.sku = value !== undefined ? String(value) : '';
        }
      });

      return producto;
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-800 mb-3">Importar Productos</h2>
        <p className="text-gray-600 mb-2">
          Importa tus productos desde archivos CSV o Excel (.xlsx, .xls).
          Asegúrate de que tu archivo contiene al menos las columnas para nombre, SKU, categoría y precio.
        </p>
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-md p-3">
          <h4 className="font-medium mb-1">Formatos esperados para cada campo:</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-medium">nombre:</span> Texto descriptivo del producto</li>
            <li><span className="font-medium">sku:</span> Código único alfanumérico</li>
            <li><span className="font-medium">categoria:</span> Texto (ej: Ropa, Calzado, Accesorios, Electrónica)</li>
            <li><span className="font-medium">precio:</span> Número decimal sin símbolos de moneda</li>
            <li><span className="font-medium">stock:</span> Número entero</li>
            <li><span className="font-medium">estado:</span> Texto &ldquo;activo&rdquo; o &ldquo;inactivo&rdquo;</li>
            <li><span className="font-medium">tieneVariantes:</span> Valores aceptados para &ldquo;sí&rdquo;: true, si, sí, yes, 1</li>
            <li><span className="font-medium">descripcion:</span> Texto descriptivo detallado (opcional)</li>
            <li><span className="font-medium">codigoBarras:</span> Número o código alfanumérico (opcional)</li>
            <li><span className="font-medium">codigoQR:</span> Texto o URL para código QR (opcional)</li>
            <li><span className="font-medium">ubicacion:</span> Texto indicando ubicación física (opcional)</li>
            <li><span className="font-medium">etiquetas:</span> Lista de etiquetas separadas por comas (opcional)</li>
          </ul>
        </div>
      </div>

      {/* Selector de archivos */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <input
          type="file"
          id="fileInput"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv,.xlsx,.xls"
          className="hidden"
        />
        
        <div className="space-y-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          
          <div className="text-sm text-gray-600">
            <label
              htmlFor="fileInput"
              className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer"
            >
              Haz clic para seleccionar un archivo
            </label>
            <p className="mt-1">o arrastra y suelta un archivo aquí</p>
          </div>
          
          <p className="text-xs text-gray-500">
            Formatos soportados: CSV, Excel (.xlsx, .xls)
          </p>
        </div>
        
        {file && (
          <div className="mt-4 text-sm font-medium text-gray-700">
            Archivo seleccionado: {file.name}
          </div>
        )}
      </div>

      {/* Mensaje de error */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {errorMessage}
        </div>
      )}

      {/* Vista previa y mapeo de columnas */}
      {previewData && (
        <div className="space-y-4">
          <h3 className="font-medium text-gray-800">Mapeo de columnas</h3>
          <p className="text-sm text-gray-600">
            Asocia las columnas de tu archivo con los campos requeridos del catálogo de productos.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.keys(columnMapping).map((field) => (
              <div key={field} className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  {field} {requiredColumns.includes(field) && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={columnMapping[field]}
                  onChange={(e) => handleColumnMappingChange(field, e.target.value)}
                  className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm text-gray-800"
                >
                  <option value="">Seleccionar columna</option>
                  {availableColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Vista previa de datos */}
          <div className="mt-6">
            <h3 className="font-medium text-gray-800 mb-2">Vista previa</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {availableColumns.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-gray-50">
                      {availableColumns.map((column) => (
                        <td key={column} className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                          {typeof row[column] === 'undefined' ? '-' : String(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Mostrando {previewData.length} de {file ? 'múltiples' : '0'} registros
            </p>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="mt-8 flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
          disabled={isProcessing}
        >
          Cancelar
        </button>
        
        {!file ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Seleccionar Archivo
          </button>
        ) : !previewData ? (
          <button
            type="button"
            disabled={true}
            className="px-4 py-2 text-sm font-medium bg-blue-300 text-white rounded-lg"
          >
            Procesando...
          </button>
        ) : (
          <button
            type="button"
            onClick={handleImport}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {isProcessing ? 'Importando...' : 'Importar Datos'}
          </button>
        )}
      </div>
    </div>
  );
};

export default ImportarProductos;
