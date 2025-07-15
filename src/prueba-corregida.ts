import * as dotenv from 'dotenv';
import { SameepDataCollectorCorregido } from './sameep-corregido';

dotenv.config();

// Prueba del script corregido
async function pruebaCorregida() {
  console.log('🧪 Iniciando prueba del script corregido...');

  const collector = new SameepDataCollectorCorregido();

  try {
    await collector.procesarTodo();
    console.log('✅ Prueba completada exitosamente');

  } catch (error) {
    console.error('❌ Error en la prueba:', error);
  }
}

pruebaCorregida();
