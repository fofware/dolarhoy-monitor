// ARCHIVO DEPRECADO - Usa procesarTodo() que fue comentada
// Se reemplazó por el sistema de dos fases: ejecutar-sameep-fase1.ts y ejecutar-sameep-fase2.ts

// import { SameepDataCollector } from './sameep-class';

// async function main() {
//   console.log('🚀 Iniciando sistema SAMEEP completo...');

//   const collector = new SameepDataCollector();

//   try {
//     await collector.procesarTodo();
//     console.log('✅ Proceso completado exitosamente!');
//   } catch (error) {
//     console.error('❌ Error en el proceso:', error);
//     process.exit(1);
//   }
// }

// // Ejecutar solo si este archivo es el principal
// if (require.main === module) {
//   main().catch(console.error);
// }
