import * as fs from 'fs-extra';
import path from 'path';

// Mostrar los archivos en la carpeta de resultados
const resultadosDir = path.join('.', 'resultados');
const archivos = fs.readdirSync(resultadosDir);

console.log('Archivos de resultados disponibles:');
archivos.forEach(archivo => {
  console.log(archivo);
  
  // Leer y mostrar el contenido del archivo
  try {
    const contenido = fs.readJsonSync(path.join(resultadosDir, archivo));
    console.log('\nContenido del archivo:');
    console.log(JSON.stringify(contenido, null, 2));
  } catch (error) {
    console.error(`Error al leer el archivo ${archivo}:`, error);
  }
});

// Si no hay archivos, mostrar un mensaje
if (archivos.length === 0) {
  console.log('No se encontraron archivos de resultados');
}
