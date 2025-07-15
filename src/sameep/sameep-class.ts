import * as dotenv from 'dotenv';
import * as fs from 'fs-extra';
import { Db } from 'mongodb';
import * as path from 'path';
import { chromium } from 'playwright';
// import pdfParse from 'pdf-parse'; // Comentado temporalmente para evitar error de compilación

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

/**
 * SAMEEP Data Collector - Sistema de dos fases
 *
 * FUNCIONES ACTIVAS (usadas en los scripts):
 * - inicializarBrowser()
 * - login()
 * - recolectarClientes()
 * - procesarClienteConReintentos()
 * - procesarCliente()
 * - extraerDatosCliente()
 * - extraerDatosSuministros()
 * - procesarSuministroConReintentos()
 * - procesarComprobantes()
 * - actualizarClienteIdReal()
 * - volverAListaClientes()
 * - guardarDatosEnJSON()
 * - cerrar()
 * - cargarDatosRecolectados()
 * - navegarACliente()
 * - navegarASuministro()
 * - obtenerUrlPDF()
 * - descargarPDF()
 *
 * FUNCIONES COMENTADAS (no se usan):
 * - conectarMongoDB() - MongoDB no se usa en el sistema actual
 * - procesarTodo() - Se reemplazó por sistema de dos fases separadas
 * - descargarTodosPDFs() - Se usa obtenerUrlPDF() individualment en fase 2
 * - tomarScreenshot() - Solo para debugging, no en flujo principal
 */

// Interfaces exportadas para uso en otros módulos
export interface Cliente {
  id: string; // Número de cliente (ej: "61141")
  nombre: string; // Nombre completo del cliente
  suministros: Suministro[];
}

export interface Suministro {
  id: string; // Número de suministro
  clienteId: string;
  numeroSuministro: string; // Número del suministro
  calle: string; // Nombre de la calle
  altura: string; // Altura/número de la calle
  piso: string; // Piso del suministro
  comprobantes: Comprobante[];
}

export interface Comprobante {
  id: string;
  clienteId: string;
  suministroId: string;
  numeroFactura: string; // Columna 2: Número completo de factura
  fechaEmision: Date; // Columna 3: Fecha de emisión
  periodo: string; // Columna 4: Período (MM/YYYY)
  codigoInterno: string; // Columna 5: Código interno
  tipoComprobante: string; // Columna 6: FACTURA, etc.
  numeroComprobante: string; // Columnas 7+8+9: Número del comprobante
  fechaVencimiento1: Date; // Columna 10: Primer vencimiento
  fechaVencimiento2: Date; // Columna 11: Segundo vencimiento
  importeOriginal: number; // Columna 12: Importe original
  recargo: number; // Columna 13: Recargo
  importeTotal: number; // Columna 14: Importe total
  tienePdf: boolean;
  urlPdf?: string;
  nombreArchivoPdf?: string; // Nombre sugerido para el archivo
  hash?: string;
  contenidoPdf?: string;
  archivoPdf?: Buffer;
  fechaProcesamiento: Date;
}

export interface DatosRecolectados {
  clientes: Cliente[];
  totalClientes: number;
  totalSuministros: number;
  totalComprobantes: number;
  totalComprobantesConPdf: number;
  totalComprobantesSinPdf: number;
  fechaRecoleccion: Date;
  clientesProcesados: number;
}

class SameepDataCollector {
  private browser: any;
  private context: any;
  private page: any;
  private db: Db | null = null;
  private datosRecolectados: DatosRecolectados;

  // Configuración de reintentos
  private readonly MAX_REINTENTOS = 3;
  private readonly TIEMPO_ESPERA_REINTENTO = 10000; // 10 segundos entre reintentos

  constructor() {
    this.datosRecolectados = {
      clientes: [],
      totalClientes: 0,
      totalSuministros: 0,
      totalComprobantes: 0,
      totalComprobantesConPdf: 0,
      totalComprobantesSinPdf: 0,
      fechaRecoleccion: new Date(),
      clientesProcesados: 0
    };
  }

  // Método para cargar datos desde archivo externo
  cargarDatosRecolectados(datos: DatosRecolectados): void {
    this.datosRecolectados = datos;
    console.log(`📂 Datos cargados: ${datos.totalClientes} clientes, ${datos.totalComprobantes} comprobantes`);
  }

  // FUNCIÓN NO UTILIZADA - MongoDB no se usa en el sistema actual
  // async conectarMongoDB(): Promise<void> {
  //   const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  //   const dbName = process.env.MONGODB_DB || 'sameep_facturas';

  //   try {
  //     const client = new MongoClient(mongoUrl);
  //     await client.connect();
  //     this.db = client.db(dbName);
  //     console.log('📚 Conectado a MongoDB exitosamente');
  //   } catch (error) {
  //     console.error('❌ Error conectando a MongoDB:', error);
  //     throw error;
  //   }
  // }

