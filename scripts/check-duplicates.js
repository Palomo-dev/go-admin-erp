// Script para verificar duplicados en las listas de ciudades

// Leer el archivo de ciudades (sin TypeScript)
const fs = require('fs');
const path = require('path');

const citiesFilePath = path.join(__dirname, '../src/lib/data/cities.ts');
const content = fs.readFileSync(citiesFilePath, 'utf-8');

// Extraer arrays usando regex
const colombianMatch = content.match(/export const colombianCities = \[([\s\S]*?)\] as const;/);
const internationalMatch = content.match(/export const internationalCities = \[([\s\S]*?)\] as const;/);

function extractCities(arrayContent) {
  const cities = [];
  const regex = /'([^']+)'/g;
  let match;
  while ((match = regex.exec(arrayContent)) !== null) {
    cities.push(match[1]);
  }
  return cities;
}

function findDuplicates(arr, label) {
  const counts = {};
  const duplicates = [];
  
  arr.forEach((item, index) => {
    if (!counts[item]) {
      counts[item] = { count: 0, indices: [] };
    }
    counts[item].count++;
    counts[item].indices.push(index + 1);
  });
  
  Object.entries(counts).forEach(([city, info]) => {
    if (info.count > 1) {
      duplicates.push({ city, count: info.count, indices: info.indices });
    }
  });
  
  if (duplicates.length > 0) {
    console.log(`\n❌ Duplicados encontrados en ${label}:`);
    duplicates.forEach(({ city, count, indices }) => {
      console.log(`   - "${city}": ${count} veces (posiciones: ${indices.join(', ')})`);
    });
    return false;
  } else {
    console.log(`\n✅ Sin duplicados en ${label} (${arr.length} ciudades)`);
    return true;
  }
}

console.log('🔍 Verificando duplicados en listas de ciudades...\n');

const colombianCities = extractCities(colombianMatch[1]);
const internationalCities = extractCities(internationalMatch[1]);

const colombianOk = findDuplicates(colombianCities, 'colombianCities');
const internationalOk = findDuplicates(internationalCities, 'internationalCities');

// Verificar duplicados entre ambas listas
const allCities = [...colombianCities, ...internationalCities];
const duplicatesBetweenLists = [];
const cityCounts = {};

allCities.forEach(city => {
  cityCounts[city] = (cityCounts[city] || 0) + 1;
});

Object.entries(cityCounts).forEach(([city, count]) => {
  if (count > 1) {
    duplicatesBetweenLists.push(city);
  }
});

if (duplicatesBetweenLists.length > 0) {
  console.log(`\n⚠️  Ciudades que aparecen en ambas listas:`);
  duplicatesBetweenLists.forEach(city => {
    console.log(`   - "${city}"`);
  });
}

console.log('\n' + '='.repeat(50));
if (colombianOk && internationalOk && duplicatesBetweenLists.length === 0) {
  console.log('✅ TODAS LAS LISTAS ESTÁN CORRECTAS\n');
  process.exit(0);
} else {
  console.log('❌ SE ENCONTRARON PROBLEMAS\n');
  process.exit(1);
}
