import * as dotenv from 'dotenv';
import * as fs from 'fs-extra';
import * as path from 'path';
import { chromium } from 'playwright';
import { MongoClient, Db } from 'mongodb';
import pdfParse from 'pdf-parse';

dotenv.config();

// Interfaces para los datos estructurados
interface Cliente {
  id: string;
  nombre: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  suministros: Suministro[];
}

interface Suministro {
  id: string;
  clienteId: string;
  numeroSuministro: string;
  direccionSuministro?: string;
  medidor?: string;
  tarifa?: string;
  estado?: string;
  comprobantes: Comprobante[];
}

interface Comprobante {
  id: string;
  clienteId: string;
  suministroId: string;
  numeroComprobante: string;
  fecha: Date;
  periodo: string;
  monto: number;
  estado: string;
  vencimiento?: Date;
  urlPdf?: string; // Opcional - algunos comprobantes no tienen PDF
  hash?: string; // Solo si tiene PDF
  contenidoPdf?: string; // Solo si tiene PDF
  archivoPdf?: Buffer; // Solo si tiene PDF
  tienePdf: boolean; // Indica si el comprobante tiene PDF disponible
  fechaProcesamiento: Date;
}

interface DatosRecolectados {
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

  async conectarMongoDB(): Promise<void> {
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
    const dbName = process.env.MONGODB_DB || 'sameep_facturas';

    try {
      const client = new MongoClient(mongoUrl);
      await client.connect();
      this.db = client.db(dbName);
      console.log('📚 Conectado a MongoDB exitosamente');
    } catch (error) {
      console.error('❌ Error conectando a MongoDB:', error);
      throw error;
    }
  }

  async inicializarBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 50,
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
      // Esperar más tiempo para que la página cargue completamente
      console.log('⏳ Esperando carga completa de la página (15 segundos)...');
      await this.page.waitForTimeout(15000);

