// Prueba de importación desde fuera del directorio sameep
import {
  SameepDataCollectorCorregido,
  Cliente,
  Suministro,
  Comprobante,
  DatosRecolectados
} from './sameep/sameep-corregido';

console.log('🧪 PRUEBA EXTERNA: Importando desde fuera del directorio sameep...');

// Verificar que podemos usar las interfaces desde otro directorio
function procesarDatosExternos(datos: DatosRecolectados): string {
  return `Procesando ${datos.totalClientes} clientes desde módulo externo`;
}

function crearClienteExterno(id: string, nombre: string): Cliente {
  return {
    id,
    nombre,
    suministros: []
  };
}

// Crear datos de prueba
const clienteExterno = crearClienteExterno("EXT001", "Cliente Externo");
const datosExternos: DatosRecolectados = {
  clientes: [clienteExterno],
  totalClientes: 1,
  totalSuministros: 0,
  totalComprobantes: 0,
  totalComprobantesConPdf: 0,
  totalComprobantesSinPdf: 0,
  fechaRecoleccion: new Date(),
  clientesProcesados: 1
};

console.log('✅ Importación externa exitosa');
console.log('✅ Funciones externas funcionando');
console.log(`✅ ${procesarDatosExternos(datosExternos)}`);
console.log(`✅ Cliente creado externamente: ${clienteExterno.nombre}`);

// Verificar instanciación externa
try {
  const collectorExterno = new SameepDataCollectorCorregido();
  console.log('✅ SameepDataCollectorCorregido instanciado desde módulo externo');
} catch (error) {
  console.error('❌ Error en instanciación externa:', error);
}

console.log('\n🎉 PRUEBA EXTERNA COMPLETADA EXITOSAMENTE!');