  async inicializarBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 200,
    });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async login(): Promise<void> {
    console.log('🔐 Navegando a la página de login...');
    await this.page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.gamexamplelogin');

    const user = process.env.SAMEEP_USER;
    const pass = process.env.SAMEEP_PASS;
    if (!user || !pass) throw new Error('Credenciales no encontradas en .env');

    console.log(`🔑 Iniciando sesión con el usuario: ${user}...`);
    await this.page.getByPlaceholder('Nombre de usuario').fill(user);
    await this.page.getByPlaceholder('Contraseña').fill(pass);
    await this.page.getByRole('button', { name: 'Iniciar Sesion' }).click();
    await this.page.waitForURL('**/com.sameep.wpseleccionarcliente');
    console.log('✅ Login exitoso.');
  }

  async recolectarClientes(): Promise<Cliente[]> {
    console.log('👥 Recolectando información de clientes...');
    const clientes: Cliente[] = [];

    try {
      // Esperar carga completa
      await this.page.waitForTimeout(15000);
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });
      await this.page.waitForSelector('[id^="span_vINGRESAR_"]', { timeout: 30000 });

      const elementosClientes = await this.page.locator('[id^="span_vINGRESAR_"]').all();
      console.log(`🔍 Encontrados ${elementosClientes.length} elementos de clientes`);

      // Obtener datos de la tabla principal (tabla 2)
      const tablaClientes = this.page.locator('table').nth(1);
      const filasClientes = await tablaClientes.locator('tr').all();

      for (let i = 0; i < elementosClientes.length; i++) {
        try {
          const elemento = elementosClientes[i];
          const clienteId = await elemento.getAttribute('id');
          const numeroCliente = clienteId?.replace('span_vINGRESAR_', '') || '';

          // Obtener datos de la fila correspondiente
          const fila = filasClientes[i + 1]; // +1 porque la primera fila puede ser encabezado
          const celdas = await fila.locator('td').allTextContents();

          const cliente: Cliente = {
            id: numeroCliente,
            nombre: 'Por determinar', // Se obtendrá al entrar al cliente
            suministros: []
          };

          clientes.push(cliente);
          console.log(`📋 Cliente ${i + 1}/${elementosClientes.length}: ${numeroCliente}`);

        } catch (error) {
          console.error(`❌ Error procesando cliente ${i}:`, error);
        }
      }

      this.datosRecolectados.clientes = clientes;
      this.datosRecolectados.totalClientes = clientes.length;
      return clientes;

    } catch (error) {
      console.error('❌ Error en recolectarClientes:', error);
      return clientes;
    }
  }

  async procesarCliente(cliente: Cliente): Promise<void> {
    console.log(`🔄 Procesando cliente: ${cliente.id}`);

    try {
      // Entrar al cliente
      await this.page.locator(`#span_vINGRESAR_${cliente.id}`).getByRole('link', { name: 'Ingresar' }).click();
      await this.page.waitForTimeout(5000);
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });

      // Obtener nombre del cliente de la tabla 1
      await this.extraerDatosCliente(cliente);

      // Obtener datos de suministros de la tabla 2
      await this.extraerDatosSuministros(cliente);

      // Procesar cada suministro individualmente con reintentos
      const totalSuministros = cliente.suministros.length;
      console.log(`🏠 Cliente tiene ${totalSuministros} suministro(s)`);

      for (let i = 0; i < totalSuministros; i++) {
        const suministro = cliente.suministros[i];
        await this.procesarSuministroConReintentos(cliente, suministro, i, totalSuministros);
      }

      // Volver a la lista de clientes
      await this.volverAListaClientes();

    } catch (error) {
      console.error(`❌ Error procesando cliente ${cliente.id}:`, error);
      throw error; // Re-lanzar el error para que lo maneje el sistema de reintentos
    }
  }

  async extraerDatosCliente(cliente: Cliente): Promise<void> {
    try {
      // Tabla 1: [Cliente: | Número de Socio61141 | / | NUMERO DE SUMINISTRO1 | - | Apellido y NombreDEL GROSSO AIDA ROSA SUSANA]
      const tabla1 = this.page.locator('table').nth(0);
      const fila1 = tabla1.locator('tr').first();
      const celdas = await fila1.locator('td').allTextContents();

      if (celdas.length >= 4) {
        // El nombre está en la última celda, después de "Apellido y Nombre"
        const ultimaCelda = celdas[celdas.length - 1];
        const nombreCompleto = ultimaCelda?.replace('Apellido y Nombre', '').trim();
        cliente.nombre = nombreCompleto || `Cliente ${cliente.id}`;
      }

      console.log(`👤 Nombre del cliente: ${cliente.nombre}`);
    } catch (error) {
      console.error(`❌ Error extrayendo datos del cliente ${cliente.id}:`, error);
      cliente.nombre = `Cliente ${cliente.id}`;
    }
  }

  async extraerDatosSuministros(cliente: Cliente): Promise<void> {
    try {
      // Tabla 2: [ |  |  |      1 | RESISTENCIA | AV. 25 DE MAYO |   370 |  0 |  | Saldo | Consumos | Intimación]
      const tabla2 = this.page.locator('table').nth(1);
      const filas = await tabla2.locator('tr').all();

      for (let i = 1; i < filas.length; i++) { // Empezar desde 1 para saltar encabezado
        const celdas = await filas[i].locator('td').allTextContents();

        if (celdas.length >= 8) {
          const numeroSuministro = celdas[3]?.trim() || '';
          const calle = celdas[5]?.trim() || '';
          const altura = celdas[6]?.trim() || '';
          const piso = celdas[7]?.trim() || '';

          if (numeroSuministro) {
            const suministro: Suministro = {
              id: `${cliente.id}_${numeroSuministro}`,
              clienteId: cliente.id,
              numeroSuministro,
              calle,
              altura,
              piso,
              comprobantes: []
            };

            cliente.suministros.push(suministro);
            this.datosRecolectados.totalSuministros++;
            console.log(`🏠 Suministro: ${numeroSuministro} - ${calle} ${altura}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error extrayendo suministros del cliente ${cliente.id}:`, error);
    }
  }

  async procesarComprobantes(cliente: Cliente, suministroEspecifico?: Suministro): Promise<void> {
    const suministroId = suministroEspecifico?.numeroSuministro || 'todos';
    console.log(`📄 Procesando comprobantes para cliente: ${cliente.id}, suministro: ${suministroId}`);

    try {
      // Tabla 4 contiene los comprobantes
      const tabla4 = this.page.locator('table').nth(3);
      const filas = await tabla4.locator('tr').all();

      // Buscar botones de PDF
      const botonesPdf = await this.page.locator('[id^="vIMPRIMIRSALDO_"]').all();
      console.log(`📄 Encontrados ${botonesPdf.length} botones de PDF`);

      let contadorComprobantes = 0;
      for (let i = 1; i < filas.length; i++) { // Empezar desde 1 para saltar encabezado
        const celdas = await filas[i].locator('td').allTextContents();

        if (celdas.length >= 15 && celdas[1]?.trim()) { // Verificar que tenga datos y número de factura
          const comprobante = this.parsearComprobante(celdas, cliente, i);

          // Si estamos procesando un suministro específico, verificar que el comprobante pertenezca a ese suministro
          if (suministroEspecifico) {
            const match = comprobante.numeroFactura.match(/^(\d+)-(\d+)-/);
            if (match && match[1] === suministroEspecifico.numeroSuministro) {
              // El comprobante pertenece a este suministro
              comprobante.suministroId = suministroEspecifico.id;

              // Determinar si tiene PDF verificando la imagen en la columna 15
              const fila = filas[i];
              const celdaPdf = fila.locator('td').nth(14); // Columna 15 (índice 14)
              const botonPdf = celdaPdf.locator('img[id^="vIMPRIMIRSALDO_"]');
              const tieneBotonPdf = await botonPdf.count() > 0;

              if (tieneBotonPdf) {
                // CLAVE: Verificar si la IMAGEN está oculta (no la celda)
                const estiloImagen = await botonPdf.getAttribute('style') || '';
                const imagenOculta = estiloImagen.includes('display:none') || estiloImagen.includes('display: none');

                if (imagenOculta) {
                  // Comprobante SIN PDF (imagen oculta)
                  comprobante.tienePdf = false;
                  console.log(`📄 ${comprobante.numeroFactura} - SIN PDF (imagen oculta)`);
                } else {
                  // Comprobante CON PDF (imagen visible)
                  comprobante.tienePdf = true;
                  console.log(`📄 ${comprobante.numeroFactura} - CON PDF (imagen visible)`);
                }
              } else {
                // No hay botón PDF en la columna 15
                comprobante.tienePdf = false;
                console.log(`📄 ${comprobante.numeroFactura} - SIN botón PDF`);
              }

              if (comprobante.tienePdf) {
                // En la fase 1, capturamos la URL del PDF para usarla en Fase 2
                console.log(`📄 ${comprobante.numeroFactura} - CON PDF (capturando URL...)`);
                try {
                  const urlPdf = await this.obtenerUrlPDF(comprobante);
                  if (urlPdf) {
                    comprobante.urlPdf = urlPdf;
                    comprobante.nombreArchivoPdf = `${comprobante.numeroFactura.replace(/[^a-zA-Z0-9\-_\.]/g, '_')}.pdf`;
                    console.log(`✅ URL capturada: ${urlPdf.substring(0, 80)}...`);
                  } else {
                    console.log(`⚠️  No se pudo capturar URL para ${comprobante.numeroFactura}`);
                  }
                } catch (error) {
                  console.log(`❌ Error capturando URL para ${comprobante.numeroFactura}: ${error}`);
                }
                this.datosRecolectados.totalComprobantesConPdf++;
              } else {
                this.datosRecolectados.totalComprobantesSinPdf++;
                console.log(`📋 Comprobante sin PDF: ${comprobante.numeroFactura}`);
              }

              suministroEspecifico.comprobantes.push(comprobante);
              this.datosRecolectados.totalComprobantes++;
              contadorComprobantes++;
            }
          } else {
            // Comportamiento anterior para compatibilidad
            const tienePdf = i <= botonesPdf.length;
            comprobante.tienePdf = tienePdf;

            if (tienePdf) {
              console.log(`📋 Comprobante con PDF: ${comprobante.numeroFactura}`);
              this.datosRecolectados.totalComprobantesConPdf++;
            } else {
              console.log(`📋 Comprobante sin PDF: ${comprobante.numeroFactura}`);
              this.datosRecolectados.totalComprobantesSinPdf++;
            }

            // Agregar al primer suministro (o crear uno por defecto)
            if (cliente.suministros.length === 0) {
              const suministroDefault: Suministro = {
                id: `${cliente.id}_DEFAULT`,
                clienteId: cliente.id,
                numeroSuministro: '1',
                calle: 'Por determinar',
                altura: 'Por determinar',
                piso: 'Por determinar',
                comprobantes: []
              };
              cliente.suministros.push(suministroDefault);
              this.datosRecolectados.totalSuministros++;
            }

            cliente.suministros[0].comprobantes.push(comprobante);
            this.datosRecolectados.totalComprobantes++;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error procesando comprobantes del cliente ${cliente.id}:`, error);
    }
  }

  private parsearComprobante(celdas: string[], cliente: Cliente, indice: number): Comprobante {
    return {
      id: `COMP_${cliente.id}_${indice}`,
      clienteId: cliente.id,
      suministroId: cliente.suministros[0]?.id || `${cliente.id}_DEFAULT`,
      numeroFactura: celdas[1]?.trim() || '', // Columna 2
      fechaEmision: this.parsearFecha(celdas[2]?.trim()), // Columna 3
      periodo: celdas[3]?.trim() || '', // Columna 4
      codigoInterno: celdas[4]?.trim() || '', // Columna 5
      tipoComprobante: celdas[5]?.trim() || '', // Columna 6
      numeroComprobante: `${celdas[6]?.trim()} ${celdas[7]?.trim()} ${celdas[8]?.trim()}`.trim(), // Columnas 7+8+9
      fechaVencimiento1: this.parsearFecha(celdas[9]?.trim()), // Columna 10
      fechaVencimiento2: this.parsearFecha(celdas[10]?.trim()), // Columna 11
      importeOriginal: this.parsearMonto(celdas[11]?.trim()), // Columna 12
      recargo: this.parsearMonto(celdas[12]?.trim()), // Columna 13
      importeTotal: this.parsearMonto(celdas[13]?.trim()), // Columna 14
      tienePdf: false, // Se actualiza después
      fechaProcesamiento: new Date()
    };
  }

  private parsearFecha(fechaStr: string): Date {
    if (!fechaStr) return new Date();
    try {
      // Formato esperado: DD/MM/YYYY
      const partes = fechaStr.split('/');
      if (partes.length === 3) {
        const dia = parseInt(partes[0]);
        const mes = parseInt(partes[1]) - 1; // Los meses en JS van de 0-11
        const año = parseInt(partes[2]);
        return new Date(año, mes, dia);
      }
      return new Date();
    } catch {
      return new Date();
    }
  }

  private parsearMonto(montoStr: string): number {
    if (!montoStr) return 0;
    try {
      // Formato: "37.741,29" - punto como separador de miles, coma como decimal
      const numeroLimpio = montoStr.replace(/\./g, '').replace(',', '.');
      return parseFloat(numeroLimpio) || 0;
    } catch {
      return 0;
    }
  }

  async volverAListaClientes(): Promise<void> {
    await this.page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.wpseleccionarcliente');
    await this.page.waitForLoadState('networkidle');
  }

  async guardarDatosEnJSON(): Promise<void> {
    const datosPath = path.join(__dirname, '..', 'datos');
    await fs.ensureDir(datosPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivo = path.join(datosPath, `sameep-datos-corregidos-${timestamp}.json`);

    await fs.writeJSON(archivo, this.datosRecolectados, { spaces: 2 });
    console.log(`💾 Datos corregidos guardados en: ${archivo}`);
  }

  async cerrar(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  // FUNCIÓN NO UTILIZADA - Se usa procesarTodo() en lugar de este método completo
  // async procesarTodo(): Promise<void> {
  //   try {
  //     console.log('🚀 Iniciando recolección completa de datos SAMEEP...');

  //     await this.inicializarBrowser();
  //     await this.login();

  //     const clientes = await this.recolectarClientes();
  //     console.log(`📊 Total de clientes encontrados: ${clientes.length}`);

  //     // FASE 1: Recolectar TODOS los datos (sin descargar PDFs)
  //     console.log(`\n📋 FASE 1: Recolectando datos de TODOS los ${clientes.length} clientes...`);
  //     for (let i = 0; i < clientes.length; i++) {
  //       console.log(`\n🎯 Procesando cliente ${i + 1}/${clientes.length}: ${clientes[i].id}`);
  //       await this.procesarClienteConReintentos(clientes[i]);
  //     }

  //     // Guardar datos después de la recolección
  //     await this.guardarDatosEnJSON();

  //     // FASE 2: Descargar PDFs de todos los comprobantes que tienen PDF
  //     console.log(`\n📥 FASE 2: Descargando PDFs de todos los comprobantes...`);
  //     await this.descargarTodosPDFs();

  //     // Guardar datos finales con URLs de PDF
  //     await this.guardarDatosEnJSON();

  //     console.log('🎉 Proceso completo finalizado!');
  //     console.log(`📈 Estadísticas finales:`);
  //     console.log(`   - Total clientes encontrados: ${this.datosRecolectados.totalClientes}`);
  //     console.log(`   - Clientes procesados exitosamente: ${this.datosRecolectados.clientesProcesados}/${this.datosRecolectados.totalClientes}`);
  //     console.log(`   - Total suministros procesados: ${this.datosRecolectados.totalSuministros}`);
  //     console.log(`   - Total comprobantes encontrados: ${this.datosRecolectados.totalComprobantes}`);
  //     console.log(`   - Comprobantes con PDF: ${this.datosRecolectados.totalComprobantesConPdf}`);
  //     console.log(`   - Comprobantes sin PDF: ${this.datosRecolectados.totalComprobantesSinPdf}`);

  //     if (this.datosRecolectados.clientesProcesados === this.datosRecolectados.totalClientes) {
  //       console.log(`✅ Todos los clientes fueron procesados exitosamente!`);
  //     } else {
  //       const fallos = this.datosRecolectados.totalClientes - this.datosRecolectados.clientesProcesados;
  //       console.log(`⚠️ ${fallos} cliente(s) tuvieron errores durante el procesamiento`);
  //     }

  //   } catch (error) {
  //     console.error('❌ Error en el proceso principal:', error);
  //     throw error;
  //   } finally {
  //     await this.cerrar();
  //   }
  // }

  async actualizarClienteIdReal(cliente: Cliente, suministroActual?: Suministro): Promise<void> {
    try {
      // Obtener el primer número de factura de la tabla 4 para extraer el clienteId real
      const tabla4 = this.page.locator('table').nth(3);
      const primeraFila = tabla4.locator('tr').nth(1);
      const celdas = await primeraFila.locator('td').allTextContents();

      if (celdas.length >= 2 && celdas[1]?.trim()) {
        const numeroFactura = celdas[1].trim();
        // Formato: "1-61141-1-23/06/25-3-B-1-84919364"
        // Extraer el clienteId (61141) y suministroId (1)
        const match = numeroFactura.match(/^(\d+)-(\d+)-/);
        if (match) {
          const suministroIdReal = match[1];
          const clienteIdReal = match[2];

          console.log(`🆔 Cliente ID real: ${clienteIdReal} (era: ${cliente.id})`);
          console.log(`🆔 Suministro ID real: ${suministroIdReal}`);

          // Actualizar el cliente con el ID real si es la primera vez
          if (cliente.id !== clienteIdReal) {
            cliente.id = clienteIdReal;
          }

          // Actualizar el suministro específico si se proporciona
          if (suministroActual) {
            suministroActual.clienteId = clienteIdReal;
            suministroActual.numeroSuministro = suministroIdReal;
            suministroActual.id = `${clienteIdReal}_${suministroIdReal}`;
          } else {
            // Actualizar todos los suministros (comportamiento anterior)
            for (const suministro of cliente.suministros) {
              suministro.clienteId = clienteIdReal;
              suministro.numeroSuministro = suministroIdReal;
              suministro.id = `${clienteIdReal}_${suministroIdReal}`;
            }
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error actualizando IDs reales:`, error);
    }
  }

  async procesarClienteConReintentos(cliente: Cliente, intento: number = 1): Promise<void> {
    try {
      console.log(`🔄 Procesando cliente: ${cliente.id} (intento ${intento}/${this.MAX_REINTENTOS})`);
      await this.procesarCliente(cliente);
      this.datosRecolectados.clientesProcesados++;
    } catch (error) {
      console.error(`❌ Error en cliente ${cliente.id} (intento ${intento}):`, error);

      if (intento < this.MAX_REINTENTOS) {
        console.log(`🔄 Reintentando cliente ${cliente.id} en ${this.TIEMPO_ESPERA_REINTENTO/1000} segundos...`);
        await this.page.waitForTimeout(this.TIEMPO_ESPERA_REINTENTO);

        // Intentar volver a la lista de clientes antes del reintento
        try {
          await this.volverAListaClientes();
          await this.page.waitForTimeout(3000);
        } catch (backError) {
          console.error(`❌ Error volviendo a lista para reintento:`, backError);
        }

        // Reintento recursivo
        await this.procesarClienteConReintentos(cliente, intento + 1);
      } else {
        console.error(`💀 Cliente ${cliente.id} falló después de ${this.MAX_REINTENTOS} intentos`);
        // await this.tomarScreenshot(`error_final_cliente_${cliente.id}`); // Función comentada
      }
    }
  }

  async procesarSuministroConReintentos(cliente: Cliente, suministro: Suministro, indiceSuministro: number, totalSuministros: number, intento: number = 1): Promise<void> {
    try {
      console.log(`🔄 Procesando suministro ${indiceSuministro + 1}/${totalSuministros}: ${suministro.numeroSuministro} - ${suministro.calle} ${suministro.altura} (intento ${intento})`);

      // Ir a la sección de saldos específica de este suministro
      const enlacesSaldo = await this.page.getByRole('link', { name: 'Saldo' }).all();
      if (enlacesSaldo.length > indiceSuministro) {
        await enlacesSaldo[indiceSuministro].click();
        await this.page.waitForTimeout(5000);
        await this.page.waitForLoadState('networkidle', { timeout: 30000 });

        // Extraer clienteId real del primer comprobante de este suministro
        await this.actualizarClienteIdReal(cliente, suministro);

        // Procesar comprobantes específicos de este suministro
        await this.procesarComprobantes(cliente, suministro);

        // Volver a la vista anterior para el siguiente suministro (si no es el último)
        if (indiceSuministro < totalSuministros - 1) {
          await this.page.goBack();
          await this.page.waitForTimeout(3000);
          await this.page.waitForLoadState('networkidle', { timeout: 30000 });
        }
      } else {
        console.log(`⚠️ No se encontró enlace de saldo para suministro ${indiceSuministro + 1}`);
      }
    } catch (error) {
      console.error(`❌ Error procesando suministro ${indiceSuministro + 1} (intento ${intento}):`, error);

      if (intento < this.MAX_REINTENTOS) {
        console.log(`🔄 Reintentando suministro ${indiceSuministro + 1} en ${this.TIEMPO_ESPERA_REINTENTO/1000} segundos...`);
        await this.page.waitForTimeout(this.TIEMPO_ESPERA_REINTENTO);

        // Intentar volver a la vista de suministros
        try {
          await this.page.goBack();
          await this.page.waitForTimeout(3000);
          await this.page.waitForLoadState('networkidle', { timeout: 30000 });
        } catch (backError) {
          console.error(`❌ Error volviendo para reintento de suministro:`, backError);
        }

        // Reintento recursivo
        await this.procesarSuministroConReintentos(cliente, suministro, indiceSuministro, totalSuministros, intento + 1);
      } else {
        console.error(`💀 Suministro ${indiceSuministro + 1} del cliente ${cliente.id} falló después de ${this.MAX_REINTENTOS} intentos`);
      }
    }
  }

  // FUNCIÓN NO UTILIZADA - Se usa para debugging, no en flujo principal
  // async tomarScreenshot(nombre: string): Promise<void> {
  //   try {
  //     const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  //     const ruta = `facturas/screenshots/${nombre}_${timestamp}.png`;
  //     await this.page.screenshot({ path: ruta, fullPage: true });
  //     console.log(`📸 Screenshot guardado: ${ruta}`);
  //   } catch (error) {
  //     console.error(`❌ Error tomando screenshot:`, error);
  //   }
  // }

  // FUNCIÓN NO UTILIZADA - Se usa obtenerUrlPDF() para fase 2, no descarga completa
  // async descargarTodosPDFs(): Promise<void> {
  //   console.log('📥 Iniciando descarga de PDFs...');

  //   let totalPDFsProcesados = 0;
  //   let totalPDFsDescargados = 0;
  //   let totalPDFsConError = 0;

  //   for (const cliente of this.datosRecolectados.clientes) {
  //     console.log(`\n👤 Descargando PDFs del cliente: ${cliente.id} - ${cliente.nombre}`);

  //     for (const suministro of cliente.suministros) {
  //       console.log(`🏠 Procesando suministro: ${suministro.numeroSuministro} - ${suministro.calle} ${suministro.altura}`);

  //       // Navegar al cliente y suministro específico
  //       try {
  //         await this.navegarACliente(cliente.id);
  //         await this.navegarASuministro(suministro);

  //         // Procesar PDFs de este suministro
  //         for (const comprobante of suministro.comprobantes) {
  //           if (comprobante.tienePdf) {
  //             totalPDFsProcesados++;
  //             console.log(`📄 ${totalPDFsProcesados}. Descargando PDF: ${comprobante.numeroFactura}`);

  //             try {
  //               const urlPdf = await this.obtenerUrlPDF(comprobante);
  //               if (urlPdf) {
  //                 comprobante.urlPdf = urlPdf;
  //                 comprobante.nombreArchivoPdf = `${comprobante.numeroFactura.replace(/[/\\:*?"<>|]/g, '_')}.pdf`;
  //                 totalPDFsDescargados++;
  //                 console.log(`✅ PDF ${totalPDFsProcesados} descargado: ${urlPdf}`);
  //               } else {
  //                 totalPDFsConError++;
  //                 console.log(`❌ No se pudo obtener URL del PDF ${totalPDFsProcesados}`);
  //               }
  //             } catch (error) {
  //               totalPDFsConError++;
  //               console.log(`❌ Error descargando PDF ${totalPDFsProcesados}:`, error);
  //             }

  //             // Pausa entre descargas para evitar sobrecargar el servidor
  //             await this.page.waitForTimeout(1000);
  //           }
  //         }

  //       } catch (error) {
  //         console.error(`❌ Error navegando a cliente ${cliente.id}, suministro ${suministro.numeroSuministro}:`, error);
  //       }
  //     }
  //   }

  //   console.log(`\n📊 Resumen de descarga de PDFs:`);
  //   console.log(`   - Total PDFs procesados: ${totalPDFsProcesados}`);
  //   console.log(`   - PDFs descargados exitosamente: ${totalPDFsDescargados}`);
  //   console.log(`   - PDFs con error: ${totalPDFsConError}`);
  //   console.log(`   - Tasa de éxito: ${((totalPDFsDescargados / totalPDFsProcesados) * 100).toFixed(1)}%`);
  // }

  async navegarACliente(clienteId: string): Promise<void> {
    // Volver a la lista de clientes
    await this.volverAListaClientes();
    await this.page.waitForTimeout(2000);

    // CORRECIÓN: Usar el ID simple de la lista, no el ID real del comprobante
    // Buscar el cliente en la lista de datos recolectados para obtener el ID simple
    const clienteEncontrado = this.datosRecolectados.clientes.find(c => c.id === clienteId);
    if (!clienteEncontrado) {
      throw new Error(`No se encontró cliente con ID ${clienteId} en los datos recolectados`);
    }

    // Buscar el índice del cliente en la lista original
    const indiceCliente = this.datosRecolectados.clientes.indexOf(clienteEncontrado);
    const idSimple = String(indiceCliente + 1).padStart(4, '0'); // 0001, 0002, etc.

    console.log(`🔍 Navegando al cliente: ID real=${clienteId}, ID lista=${idSimple}`);

    // Entrar al cliente usando el ID simple de la lista
    await this.page.locator(`#span_vINGRESAR_${idSimple}`).getByRole('link', { name: 'Ingresar' }).click();
    await this.page.waitForTimeout(5000);
    await this.page.waitForLoadState('networkidle', { timeout: 30000 });
  }

  async navegarAClientePorIndice(idLista: string): Promise<void> {
    console.log(`🔍 Navegando al cliente con ID de lista: ${idLista}`);

    // Ir a la lista de clientes
    await this.page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.wpseleccionarcliente');
    await this.page.waitForLoadState('networkidle');

    // Entrar al cliente usando el ID de lista
    await this.page.locator(`#span_vINGRESAR_${idLista}`).getByRole('link', { name: 'Ingresar' }).click();
    await this.page.waitForTimeout(5000);
    await this.page.waitForLoadState('networkidle', { timeout: 30000 });
  }

  async navegarASuministro(suministro: Suministro): Promise<void> {
    // Buscar el enlace "Saldo" correspondiente al suministro
    const enlacesSaldo = await this.page.getByRole('link', { name: 'Saldo' }).all();

    // Encontrar el índice del suministro basado en su número
    const tabla2 = this.page.locator('table').nth(1);
    const filas = await tabla2.locator('tr').all();

    let indiceSuministro = -1;
    for (let i = 1; i < filas.length; i++) {
      const celdas = await filas[i].locator('td').allTextContents();
      if (celdas.length >= 4 && celdas[3]?.trim() === suministro.numeroSuministro) {
        indiceSuministro = i - 1; // -1 porque los enlaces empiezan desde 0
        break;
      }
    }

    if (indiceSuministro >= 0 && indiceSuministro < enlacesSaldo.length) {
      await enlacesSaldo[indiceSuministro].click();
      await this.page.waitForTimeout(5000);
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });
    } else {
      throw new Error(`No se encontró enlace de saldo para suministro ${suministro.numeroSuministro}`);
    }
  }

  async obtenerUrlPDF(comprobante: Comprobante): Promise<string | null> {
    try {
      // Buscar la fila del comprobante en la tabla 4
      const tabla4 = this.page.locator('table').nth(3);
      const filas = await tabla4.locator('tr').all();

      for (let i = 1; i < filas.length; i++) {
        const celdas = await filas[i].locator('td').allTextContents();

        if (celdas.length >= 2 && celdas[1]?.trim() === comprobante.numeroFactura) {
          // Encontramos la fila correcta
          const fila = filas[i];
          const celdaPdf = fila.locator('td').nth(14); // Columna 15 (índice 14)
          const botonPdf = celdaPdf.locator('img[id^="vIMPRIMIRSALDO_"]');

          if (await botonPdf.count() > 0) {
            // Hacer clic en el botón PDF
            await botonPdf.click();

            // Esperar el iframe del PDF
            const iframeSelector = 'iframe#gxp0_ifrm';
            const iframeLocator = this.page.locator(iframeSelector);
            await iframeLocator.waitFor({ state: 'visible', timeout: 15000 });

            // Obtener la URL del PDF
            const pdfRelativeUrl = await iframeLocator.getAttribute('src');
            if (pdfRelativeUrl) {
              const fullPdfUrl = `https://apps8.chaco.gob.ar/sameepweb/servlet/${pdfRelativeUrl}`;

              // Cerrar el popup
              await this.page.locator('#gxp0_cls').click();
              await this.page.waitForTimeout(1000);

              return fullPdfUrl;
            }
          }
          break;
        }
      }

      return null;
    } catch (error) {
      console.error(`Error obteniendo URL del PDF para ${comprobante.numeroFactura}:`, error);
      return null;
    }
  }

  async descargarPDF(url?: string): Promise<Buffer | null> {
    try {
      // ESTRATEGIA PROBADA: Basada en descargar-factura-sameep.ts
      // Si se proporciona una URL, navegar a ella primero
      if (url && url !== 'dummy-url') {
        console.log(`🔗 Navegando a URL: ${url.substring(0, 80)}...`);
        await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      }

      // Esperar al iframe del PDF (la clave del éxito)
      const iframeSelector = 'iframe#gxp0_ifrm';
      console.log('⏳ Esperando al iframe del PDF...');
      const iframeLocator = this.page.locator(iframeSelector);
      await iframeLocator.waitFor({ state: 'visible', timeout: 15000 });
      console.log('✅ Iframe del PDF encontrado.');

      // Extraer la URL real del iframe
      const pdfRelativeUrl = await iframeLocator.getAttribute('src');
      if (!pdfRelativeUrl) {
        throw new Error('No se pudo encontrar el atributo src del iframe del PDF.');
      }

      // Completar la URL
      const fullPdfUrl = `https://apps8.chaco.gob.ar/sameepweb/servlet/${pdfRelativeUrl}`;
      console.log(`🎯 URL real del PDF encontrada: ${fullPdfUrl.substring(0, 80)}...`);

      // CLAVE: Usar context.request para mantener cookies de sesión
      console.log('📥 Descargando PDF con context.request...');
      const response = await this.browser!.contexts()[0].request.get(fullPdfUrl);

      if (!response.ok()) {
        throw new Error(`Error al descargar el PDF: ${response.status()} ${response.statusText()}`);
      }

      const pdfBuffer = await response.body();
      console.log(`✅ PDF descargado exitosamente: ${pdfBuffer.length} bytes`);

      // Verificar que sea un PDF real
      if (pdfBuffer.subarray(0, 4).toString('ascii') === '%PDF') {
        console.log(`🎉 PDF válido confirmado`);

        // Cerrar el popup del PDF
        try {
          await this.page.locator('#gxp0_cls').click();
          console.log('🔄 Popup cerrado');
        } catch (closeError) {
          console.log('⚠️  No se pudo cerrar el popup (no crítico)');
        }

        return pdfBuffer;
      } else {
        console.log(`❌ El archivo descargado no es un PDF válido`);
        return null;
      }

    } catch (error) {
      console.error(`❌ Error descargando PDF:`, error);

      // Screenshot de debug si hay error
      try {
        await this.page.screenshot({
          path: path.join(__dirname, '..', 'datos', 'error_pdf_screenshot.png'),
          fullPage: true
        });
        console.log('📸 Screenshot de error guardado');
      } catch (screenshotError) {
        // Ignorar errores de screenshot
      }

      return null;
    }
  }

  async testNavegacionPDF(): Promise<void> {
    // Método para testing - navegar al primer suministro y hacer clic en PDF
    console.log('🔍 Navegando al primer suministro...');
    await this.page.getByRole('link', { name: 'Saldo' }).click();
    await this.page.waitForLoadState('networkidle');

    console.log('📄 Haciendo clic en el primer botón de PDF...');
    await this.page.locator('#vIMPRIMIRSALDO_0001').click();
  }

  async hacerClicEnBotonPDF(comprobante: Comprobante): Promise<boolean> {
    try {
      // Buscar la fila del comprobante en la tabla 4
      const tabla4 = this.page.locator('table').nth(3);
      const filas = await tabla4.locator('tr').all();

      for (let i = 1; i < filas.length; i++) {
        const celdas = await filas[i].locator('td').allTextContents();

        if (celdas.length >= 2 && celdas[1]?.trim() === comprobante.numeroFactura) {
          // Encontramos la fila correcta
          const fila = filas[i];
          const celdaPdf = fila.locator('td').nth(14); // Columna 15 (índice 14)
          const botonPdf = celdaPdf.locator('img[id^="vIMPRIMIRSALDO_"]');

          if (await botonPdf.count() > 0) {
            // Hacer clic en el botón PDF (SIN cerrar el popup)
            await botonPdf.click();
            console.log(`🔘 Clic en botón PDF realizado para ${comprobante.numeroFactura}`);
            return true;
          }
          break;
        }
      }

      return false;
    } catch (error) {
      console.error(`Error haciendo clic en botón PDF para ${comprobante.numeroFactura}:`, error);
      return false;
    }
  }
}

export { SameepDataCollector };

// Las interfaces ya están exportadas directamente arriba con 'export interface'
