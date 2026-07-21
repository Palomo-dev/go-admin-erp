"use client"

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import * as GiIcons from 'react-icons/gi'

interface IconSelectorProps {
  value?: string
  onChange: (iconName: string) => void
  label?: string
  className?: string
  color?: string
}

const COMMON_ICONS = [
  // Productos y comercio
  'Package', 'ShoppingCart', 'ShoppingBag', 'ShoppingBasket', 'Gift', 'PackageOpen', 'PackageCheck',
  'Boxes', 'Box', 'Archive', 'Warehouse', 'Store',
  // Tecnología
  'Laptop', 'Monitor', 'Smartphone', 'Tablet', 'Watch', 'Tv', 'Speaker',
  'Headphones', 'Camera', 'Gamepad', 'Cpu', 'HardDrive', 'Wifi', 'Bluetooth', 'Battery',
  'Printer', 'Mouse', 'Keyboard', 'Usb',
  // Ropa y moda
  'Shirt', 'Gem', 'Crown', 'Glasses', 'Footprints', 'Scissors',
  // Belleza y cosméticos
  'SprayCan', 'Brush', 'Eye', 'HandHeart',
  // Alimentos - Frutas y verduras
  'Apple', 'Banana', 'Cherry', 'Grape', 'Citrus', 'Carrot', 'Wheat', 'Nut', 'Vegan',
  // Alimentos - Comidas y platos
  'Pizza', 'Soup', 'Salad', 'Sandwich', 'Croissant', 'Donut',
  // Alimentos - Postres y dulces
  'Cake', 'CakeSlice', 'IceCream', 'IceCreamCone', 'IceCreamBowl', 'Cookie', 'Candy', 'CandyCane', 'Lollipop', 'Popcorn',
  // Alimentos - Proteínas
  'Beef', 'Drumstick', 'Egg', 'EggFried', 'Fish', 'FishSymbol', 'Shrimp', 'Ham',
  // Alimentos - Lácteos y derivados
  'Milk',
  // Bebidas
  'Coffee', 'Wine', 'Beer', 'CupSoda', 'Martini', 'GlassWater',
  // Cocina y restaurante
  'Utensils', 'UtensilsCrossed', 'CookingPot', 'ChefHat', 'ConciergeBell', 'HandPlatter',
  'Refrigerator', 'Microwave',
  // Alimentos extra (react-icons/gi) - verduras y platos que Lucide no tiene
  'GiTomato', 'GiHamburger', 'GiTacos', 'GiCheeseWedge', 'GiCoffeeCup',
  'GiChickenLeg', 'GiSausage', 'GiCarrot', 'GiPotato', 'GiHotMeal', 'GiNoodles',
  'GiSushis', 'GiDonut', 'GiCupcake', 'GiFrenchFries', 'GiWaterBottle', 'GiWineGlass',
  'GiMilkCarton', 'GiBreadSlice', 'GiChiliPepper', 'GiGarlic', 'GiBroccoli',
  'GiAvocado', 'GiPear', 'GiWatermelon', 'GiPeanut', 'GiCorn', 'GiMushroom',
  'GiSteak', 'GiShrimp', 'GiCrab', 'GiHoneypot', 'GiCakeSlice', 'GiPretzel',
  'GiPopcorn', 'GiIceCreamScoop', 'GiKnifeFork', 'GiCookingPot', 'GiFruitBowl',
  // Hogar
  'Home', 'Sofa', 'Lamp', 'Bath', 'Bed', 'AirVent', 'Refrigerator', 'WashingMachine',
  // Herramientas
  'Wrench', 'Hammer', 'Drill', 'Paintbrush', 'Ruler', 'Pipette', 'Pencil', 'PenTool', 'Eraser',
  // Educación y libros
  'Book', 'BookOpen', 'Library', 'GraduationCap', 'School', 'Notebook', 'BookMarked', 'FileText',
  // Salud y bienestar
  'Heart', 'HeartPulse', 'Stethoscope', 'Pill', 'Syringe', 'Thermometer', 'Baby', 'Accessibility',
  'Dumbbell', 'Bike', 'PersonStanding',
  // Farmacia ampliado
  'Cross', 'Bandage', 'Bone', 'Plus',
  // Deportes
  'Volleyball', 'Dumbbell', 'SkipForward', 'Medal', 'Trophy', 'Goal',
  // Transporte
  'Car', 'Bus', 'Truck', 'Plane', 'Ship', 'Rocket', 'Train', 'Bike', 'Fuel',
  // Automotriz
  'CircleGauge', 'Caravan', 'CarTaxiFront',
  // Industria y construcción
  'Factory', 'Building', 'Building2', 'Landmark', 'Construction', 'HardHat', 'BrickWall',
  // Agricultura y campo
  'Tractor', 'Shovel', 'Pickaxe', 'Leaf', 'Sprout',
  // Internet y redes
  'Globe', 'Globe2', 'Earth', 'Cloud', 'CloudDownload', 'CloudUpload', 'Server', 'Database', 'Network',
  'Link', 'Rss', 'Radio', 'Podcast', 'Signal', 'Antenna',
  // Etiquetas y precios
  'Tag', 'Tags', 'Barcode', 'QrCode', 'Percent', 'DollarSign', 'Euro', 'Coins', 'Banknote',
  'CreditCard', 'Wallet', 'Receipt', 'Calculator', 'PiggyBank', 'CircleDollarSign', 'BadgeDollarSign',
  // Personas
  'Users', 'User', 'UserPlus', 'UserCheck', 'UserX', 'UserCog', 'UsersRound',
  'Contact', 'BadgeCheck', 'Fingerprint', 'HandMetal', 'ThumbsUp', 'ThumbsDown',
  // Servicios profesionales
  'Briefcase', 'Scale', 'Gavel', 'Stamp', 'FileSignature', 'IdCard',
  // Seguridad
  'Shield', 'ShieldCheck', 'ShieldAlert', 'Lock', 'Unlock', 'Key', 'KeyRound', 'Eye', 'EyeOff',
  // Configuración
  'Settings', 'Cog', 'SlidersHorizontal', 'SlidersVertical', 'ToggleLeft', 'ToggleRight', 'Gauge',
  // Logros y premios
  'Star', 'Award', 'Trophy', 'Medal', 'Crown', 'Gem', 'Diamond', 'Sparkles', 'Flame', 'Zap',
  // Gráficos y datos
  'Target', 'TrendingUp', 'TrendingDown', 'Activity', 'BarChart', 'BarChart2', 'BarChart3',
  'PieChart', 'LineChart', 'AreaChart', 'Gauge',
  // Tiempo y calendario
  'Calendar', 'CalendarDays', 'CalendarCheck', 'CalendarClock', 'Clock', 'Timer', 'Hourglass',
  // Comunicación
  'Bell', 'BellRing', 'Mail', 'MailOpen', 'MessageSquare', 'MessageCircle', 'Send',
  'Phone', 'PhoneCall', 'Video', 'Mic', 'Volume2', 'Megaphone',
  // Soporte y ayuda
  'LifeBuoy', 'HelpCircle', 'Info', 'CircleHelp',
  // Ubicación
  'MapPin', 'Map', 'Navigation', 'Compass', 'Locate', 'Route', 'Signpost', 'Mountain', 'Trees',
  // Inmuebles y real estate
  'House', 'DoorOpen', 'DoorClosed', 'Fence', 'Warehouse',
  // Estacionamiento
  'ParkingSquare', 'CircleParking', 'SquareParking',
  // Archivos
  'File', 'FileText', 'FileCheck', 'FileSpreadsheet', 'FileImage', 'FileVideo', 'FileAudio',
  'Folder', 'FolderOpen', 'FolderTree', 'ClipboardList', 'ClipboardCheck',
  // Medios
  'Image', 'Images', 'Film', 'Clapperboard', 'Palette', 'Brush', 'PaintBucket',
  // Entretenimiento
  'Drum', 'Guitar', 'Piano', 'Ticket', 'Drama', 'Theater',
  // Acciones
  'Download', 'Upload', 'Share', 'Share2', 'ExternalLink', 'Copy', 'Clipboard',
  'Trash2', 'Edit', 'Edit3', 'Save', 'Plus', 'Minus', 'Check', 'X',
  // Flechas y dirección
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUpRight', 'ArrowDownRight',
  'ChevronUp', 'ChevronDown', 'ChevronLeft', 'ChevronRight', 'ChevronsUp', 'ChevronsDown',
  'RefreshCw', 'RotateCw', 'Repeat', 'Shuffle', 'Move', 'Maximize', 'Minimize',
  // Naturaleza y clima
  'Sun', 'Moon', 'CloudSun', 'CloudRain', 'Snowflake', 'Wind', 'Rainbow', 'Umbrella',
  'Leaf', 'TreePine', 'Flower', 'Sprout', 'Bug', 'Fish', 'Bird', 'Cat', 'Dog', 'Rabbit',
  // Mascotas
  'PawPrint', 'Turtle', 'Squirrel',
  // Religioso y espiritual
  'Church', 'Sparkles',
  // Formas y objetos
  'Circle', 'Square', 'Triangle', 'Hexagon', 'Pentagon', 'Octagon',
  'Hash', 'AtSign', 'Code', 'Terminal', 'Binary', 'Braces', 'Brackets',
  // Decoración y misc
  'Sparkle', 'PartyPopper', 'Flag', 'Bookmark', 'Pin', 'Paperclip',
  'Lightbulb', 'Flashlight', 'Wand2',
  'Music', 'Music2', 'Disc', 'Headset',
  'Layers', 'Layout', 'Grid', 'List', 'AlignJustify', 'Columns',
  // Emojis y expresiones
  'Smile', 'Frown', 'Meh', 'Laugh', 'Heart', 'HeartHandshake',
  'HandHeart', 'Handshake', 'Hand', 'Pointer',
  // Viajes y turismo
  'Luggage', 'Tent', 'Anchor', 'Sailboat', 'MountainSnow', 'Palmtree',
  'Hotel', 'Bed', 'Utensils', 'Martini',
  // Ciencia y educación
  'Atom', 'Beaker', 'Microscope', 'Telescope', 'Dna', 'Brain', 'FlaskConical',
]