      console.log('⏳ Esperando networkidle...');
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });

      console.log('⏳ Esperando que los elementos sean visibles...');
      await this.page.waitForSelector('[id^="span_vINGRESAR_"]', { timeout: 30000 });

      // Buscar todos los elementos de clientes en la página
      const elementosClientes = await this.page.locator('[id^="span_vINGRESAR_"]').all();
      console.log(`🔍 Encontrados ${elementosClientes.length} elementos de clientes`);

      if (elementosClientes.length === 0) {
        console.log('⚠️  No se encontraron clientes después de las esperas. Tomando screenshot...');
        await this.page.screenshot({ path: 'facturas/no_clientes_found.png', fullPage: true });
        return clientes;
      }

      // Buscar la tabla principal que contiene los datos de clientes
      const tablaClientes = this.page.locator('table').nth(1); // La segunda tabla según la depuración
      const filasClientes = await tablaClientes.locator('tr').all();

      console.log(`📊 Procesando ${filasClientes.length} filas de la tabla de clientes`);

      for (let i = 0; i < elementosClientes.length; i++) {
        try {
          const elemento = elementosClientes[i];
          const clienteId = await elemento.getAttribute('id');
          const numeroCliente = clienteId?.replace('span_vINGRESAR_', '') || '';

          // Buscar la fila correspondiente a este cliente
          let nombreCliente = `Cliente ${numeroCliente}`;
          let direccionCliente = undefined;

          try {
            // Buscar en las filas de la tabla los datos del cliente
            if (i + 1 < filasClientes.length) { // +1 porque probablemente hay una fila de encabezado
              const fila = filasClientes[i + 1];
              const celdas = await fila.locator('td').allTextContents();

              if (celdas.length > 1) {
                // Buscar el nombre del cliente (puede estar en diferentes posiciones)
                for (let j = 0; j < celdas.length; j++) {
                  const contenido = celdas[j].trim();
                  if (contenido && !contenido.includes('Ingresar') && contenido.length > 3) {
                    nombreCliente = contenido;
                    break;
                  }
                }

                // La dirección puede estar en otra celda
                if (celdas.length > 2) {
                  direccionCliente = celdas[2]?.trim() || undefined;
                }
              }
            }
          } catch (error) {
            console.log(`⚠️  No se pudieron obtener detalles adicionales para cliente ${numeroCliente}`);
          }

          const cliente: Cliente = {
            id: numeroCliente,
            nombre: nombreCliente,
            direccion: direccionCliente,
            telefono: undefined,
            email: undefined,
            suministros: [] // Se llenará después
          };

          clientes.push(cliente);
          console.log(`📋 Cliente ${i + 1}/${elementosClientes.length}: ${cliente.id} - ${cliente.nombre}`);

        } catch (error) {
          console.error(`❌ Error procesando cliente ${i}:`, error);
        }
      }

      this.datosRecolectados.clientes = clientes;
      this.datosRecolectados.totalClientes = clientes.length;
      console.log(`✅ Total de clientes recolectados: ${clientes.length}`);

      return clientes;

    } catch (error) {
      console.error('❌ Error general en recolectarClientes:', error);
      await this.page.screenshot({ path: 'facturas/error_recolectar_clientes.png', fullPage: true });
      return clientes;
    }
  }

  async procesarCliente(cliente: Cliente): Promise<void> {
    console.log(`🔄 Procesando cliente: ${cliente.id} - ${cliente.nombre}`);

    try {
      // Hacer clic en "Ingresar" para el cliente
      await this.page.locator(`#span_vINGRESAR_${cliente.id}`).getByRole('link', { name: 'Ingresar' }).click();

      // Esperar a que cargue la página del cliente
      await this.page.waitForLoadState('networkidle');
      await this.page.getByRole('link', { name: 'Saldo' }).waitFor({ state: 'visible', timeout: 15000 });

      // Recolectar información de suministros en esta página
      await this.recolectarSuministros(cliente);

      // Ir a la sección de saldos para procesar comprobantes
      await this.page.getByRole('link', { name: 'Saldo' }).click();
      await this.page.waitForLoadState('networkidle');

      // Procesar comprobantes para todos los suministros del cliente
      await this.procesarComprobantesDelCliente(cliente);

      // Volver a la lista de clientes
      await this.volverAListaClientes();

      this.datosRecolectados.clientesProcesados++;

    } catch (error) {
      console.error(`❌ Error procesando cliente ${cliente.id}:`, error);
      await this.page.screenshot({ path: `facturas/error_cliente_${cliente.id}.png`, fullPage: true });
    }
  }

  async recolectarSuministros(cliente: Cliente): Promise<void> {
    console.log(`🏠 Recolectando suministros para cliente: ${cliente.id}`);

    try {
      // Buscar información de suministros en la página actual
      // Esto podría requerir ajustes según la estructura real de la página
      const filaSuministros = await this.page.locator('table tr').all();

      for (let i = 0; i < filaSuministros.length; i++) {
        try {
          const fila = filaSuministros[i];
          const celdas = await fila.locator('td').allTextContents();

          // Verificar si esta fila contiene información de suministro
          if (celdas.length > 0 && celdas[0]) {
            const suministro: Suministro = {
              id: `SUM_${cliente.id}_${i}`,
              clienteId: cliente.id,
              numeroSuministro: celdas[0] || `SUM_${i}`,
              direccionSuministro: celdas[1] || 'Sin dirección',
              medidor: celdas[2] || 'Sin medidor',
              tarifa: celdas[3] || 'Sin tarifa',
              estado: celdas[4] || 'Activo',
              comprobantes: [] // Se llenará después
            };

            cliente.suministros.push(suministro);
            this.datosRecolectados.totalSuministros++;
            console.log(`🔌 Suministro encontrado: ${suministro.numeroSuministro}`);
          }
        } catch (error) {
          console.error(`❌ Error procesando suministro ${i}:`, error);
        }
      }

      // Si no se encontraron suministros, crear uno por defecto
      if (cliente.suministros.length === 0) {
        const suministroDefault: Suministro = {
          id: `SUM_${cliente.id}_DEFAULT`,
          clienteId: cliente.id,
          numeroSuministro: `DEFAULT_${cliente.id}`,
          direccionSuministro: 'Por determinar',
          medidor: 'Por determinar',
          tarifa: 'Por determinar',
          estado: 'Activo',
          comprobantes: []
        };

        cliente.suministros.push(suministroDefault);
        this.datosRecolectados.totalSuministros++;
        console.log(`🔌 Suministro por defecto creado para cliente ${cliente.id}`);
      }

    } catch (error) {
      console.error(`❌ Error recolectando suministros para cliente ${cliente.id}:`, error);
    }
  }

  async procesarComprobantesDelCliente(cliente: Cliente): Promise<void> {
    console.log(`📄 Procesando comprobantes para cliente: ${cliente.id}`);

    // Buscar todas las filas de comprobantes en la tabla de saldos
    const filasComprobantes = await this.page.locator('table tr').all();

    for (let i = 0; i < filasComprobantes.length; i++) {
      try {
        const fila = filasComprobantes[i];
        const celdas = await fila.locator('td').allTextContents();

        // Verificar si esta fila contiene un comprobante
        if (celdas.length > 0 && celdas[0]) {
          // Buscar si hay un botón de PDF en esta fila
          const botonPdf = fila.locator('[id^="vIMPRIMIRSALDO_"]');
          const tienePdf = await botonPdf.count() > 0;

          // Determinar a qué suministro pertenece este comprobante
          // Por simplicidad, lo asignamos al primer suministro del cliente
          const suministro = cliente.suministros[0] || cliente.suministros[0];

          const comprobante: Comprobante = {
            id: `COMP_${cliente.id}_${i}`,
            clienteId: cliente.id,
            suministroId: suministro.id,
            numeroComprobante: celdas[0] || `COMP_${i}`,
            fecha: this.parsearFecha(celdas[1]) || new Date(),
            periodo: celdas[2] || 'Sin período',
            monto: this.parsearMonto(celdas[3]) || 0,
            estado: celdas[4] || 'Pendiente',
            vencimiento: this.parsearFecha(celdas[5]),
            tienePdf: tienePdf,
            fechaProcesamiento: new Date()
          };

          // Si tiene PDF disponible, intentar descargarlo
          if (tienePdf) {
            console.log(`📋 Procesando comprobante con PDF: ${comprobante.numeroComprobante}`);

            try {
              // Hacer clic en el botón de PDF
              await botonPdf.click();

              // Descargar y procesar el PDF
              const datosAdicionales = await this.descargarYProcesarPDF(cliente.id, comprobante.numeroComprobante);

              if (datosAdicionales) {
                comprobante.urlPdf = datosAdicionales.urlPdf;
                comprobante.hash = datosAdicionales.hash;
                comprobante.contenidoPdf = datosAdicionales.contenidoPdf;
                comprobante.archivoPdf = datosAdicionales.archivoPdf;

                // Verificar si ya existe en la base de datos
                const existe = await this.verificarComprobanteExiste(comprobante.hash);

                if (!existe) {
                  await this.guardarComprobanteEnDB(comprobante);
                  console.log(`✅ Comprobante ${comprobante.numeroComprobante} guardado en DB`);
                  this.datosRecolectados.totalComprobantesConPdf++;
                } else {
                  console.log(`⚠️  Comprobante ${comprobante.numeroComprobante} ya existe en DB`);
                }
              }

            } catch (error) {
              console.error(`❌ Error procesando PDF del comprobante ${comprobante.numeroComprobante}:`, error);
              this.datosRecolectados.totalComprobantesSinPdf++;
            }

          } else {
            console.log(`📋 Comprobante sin PDF: ${comprobante.numeroComprobante}`);
            this.datosRecolectados.totalComprobantesSinPdf++;
          }

          // Agregar el comprobante al suministro correspondiente
          suministro.comprobantes.push(comprobante);
          this.datosRecolectados.totalComprobantes++;

          // Pequeña pausa entre comprobantes
          await this.page.waitForTimeout(1000);
        }

      } catch (error) {
        console.error(`❌ Error procesando comprobante ${i}:`, error);
      }
    }
  }

  // Funciones auxiliares para parsear datos
  private parsearFecha(fechaStr: string): Date | undefined {
    if (!fechaStr) return undefined;
    try {
      // Intentar varios formatos de fecha
      const fecha = new Date(fechaStr);
      return isNaN(fecha.getTime()) ? undefined : fecha;
    } catch {
      return undefined;
    }
  }

  private parsearMonto(montoStr: string): number {
    if (!montoStr) return 0;
    try {
      // Limpiar el string y convertir a número
      const numero = montoStr.replace(/[^\d.,]/g, '').replace(',', '.');
      return parseFloat(numero) || 0;
    } catch {
      return 0;
    }
  }

  async descargarYProcesarPDF(clienteId: string, numeroComprobante: string): Promise<{urlPdf: string, hash: string, contenidoPdf: string, archivoPdf: Buffer} | null> {
    try {
      // Esperar a que aparezca el iframe del PDF
      const iframeSelector = 'iframe#gxp0_ifrm';
      const iframeLocator = this.page.locator(iframeSelector);
      await iframeLocator.waitFor({ state: 'visible', timeout: 15000 });

      // Obtener la URL del PDF
      const pdfRelativeUrl = await iframeLocator.getAttribute('src');
      if (!pdfRelativeUrl) {
        throw new Error('No se pudo encontrar el atributo src del iframe del PDF.');
      }

      const fullPdfUrl = `https://apps8.chaco.gob.ar/sameepweb/servlet/${pdfRelativeUrl}`;

      // Descargar el PDF
      const response = await this.context.request.get(fullPdfUrl);
      if (!response.ok()) {
        throw new Error(`Error al descargar el PDF: ${response.status()} ${response.statusText()}`);
      }

      const pdfBuffer = await response.body();

      // Extraer texto del PDF
      const pdfData = await pdfParse(pdfBuffer);
      const contenidoTexto = pdfData.text;

      // Generar hash único para el comprobante
      const crypto = require('crypto');
      const hash = crypto.createHash('md5').update(pdfBuffer).digest('hex');

      // Cerrar el popup
      await this.page.locator('#gxp0_cls').click();
      await this.page.waitForTimeout(1000);

      return {
        urlPdf: fullPdfUrl,
        hash,
        contenidoPdf: contenidoTexto,
        archivoPdf: pdfBuffer
      };

    } catch (error) {
      console.error('Error al descargar y procesar PDF:', error);
      return null;
    }
  }

  async verificarComprobanteExiste(hash: string): Promise<boolean> {
    try {
      if (!this.db) return false;
      const collection = this.db.collection('comprobantes');
      const documento = await collection.findOne({ hash });
      return documento !== null;
    } catch (error) {
      console.error('Error verificando comprobante en DB:', error);
      return false;
    }
  }

  async guardarComprobanteEnDB(comprobante: Comprobante): Promise<void> {
    try {
      if (!this.db) throw new Error('Base de datos no conectada');
      const collection = this.db.collection('comprobantes');
      await collection.insertOne(comprobante);
    } catch (error) {
      console.error('Error guardando comprobante en DB:', error);
      throw error;
    }
  }

  async volverAListaClientes(): Promise<void> {
    // Navegar de vuelta a la lista de clientes
    await this.page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.wpseleccionarcliente');
    await this.page.waitForLoadState('networkidle');
  }

  async guardarDatosEnJSON(): Promise<void> {
    const datosPath = path.join(__dirname, '..', 'datos');
    await fs.ensureDir(datosPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivo = path.join(datosPath, `sameep-datos-${timestamp}.json`);

    await fs.writeJSON(archivo, this.datosRecolectados, { spaces: 2 });
    console.log(`💾 Datos guardados en: ${archivo}`);
  }

  async cerrar(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async procesarTodo(): Promise<void> {
    try {
      console.log('🚀 Iniciando recolección completa de datos SAMEEP...');

      await this.conectarMongoDB();
      await this.inicializarBrowser();
      await this.login();

      // Recolectar todos los clientes
      const clientes = await this.recolectarClientes();
      console.log(`📊 Total de clientes encontrados: ${clientes.length}`);

      // Procesar cada cliente
      for (const cliente of clientes) {
        await this.procesarCliente(cliente);
        // La estadística se actualiza dentro de procesarCliente
      }

      // Guardar datos en JSON
      await this.guardarDatosEnJSON();

      console.log('🎉 Proceso completado exitosamente!');
      console.log(`📈 Estadísticas:`);
      console.log(`   - Clientes procesados: ${this.datosRecolectados.clientesProcesados}/${this.datosRecolectados.totalClientes}`);
      console.log(`   - Total suministros: ${this.datosRecolectados.totalSuministros}`);
      console.log(`   - Total comprobantes: ${this.datosRecolectados.totalComprobantes}`);
      console.log(`   - Comprobantes con PDF: ${this.datosRecolectados.totalComprobantesConPdf}`);
      console.log(`   - Comprobantes sin PDF: ${this.datosRecolectados.totalComprobantesSinPdf}`);

    } catch (error) {
      console.error('❌ Error en el proceso principal:', error);
      throw error;
    } finally {
      await this.cerrar();
    }
  }
}

// Función principal
async function main() {
  const collector = new SameepDataCollector();
  await collector.procesarTodo();
}

// Ejecutar solo si este archivo se ejecuta directamente
if (require.main === module) {
  main().catch(console.error);
}

export { SameepDataCollector };
