import { SameepDataCollectorCorregido } from './sameep-corregido';

/**
 * Script de prueba para verificar que se capturen las URLs de los PDFs
 */
async function pruebaCapturarURLs() {
  console.log('🧪 Probando captura de URLs de PDFs...');

  try {
    const recolector = new SameepDataCollectorCorregido();
    await recolector.procesarTodo();

    console.log('✅ Prueba completada. Revisar el archivo JSON generado para verificar las URLs.');
  } catch (error) {
    console.error('❌ Error en la prueba:', error);
  }
}

pruebaCapturarURLs();
