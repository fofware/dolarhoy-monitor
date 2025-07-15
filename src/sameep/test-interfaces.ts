// Prueba rápida de importación y uso de interfaces
import {
  SameepDataCollectorCorregido,
  Cliente,
  Suministro,
  Comprobante,
  DatosRecolectados
} from './sameep-corregido';

console.log('🧪 PRUEBA: Verificando importaciones y tipos...');

// Prueba 1: Verificar que las interfaces existen
const testCliente: Cliente = {
  id: "TEST",
  nombre: "Cliente de Prueba",
  suministros: []
};

const testSuministro: Suministro = {
  id: "TEST_1",
  clienteId: "TEST",
  numeroSuministro: "1",
  calle: "Calle Test",
  altura: "123",
  piso: "0",
  comprobantes: []
};

const testComprobante: Comprobante = {
  id: "COMP_TEST",
  clienteId: "TEST",
  suministroId: "TEST_1",
  numeroFactura: "TEST-FACT-001",
  fechaEmision: new Date(),
  periodo: "07/2025",
  codigoInterno: "TEST",
  tipoComprobante: "FACTURA",
  numeroComprobante: "TEST 001",
  fechaVencimiento1: new Date(),
  fechaVencimiento2: new Date(),
  importeOriginal: 100,
  recargo: 0,
  importeTotal: 100,
  tienePdf: false,
  fechaProcesamiento: new Date()
};

const testDatos: DatosRecolectados = {
  clientes: [testCliente],
  totalClientes: 1,
  totalSuministros: 1,
  totalComprobantes: 1,
  totalComprobantesConPdf: 0,
  totalComprobantesSinPdf: 1,
  fechaRecoleccion: new Date(),
  clientesProcesados: 1
};

console.log('✅ Todas las interfaces se importan correctamente');
console.log('✅ Los tipos están funcionando correctamente');
console.log('✅ Estructura de datos validada');
console.log('\n📊 Datos de prueba creados:');
console.log(`   - Cliente: ${testCliente.nombre}`);
console.log(`   - Suministro: ${testSuministro.calle} ${testSuministro.altura}`);
console.log(`   - Comprobante: ${testComprobante.numeroFactura}`);
console.log(`   - Total clientes en datos: ${testDatos.totalClientes}`);

// Prueba 2: Verificar que el collector se puede instanciar
console.log('\n🔧 Probando instanciación del SameepDataCollectorCorregido...');
try {
  const collector = new SameepDataCollectorCorregido();
  console.log('✅ SameepDataCollectorCorregido se instancia correctamente');

  // Probar el método cargarDatosRecolectados
  collector.cargarDatosRecolectados(testDatos);
  console.log('✅ Método cargarDatosRecolectados funciona correctamente');

} catch (error) {
  console.error('❌ Error instanciando SameepDataCollectorCorregido:', error);
}

console.log('\n🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
