import { SameepDataCollectorCorregido } from './sameep-corregido';

async function main() {
  console.log('🚀 Iniciando sistema SAMEEP completo...');

  const collector = new SameepDataCollectorCorregido();

  try {
    await collector.procesarTodo();
    console.log('✅ Proceso completado exitosamente!');
  } catch (error) {
    console.error('❌ Error en el proceso:', error);
    process.exit(1);
  }
}

// Ejecutar solo si este archivo es el principal
if (require.main === module) {
  main().catch(console.error);
}
