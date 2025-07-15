// Ejemplo de uso de las interfaces exportadas de SAMEEP
import {
  SameepDataCollector,
  Cliente,
  Suministro,
  Comprobante,
  DatosRecolectados
} from './sameep-class';

/**
 * Este archivo muestra cómo usar las interfaces exportadas de SAMEEP
 * en otros módulos del proyecto.
 */

// Ejemplo 1: Crear un cliente con tipado completo
const clienteEjemplo: Cliente = {
  id: "61141",
  nombre: "EJEMPLO CLIENTE PRUEBA",
  suministros: []
};

// Ejemplo 2: Crear un suministro con tipado completo
const suministroEjemplo: Suministro = {
  id: "61141_1",
  clienteId: "61141",
  numeroSuministro: "1",
  calle: "AV. EJEMPLO",
  altura: "123",
  piso: "0",
  comprobantes: []
};

// Ejemplo 3: Crear un comprobante con tipado completo
const comprobanteEjemplo: Comprobante = {
  id: "COMP_61141_1",
  clienteId: "61141",
  suministroId: "61141_1",
  numeroFactura: "1-61141-1-15/07/25-3-B-1-12345678",
  fechaEmision: new Date(),
  periodo: "07/2025",
  codigoInterno: "3",
  tipoComprobante: "FACTURA",
  numeroComprobante: "B 1 12345678",
  fechaVencimiento1: new Date(),
  fechaVencimiento2: new Date(),
  importeOriginal: 1500.00,
  recargo: 0,
  importeTotal: 1500.00,
  tienePdf: true,
  urlPdf: "https://ejemplo.com/pdf.pdf",
  nombreArchivoPdf: "factura_ejemplo.pdf",
  fechaProcesamiento: new Date()
};

// Ejemplo 4: Crear datos recolectados con tipado completo
const datosEjemplo: DatosRecolectados = {
  clientes: [clienteEjemplo],
  totalClientes: 1,
  totalSuministros: 1,
  totalComprobantes: 1,
  totalComprobantesConPdf: 1,
  totalComprobantesSinPdf: 0,
  fechaRecoleccion: new Date(),
  clientesProcesados: 1
};

// Ejemplo 5: Función que recibe datos tipados
function procesarDatos(datos: DatosRecolectados): void {
  console.log(`Procesando ${datos.totalClientes} clientes`);

  datos.clientes.forEach((cliente: Cliente) => {
    console.log(`Cliente: ${cliente.nombre}`);

    cliente.suministros.forEach((suministro: Suministro) => {
      console.log(`  Suministro: ${suministro.calle} ${suministro.altura}`);

      suministro.comprobantes.forEach((comprobante: Comprobante) => {
        console.log(`    Comprobante: ${comprobante.numeroFactura}`);
        console.log(`    Total: $${comprobante.importeTotal}`);
        console.log(`    PDF disponible: ${comprobante.tienePdf ? 'Sí' : 'No'}`);
      });
    });
  });
}

// Ejemplo 6: Función helper para validar tipos
function esClienteValido(obj: any): obj is Cliente {
  return obj &&
         typeof obj.id === 'string' &&
         typeof obj.nombre === 'string' &&
         Array.isArray(obj.suministros);
}

function esDatosRecolectadosValido(obj: any): obj is DatosRecolectados {
  return obj &&
         Array.isArray(obj.clientes) &&
         typeof obj.totalClientes === 'number' &&
         obj.fechaRecoleccion instanceof Date;
}

// Exportar ejemplos para uso en tests
export {
  clienteEjemplo,
  suministroEjemplo,
  comprobanteEjemplo,
  datosEjemplo,
  procesarDatos,
  esClienteValido,
  esDatosRecolectadosValido
};

console.log('✅ Interfaces SAMEEP cargadas y tipadas correctamente');