export default function IconSelector({ value, onChange, label = 'Icono', className = '', color }: IconSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const uniqueIcons = [...new Set(COMMON_ICONS)]
  const filteredIcons = uniqueIcons.filter(icon =>
    icon.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelectIcon = (iconName: string) => {
    onChange(iconName)
    setIsOpen(false)
  }

  const renderIcon = (iconName: string, size: number = 20, iconColor?: string) => {
    const IconComponent = iconName.startsWith('Gi')
      ? (GiIcons as any)[iconName]
      : (LucideIcons as any)[iconName]
    if (!IconComponent) return null
    return <IconComponent size={size} style={iconColor ? { color: iconColor } : undefined} />
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="text-gray-700 dark:text-gray-300">
        {label}
      </Label>
      
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="w-full justify-start border-gray-300 dark:border-gray-700 dark:bg-gray-800"
      >
        {value ? (
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{
                backgroundColor: color ? `${color}20` : undefined,
              }}
            >
              {renderIcon(value, 18, color)}
            </div>
            <span>{value}</span>
          </div>
        ) : (
          <span className="text-gray-500">Seleccionar icono</span>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Seleccionar Icono</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar icono..."
                className="pl-10"
              />
            </div>

            {/* Grid de iconos */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-6 gap-2">
                {filteredIcons.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => handleSelectIcon(iconName)}
                    className={`
                      flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all
                      hover:bg-gray-100 dark:hover:bg-gray-800
                      ${value === iconName
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                      }
                    `}
                  >
                    {renderIcon(iconName, 24)}
                    <span className="text-xs mt-1 text-center truncate w-full">
                      {iconName}
                    </span>
                  </button>
                ))}
              </div>

              {filteredIcons.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No se encontraron iconos
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
