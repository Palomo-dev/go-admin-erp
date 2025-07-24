'use client'

import { useState } from 'react'
import { MapPinIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { saveGeolocationPreference, type GeolocationPreference } from '@/lib/utils/geolocation'

interface GeolocationModalProps {
  isOpen: boolean
  onClose: () => void
  onSelection: (preference: GeolocationPreference) => void
}

export default function GeolocationModal({ isOpen, onClose, onSelection }: GeolocationModalProps) {
  const [testing, setTesting] = useState(false)

  if (!isOpen) return null

  const handleAllow = async () => {
    setTesting(true)
    
    if (!navigator.geolocation) {
      // Navegador no soporta geolocalización
      savePreference('not_supported')
      onSelection('not_supported')
      onClose()
      return
    }

    try {
      // Probar si el usuario permite la geolocalización
      await new Promise<GeolocationPosition>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timeout'))
        }, 10000)
        
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timeoutId)
            resolve(pos)
          },
          (err) => {
            clearTimeout(timeoutId)
            reject(err)
          },
          { 
            timeout: 8000,
            enableHighAccuracy: false,
            maximumAge: 300000
          }
        )
      })
      
      // Si llegamos aquí, el usuario permitió la geolocalización
      savePreference('allowed')
      onSelection('allowed')
      onClose()
      
    } catch (error: any) {
      // El usuario denegó o hubo error
      if (error.code === 1) {
        savePreference('denied')
        onSelection('denied')
      } else {
        savePreference('denied')
        onSelection('denied')
      }
      onClose()
    }
    
    setTesting(false)
  }

  const handleDeny = () => {
    savePreference('denied')
    onSelection('denied')
    onClose()
  }

  const savePreference = (preference: GeolocationPreference) => {
    if (preference) {
      saveGeolocationPreference(preference)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <MapPinIcon className="h-6 w-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Permitir Ubicación
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-600 mb-4">
            Para mejorar la seguridad de tu cuenta, podemos registrar la ubicación aproximada 
            de tus dispositivos cuando inicies sesión.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h4 className="font-medium text-blue-900 mb-2">¿Para qué usamos tu ubicación?</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Detectar inicios de sesión desde ubicaciones inusuales</li>
              <li>• Mostrar el historial de dispositivos con ubicación</li>
              <li>• Mejorar la seguridad de tu cuenta</li>
            </ul>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleAllow}
              disabled={testing}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? 'Verificando...' : 'Permitir Ubicación'}
            </button>
            
            <button
              onClick={handleDeny}
              disabled={testing}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              No Permitir
            </button>
          </div>
          
          <p className="text-xs text-gray-500 mt-4 text-center">
            Puedes cambiar esta preferencia más tarde en la configuración de tu perfil.
          </p>
        </div>
      </div>
    </div>
  )
}
