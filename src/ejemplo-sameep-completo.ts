import { SameepDataCollector } from './sameep-completo';

// Script de ejemplo para probar la recolección completa
async function ejemploUso() {
  console.log('🧪 Iniciando ejemplo de uso del sistema completo...');

  const collector = new SameepDataCollector();

  try {
    // Procesar todo el sistema
    await collector.procesarTodo();

    console.log('✅ Ejemplo completado exitosamente');

  } catch (error) {
    console.error('❌ Error en el ejemplo:', error);
  }
}

// Solo ejecutar si este archivo se llama directamente
if (require.main === module) {
  ejemploUso();
}
