import { SameepDataCollectorCorregido } from './sameep-corregido';
import { ProcesadorPDFsDB } from './procesador-pdfs-db';
import * as path from 'path';

/**
 * Script completo que ejecuta ambas fases:
 * Fase 1: Recolección de datos con URLs de PDFs
 * Fase 2: Descarga de PDFs y guardado en base de datos
 */
async function procesoCompleto() {
  console.log('🚀 Iniciando proceso completo de SAMEEP...');
  console.log('📋 FASE 1: Recolección de datos y URLs de PDFs');

  let rutaJSON: string = '';

  try {
    // === FASE 1: Recolección de datos ===
    const recolector = new SameepDataCollectorCorregido();
    await recolector.procesarTodo();

    // Obtener la ruta del último archivo JSON generado
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    rutaJSON = path.join(process.cwd(), 'datos', `sameep-datos-corregidos-${timestamp}.json`);

    // Buscar el archivo JSON más reciente
    const fs = require('fs');
    const datosDir = path.join(process.cwd(), 'datos');
    const archivos = fs.readdirSync(datosDir)
      .filter((archivo: string) => archivo.startsWith('sameep-datos-corregidos-') && archivo.endsWith('.json'))
      .map((archivo: string) => ({
        nombre: archivo,
        ruta: path.join(datosDir, archivo),
        stats: fs.statSync(path.join(datosDir, archivo))
      }))
      .sort((a: any, b: any) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

    if (archivos.length === 0) {
      throw new Error('No se encontró ningún archivo JSON generado');
    }

    rutaJSON = archivos[0].ruta;
    console.log(`✅ FASE 1 completada. Archivo generado: ${rutaJSON}`);

    // === PAUSA ENTRE FASES ===
    console.log('\n⏳ Esperando 5 segundos antes de iniciar FASE 2...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // === FASE 2: Procesamiento de PDFs y base de datos ===
    console.log('\n📋 FASE 2: Descarga de PDFs y guardado en base de datos');

    const procesador = new ProcesadorPDFsDB();
    await procesador.inicializar();
    await procesador.procesarArchivoJSON(rutaJSON);
    await procesador.cerrar();

    console.log('✅ FASE 2 completada.');

    // === RESUMEN FINAL ===
    console.log('\n🎉 PROCESO COMPLETO FINALIZADO!');
    console.log('📊 Resumen:');
    console.log(`   ✅ Datos recolectados y guardados en: ${rutaJSON}`);
    console.log(`   ✅ PDFs descargados en: facturas/pdfs/`);
    console.log(`   ✅ Datos guardados en MongoDB`);
    console.log('\n🔍 Próximos pasos:');
    console.log('   - Revisar los PDFs descargados en facturas/pdfs/');
    console.log('   - Verificar los datos en MongoDB');
    console.log('   - Revisar el archivo JSON para análisis adicional');

  } catch (error) {
    console.error('❌ Error en el proceso completo:', error);

    if (rutaJSON) {
      console.log(`\n🔍 Para debugging, revisar el archivo: ${rutaJSON}`);
    }

    process.exit(1);
  }
}

// Función para solo recolectar datos (sin procesar PDFs)
async function soloRecoleccion() {
  console.log('📋 Ejecutando solo recolección de datos...');

  try {
    const recolector = new SameepDataCollectorCorregido();
    await recolector.procesarTodo();
    console.log('✅ Recolección completada. Usar procesador-pdfs-db.ts para procesar PDFs.');
  } catch (error) {
    console.error('❌ Error en la recolección:', error);
    process.exit(1);
  }
}

// Función para solo procesar PDFs desde un JSON existente
async function soloProcesarPDFs(rutaJSON: string) {
  console.log(`📋 Procesando PDFs desde: ${rutaJSON}`);

  try {
    const procesador = new ProcesadorPDFsDB();
    await procesador.inicializar();
    await procesador.procesarArchivoJSON(rutaJSON);
    await procesador.cerrar();
    console.log('✅ Procesamiento de PDFs completado.');
  } catch (error) {
    console.error('❌ Error procesando PDFs:', error);
    process.exit(1);
  }
}

// Manejo de argumentos de línea de comandos
if (require.main === module) {
  const args = process.argv.slice(2);
  const comando = args[0];

  switch (comando) {
    case 'completo':
      procesoCompleto();
      break;
    case 'recoleccion':
      soloRecoleccion();
      break;
    case 'pdfs':
      const rutaJSON = args[1];
      if (!rutaJSON) {
        console.error('❌ Uso: npx ts-node src/proceso-completo.ts pdfs <ruta-al-json>');
        process.exit(1);
      }
      soloProcesarPDFs(rutaJSON);
      break;
    default:
      console.log('🚀 Uso del script:');
      console.log('  npx ts-node src/proceso-completo.ts completo     # Proceso completo (recolección + PDFs + DB)');
      console.log('  npx ts-node src/proceso-completo.ts recoleccion  # Solo recolección de datos');
      console.log('  npx ts-node src/proceso-completo.ts pdfs <json>  # Solo procesar PDFs desde JSON');
      console.log('\n💡 Por defecto ejecuta el proceso completo...');
      procesoCompleto();
  }
}

export { procesoCompleto, soloRecoleccion, soloProcesarPDFs };
