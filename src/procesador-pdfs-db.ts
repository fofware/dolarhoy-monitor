import { Browser, chromium, Page } from 'playwright';
import { MongoClient, Db, Collection } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import { createHash } from 'crypto';

// Interfaces (copiadas del archivo principal)
interface Comprobante {
  id: string;
  clienteId: string;
  suministroId: string;
  numeroFactura: string;
  fechaEmision: Date;
  periodo: string;
  codigoInterno: string;
  tipoComprobante: string;
  numeroComprobante: string;
  fechaVencimiento1: Date;
  fechaVencimiento2: Date;
  importeOriginal: number;
  recargo: number;
  importeTotal: number;
  tienePdf: boolean;
  urlPdf?: string;
  nombreArchivoPdf?: string;
  hash?: string;
  contenidoPdf?: string;
  archivoPdf?: Buffer;
  fechaProcesamiento: Date;
}

interface Suministro {
  id: string;
  clienteId: string;
  numeroSuministro: string;
  calle: string;
  altura: string;
  piso: string;
  comprobantes: Comprobante[];
}

interface Cliente {
  id: string;
  nombre: string;
  suministros: Suministro[];
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

class ProcesadorPDFsDB {
  private browser?: Browser;
  private page?: Page;
  private db?: Db;
  private mongoClient?: MongoClient;

  // Configuración
  private readonly CARPETA_PDFS = 'facturas/pdfs';
  private readonly MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
  private readonly DB_NAME = process.env.DB_NAME || 'sameep';

  constructor() {
    // Crear directorio de PDFs si no existe
    if (!fs.existsSync(this.CARPETA_PDFS)) {
      fs.mkdirSync(this.CARPETA_PDFS, { recursive: true });
    }
  }

  async inicializar(): Promise<void> {
    console.log('🔧 Inicializando procesador de PDFs y base de datos...');

    // Inicializar browser
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext();
    this.page = await context.newPage();

    // Conectar a MongoDB
    this.mongoClient = new MongoClient(this.MONGO_URL);
    await this.mongoClient.connect();
    this.db = this.mongoClient.db(this.DB_NAME);

    console.log('✅ Procesador inicializado correctamente');
  }

  async procesarArchivoJSON(rutaJSON: string): Promise<void> {
    console.log(`📂 Procesando archivo JSON: ${rutaJSON}`);

    if (!fs.existsSync(rutaJSON)) {
      throw new Error(`Archivo no encontrado: ${rutaJSON}`);
    }

    const contenido = fs.readFileSync(rutaJSON, 'utf-8');
    const datos: DatosRecolectados = JSON.parse(contenido);

    console.log(`📊 Datos a procesar:`);
    console.log(`   - Clientes: ${datos.totalClientes}`);
    console.log(`   - Comprobantes con PDF: ${datos.totalComprobantesConPdf}`);
    console.log(`   - Comprobantes sin PDF: ${datos.totalComprobantesSinPdf}`);

    // Procesar cada cliente
    for (const cliente of datos.clientes) {
      if (cliente.suministros.length > 0) {
        console.log(`\n👤 Procesando cliente: ${cliente.id} - ${cliente.nombre}`);
        await this.procesarCliente(cliente);
      }
    }

    console.log('🎉 Procesamiento de PDFs y base de datos completado!');
  }

  private async procesarCliente(cliente: Cliente): Promise<void> {
    // Verificar si el cliente ya existe en la base de datos
    const clientesCollection = this.db!.collection('clientes');
    const clienteExistente = await clientesCollection.findOne({ id: cliente.id });

    if (clienteExistente) {
      console.log(`ℹ️ Cliente ${cliente.id} ya existe en la base de datos`);
    }

    // Procesar suministros
    for (const suministro of cliente.suministros) {
      console.log(`🏠 Procesando suministro: ${suministro.id}`);
      await this.procesarSuministro(cliente, suministro);
    }

    // Guardar/actualizar cliente en la base de datos
    await this.guardarClienteEnDB(cliente);
  }

  private async procesarSuministro(cliente: Cliente, suministro: Suministro): Promise<void> {
    // Procesar comprobantes con PDF
    const comprobantesConPdf = suministro.comprobantes.filter(c => c.tienePdf && c.urlPdf);

    console.log(`📄 Suministro ${suministro.id} tiene ${comprobantesConPdf.length} comprobantes con PDF`);

    for (const comprobante of comprobantesConPdf) {
      try {
        await this.descargarYProcesarPDF(comprobante);
      } catch (error) {
        console.error(`❌ Error procesando PDF de ${comprobante.numeroFactura}:`, error);
      }
    }
  }

