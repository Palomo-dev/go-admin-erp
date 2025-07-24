'use client'

import { useState } from 'react'

export default function TestGeolocationPage() {
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const testBrowserGeolocation = async () => {
    setLoading(true)
    setResult('Solicitando permiso de geolocalización...')
    
    if (!navigator.geolocation) {
      setResult('Geolocalización no soportada por el navegador')
      setLoading(false)
      return
    }

    try {
      console.log('Solicitando permiso de geolocalización...')
      
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timeout: El usuario tardó demasiado en responder'))
        }, 10000) // 10 segundos para que el usuario pueda responder
        
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
            timeout: 8000, // Timeout interno del navegador
            enableHighAccuracy: false,
            maximumAge: 300000 // Usar ubicación cacheada de hasta 5 minutos
          }
        )
      })
      
      const locationText = `Coordenadas GPS: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
      setResult(`✅ ${locationText}`)
      console.log('Geolocalización obtenida exitosamente')
      
    } catch (error: any) {
      console.log('Error o rechazo de geolocalización:', error.message)
      
      let errorMessage = ''
      if (error.code === 1) {
        errorMessage = 'Usuario denegó el acceso a la ubicación'
      } else if (error.code === 2) {
        errorMessage = 'Ubicación no disponible'
      } else if (error.code === 3) {
        errorMessage = 'Timeout al obtener ubicación'
      } else {
        errorMessage = 'Error al obtener ubicación del navegador'
      }
      
      setResult(`❌ ${errorMessage}`)
    }
    
    setLoading(false)
  }

  const testApiGeolocation = async () => {
    setLoading(true)
    setResult('Probando geolocalización por IP...')
    
    try {
      const response = await fetch('/api/test-geolocation')
      const data = await response.json()
      
      setResult(`🌍 IP: ${data.ip}\n📍 Ubicación: ${data.location || 'No disponible'}`)
    } catch (error) {
      setResult(`❌ Error al probar API: ${error}`)
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Test de Geolocalización
          </h1>
          
          <div className="space-y-4">
            <button
              onClick={testBrowserGeolocation}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Probando...' : 'Probar GPS del Navegador'}
            </button>
            
            <button
              onClick={testApiGeolocation}
              disabled={loading}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Probando...' : 'Probar Geolocalización por IP'}
            </button>
          </div>
          
          {result && (
            <div className="mt-6 p-4 bg-gray-100 rounded-md">
              <h3 className="font-semibold text-gray-900 mb-2">Resultado:</h3>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap">{result}</pre>
            </div>
          )}
          
          <div className="mt-6 text-sm text-gray-600">
            <p><strong>Instrucciones:</strong></p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>El primer botón pedirá permiso para acceder a tu ubicación GPS</li>
              <li>Tienes 10 segundos para aceptar o rechazar el permiso</li>
              <li>El segundo botón usa tu IP para estimar la ubicación</li>
              <li>Ambos métodos se usan en el sistema de sesiones</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