  private async descargarYProcesarPDF(comprobante: Comprobante): Promise<void> {
    if (!comprobante.urlPdf) {
      console.log(`⚠️ No hay URL para el comprobante ${comprobante.numeroFactura}`);
      return;
    }

    // Verificar si ya existe el PDF
    const rutaPDF = path.join(this.CARPETA_PDFS, comprobante.nombreArchivoPdf!);
    const hashExistente = await this.verificarPDFExistente(comprobante);

    if (hashExistente) {
      console.log(`✅ PDF ya existe: ${comprobante.numeroFactura}`);
      comprobante.hash = hashExistente;
      return;
    }

    console.log(`⬇️ Descargando PDF: ${comprobante.numeroFactura}`);

    try {
      // Usar Playwright para descargar el PDF manteniendo la sesión
      const response = await this.page!.context().request.get(comprobante.urlPdf);

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      const pdfBuffer = await response.body();

      // Guardar archivo PDF
      fs.writeFileSync(rutaPDF, pdfBuffer);

      // Generar hash
      const hash = createHash('md5').update(pdfBuffer).digest('hex');
      comprobante.hash = hash;

      // Extraer texto del PDF (opcional)
      try {
        const pdfData = await pdfParse(pdfBuffer);
        comprobante.contenidoPdf = pdfData.text;
      } catch (pdfError) {
        console.log(`⚠️ No se pudo extraer texto del PDF: ${comprobante.numeroFactura}`);
      }

      console.log(`✅ PDF descargado: ${comprobante.nombreArchivoPdf}`);

    } catch (error) {
      console.error(`❌ Error descargando PDF ${comprobante.numeroFactura}:`, error);
    }
  }

  private async verificarPDFExistente(comprobante: Comprobante): Promise<string | null> {
    const rutaPDF = path.join(this.CARPETA_PDFS, comprobante.nombreArchivoPdf!);

    if (fs.existsSync(rutaPDF)) {
      const buffer = fs.readFileSync(rutaPDF);
      const hash = createHash('md5').update(buffer).digest('hex');

      // Verificar si el comprobante ya existe en la base de datos con el mismo hash
      const comprobantesCollection = this.db!.collection('comprobantes');
      const existente = await comprobantesCollection.findOne({
        numeroFactura: comprobante.numeroFactura,
        hash: hash
      });

      return existente ? hash : null;
    }

    return null;
  }

  private async guardarClienteEnDB(cliente: Cliente): Promise<void> {
    try {
      // Guardar cliente
      const clientesCollection = this.db!.collection('clientes');
      await clientesCollection.replaceOne(
        { id: cliente.id },
        {
          id: cliente.id,
          nombre: cliente.nombre,
          fechaActualizacion: new Date()
        },
        { upsert: true }
      );

      // Guardar suministros
      const suministrosCollection = this.db!.collection('suministros');
      for (const suministro of cliente.suministros) {
        await suministrosCollection.replaceOne(
          { id: suministro.id },
          {
            id: suministro.id,
            clienteId: suministro.clienteId,
            numeroSuministro: suministro.numeroSuministro,
            calle: suministro.calle,
            altura: suministro.altura,
            piso: suministro.piso,
            fechaActualizacion: new Date()
          },
          { upsert: true }
        );

        // Guardar comprobantes
        const comprobantesCollection = this.db!.collection('comprobantes');
        for (const comprobante of suministro.comprobantes) {
          // Solo guardar si no existe uno con el mismo hash
          if (comprobante.hash) {
            const existente = await comprobantesCollection.findOne({
              numeroFactura: comprobante.numeroFactura,
              hash: comprobante.hash
            });

            if (!existente) {
              await comprobantesCollection.insertOne({
                ...comprobante,
                fechaActualizacion: new Date()
              });
              console.log(`💾 Comprobante guardado en DB: ${comprobante.numeroFactura}`);
            } else {
              console.log(`ℹ️ Comprobante ya existe en DB: ${comprobante.numeroFactura}`);
            }
          }
        }
      }

      console.log(`✅ Cliente ${cliente.id} guardado en base de datos`);

    } catch (error) {
      console.error(`❌ Error guardando cliente ${cliente.id} en base de datos:`, error);
    }
  }

  async cerrar(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
    if (this.mongoClient) {
      await this.mongoClient.close();
    }
    console.log('🔒 Procesador cerrado correctamente');
  }
}

export { ProcesadorPDFsDB };

// Función principal para usar desde línea de comandos
async function procesarDesdeJSON(rutaJSON: string) {
  const procesador = new ProcesadorPDFsDB();

  try {
    await procesador.inicializar();
    await procesador.procesarArchivoJSON(rutaJSON);
  } catch (error) {
    console.error('❌ Error en el procesamiento:', error);
  } finally {
    await procesador.cerrar();
  }
}

// Si se ejecuta directamente
if (require.main === module) {
  const rutaJSON = process.argv[2];
  if (!rutaJSON) {
    console.error('❌ Uso: npx ts-node src/procesador-pdfs-db.ts <ruta-al-json>');
    process.exit(1);
  }

  procesarDesdeJSON(rutaJSON);
}
