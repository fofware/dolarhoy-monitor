import { chromium } from "playwright";
import { test, expect } from 'playwright/test';
import * as fs from "fs-extra";
import * as path from "path";
import * as dotenv from "dotenv";
import { MongoClient, Db, Collection } from "mongodb";
import { text } from "stream/consumers";

dotenv.config();

const login = async (page:any, usuario: string, password: string): Promise<boolean> => {
  try {
    // Login
    await page.fill('#Input_UserName', usuario);
    await page.fill('#Input_Password', password);
    await page.click('button[type="submit"]');
    // Esperar a que el menú de Facturas esté disponible tras login
    await page.waitForSelector('a:has-text("Facturas")', { timeout: 20000 });
    await page.screenshot({ path: path.join(__dirname, '..', 'facturas', 'login_success.png') });
    console.log("[INFO] Login exitoso");
    return true;
  } catch (error) {
    console.error("[ERROR] Fallo en el login:", error);
    return false;
  }
};
const abreDropdown = async (page:any) => {
  let ret = false
  try {
    // Hacer click para abrir el dropdown personalizado (span)
    const spanDropdown = await page.$('span.e-ddl');
    if (!spanDropdown) throw new Error('No se encontró el dropdown de suministros (span.e-ddl)');
    await spanDropdown.click();
    // Esperar a que el popup se abra
    await page.waitForSelector('.e-popup-open .e-list-item', { timeout: 10000 });
    ret = true;
  } catch (error) {
    console.error("[ERROR] No se pudo abrir el dropdown de suministros:", error);
    ret = false;
  } finally {
    // Screenshot del estado actual
    return ret;
  }
}

const listaSuministros = async (page:any) => {
  try {
    await abreDropdown(page);
    // Extraer todos los textos de los suministros y sus índices
    const suministros = await page.$$eval('.e-popup-open .e-list-item', items =>
      items.map((el, idx) => ({
        index: idx,
        cliente_id: el.textContent?.match(/\d+\/\d/g)[0] || "",
        nombre: el.textContent?.substring(10).split(' - ')[0].trim() || "",
        direccion: el.textContent?.substring(10).split(' - ')[1].trim() || "",
        text: el.textContent?.trim() || ""
      }))
    );
    //console.log(`[INFO] Suministros encontrados: ${suministros.length}`);
    console.table(suministros.map(s => ({ Índice: s.index, Cliente: s.cliente_id, Nombre: s.nombre, Dirección: s.direccion, text: s.text })));
    return suministros;
  } catch (error) {
    console.error("[ERROR] No se pudo encontrar el dropdown de suministros:", error);
    return [];
  }
}

const getCantidadItems = async (page:any, suministro) => {
  let nitems = -1;
  await page.waitForTimeout(1500); // Esperar un poco para que la UI se estabilice
  try {
    // Esperar a que la tabla de facturas esté visible
    await page.waitForSelector('span.e-pagecountmsg', {hasText: 'ítems)', timeout: 5000}).catch(() => {
      console.warn("[WARN] No se encontró el mensaje de ítems, puede que no haya facturas.");
    });
    // Verificar si hay un mensaje de "0 ítems"
    const strItems = await page.locator('span.e-pagecountmsg', {hasText: 'ítems)'}).innerText();
    nitems = parseInt(strItems.match(/\d+/g));
    if (isNaN(nitems) || nitems <= 0) {
      console.log(`[INFO] Suministro ${suministro.text}: sin facturas (0 de 0 páginas).`);
      nitems = -1;
    } else {
      console.log(`[INFO] Suministro: ${suministro.text} - Páginas: ${strItems} - Total ítems: ${nitems}`);
    }
  } catch (error) {
    nitems = -1;
    console.error("[ERROR] No se pudo extraer los comprobantes:", error);
  } finally {
    // Esperar un poco para que la UI actualice
    await page.waitForTimeout(500);
    return nitems;
  }
}

const selectCliente = async (page:any, index:number) => {
  try {
    // Intentar hacer click en el suministro por índice
    const items = await page.$$('.e-popup-open .e-list-item');
    if (!items[index]) {
      console.warn(`[WARN] No se encontró el suministro con índice ${index}. Puede que la UI haya cambiado.`);
      return;
    }
    await items[index].click();
    // Esperar a que el popup se cierre y la UI se actualice
    await page.waitForSelector('.e-popup-open', { state: 'detached', timeout: 5000 }).catch(() => {});
  } catch (error) {
    console.error(`[ERROR] No se pudo seleccionar el suministro con índice ${index}:`, error  );
  } finally {
    // Screenshot del estado actual
    //const screenshotPath = path.join(__dirname, '..', 'facturas', `seleccion_${index}.png`);
    //await page.screenshot({ path: screenshotPath });
    //console.log(`[DEBUG] Screenshot de selección guardado: ${screenshotPath}`);
  }
}
interface comprobante {
  empresa: string;
  cliente_id: string;
  nombre: string;
  direccion: string;
  comprobante_id: string;
  comprobante_name: string;
  periodo: string;
  vencimiento: string;
  importe: number;
  estado: string;
  filename: string | null;
  fileurl: string | null;
  fechaExtraccion: Date;
}
const leetablaFacturas = async (page:any, suministro:any, index:number) => {
  const tableData: comprobante[] = [];
  const filesData: any[] = [];
  const nextBtn = page.locator('div.e-next.e-icons.e-icon-next.e-nextpage.e-pager-default');
  const firstBtn = page.locator('div.e-first.e-icons.e-icon-first.e-firstpage.e-pager-default');
  const table = page.locator('table.e-table[id$="_content_table"]');
  await page.on('download', (download) => {});
  do {
    try {
      const allRows = await table.locator('tr').all();
      for (const row of allRows) {
        const cells = await row.locator('th, td').all();

        const rowData = await Promise.all(cells.map((cell:any) => cell.textContent()));
        const btn = await cells[6].locator('button.e-control.e-btn.e-lib.e-link.e-primary.e-icon-btn'); // Asegurarse de que la fila esté lista
        if (await btn.count() > 0) {
          // Si hay botón, hacer click para descargar PDF
          //console.log(btn)
          try {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 10000 }),
              btn.click()
            ]);
            filesData.push({
              filename: download.suggestedFilename(),
              url: download.url(),
            });
            console.log(`[PDF] Descargado: ${download.suggestedFilename()}`);
          } catch (error) {
            console.error(`[ERROR] No se pudo descargar el PDF para el suministro ${suministro.text}:`, error);
          }
        }
        // Extraer los datos de la fila

        const data:comprobante = {
          empresa: "SECHEEP",
          cliente_id: suministro.cliente_id,
          nombre: suministro.nombre,
          direccion: suministro.direccion,
          comprobante_id: rowData[0] || null, // ID del comprobante
          comprobante_name: rowData[1] || null, // Nombre del comprobante
          periodo: rowData[3] || null, // Periodo
          vencimiento: rowData[4] || null, // Vencimiento
          importe: parseFloat(rowData[5]?.replace('$','').replace(',','.') || 0), // Importe
          estado: rowData[2] || null, // Estado
          filename: filesData[tableData.length]?.filename || null, // Asignar nombre de archivo PDF si existe
          fileurl: filesData[tableData.length]?.url || null, // URL del archivo PDF si existe
          fechaExtraccion: new Date()
        }
        if (rowData.length > 0) {
          tableData.push(data);
        }
      }
    } catch (error) {
      console.error(`[ERROR] No se pudo leer la tabla de facturas para el suministro ${suministro.text}:`, error);
    } finally {
    // Screenshot del estado actual de la tabla
      //const screenshotPath = path.join(__dirname, '..', 'facturas', `tabla_${suministro.text.replace(/[^a-zA-Z0-9]/g, '_')}.png`);
      //await page.screenshot({ path: screenshotPath });
      //console.log(`[DEBUG] Screenshot de tabla guardado: ${screenshotPath}`);
    }
    if (index - tableData.length > 0) { 
      await nextBtn.click().catch((error:any) => {
        console.error(`[ERROR] No se pudo hacer click en el botón de siguiente página para el suministro ${suministro.text}:`, error);
      });
      await page.waitForTimeout(300); // Esperar un poco para que la UI actualice
    }
  } while (index - tableData.length > 0);
  console.log(`[INFO] Total de facturas encontradas para el suministro ${suministro.text}: ${tableData.length} files (${filesData.length} PDFs)`);
  await firstBtn.click().catch((error:any) => {
    console.error(`[ERROR] No se pudo hacer click en el botón de primera página para el suministro ${suministro.text}:`, error);
  });
  return tableData;
}

const leePaginaFacturas = async (page:any) => {
  try {
    //await abreDropdown(page);
    // Extraer todos los textos de los suministros y sus índices
    /*
    const suministros = await page.$$eval('.e-popup-open .e-list-item', items =>
      items.map((el, idx) => ({
        index: idx,
        text: el.textContent?.trim() || "",
        element: el // Guardar referencia al elemento para clicks posteriores
      }))
    );
    */
    await page.waitForTimeout(2000); // Esperar un poco para que la UI se estabilice
    const suministros = await listaSuministros(page);
    //console.log(`[INFO] Suministros encontrados: ${suministros.length}`);
    //console.table(suministros.map(s => ({ Índice: s.index, Suministro: s.text })));
    //for (const suministro of suministros) {
    for (let i = 0; i < suministros.length; i++) {
      const suministro = suministros[i];
      //console.log(`\n[INFO] Procesando suministro: ${suministro.text})`);
      await abreDropdown(page);
      await page.waitForTimeout(500);
      // Intentar hacer click en el suministro por índice
      await selectCliente(page, suministro.index);
      //await page.click(`.e-popup-open .e-list-item:nth-child(${suministro.index + 1})`);
      // Esperar a que el popup se cierre y la UI se actualice
      await page.waitForSelector('.e-popup-open', { state: 'detached', timeout: 5000 }).catch((e) => {
        console.warn("[WARN] No se encontró el popup abierto, puede que no haya suministros.");
        console.error("[ERROR] Error al esperar el popup abierto:", e);
      });
      const totItems = await getCantidadItems(page, suministro);
      if (totItems < 0) {
        console.warn(`[WARN] Suministro ${suministro.text}: no se pudo obtener la cantidad de ítems.`);
        continue;
      }
      if (totItems === 0) {
        console.log(`[INFO] Suministro ${suministro.text}: sin facturas (0 de 0 páginas).`);
        // Guardar registro de suministro sin facturas
        const doc = {
          suministro: suministro.text,
          suministro_id: suministro.text, // No hay value, usamos el texto
          factura: null,
          datos: [],
          pdf: null,
          pdfUrl: null,
          fechaExtraccion: new Date(),
          sinFacturas: true
        };
        console.log(`[DB] Registro de suministro sin facturas guardado: ${suministro.text}`);
        /*
        await collection.updateOne(
          { suministro: doc.suministro, factura: null },
          { $set: doc },
          { upsert: true }
        );
        */
        continue;
      } 
      const tableData = await leetablaFacturas(page, suministro, totItems);
      console.table(tableData,['empresa', 'cliente_id', 'nombre', 'direccion', 'comprobante_id', 'comprobante_name', 'periodo', 'vencimiento', 'importe', 'estado', 'filename']);
      await page.waitForTimeout(500); // Esperar a que la UI actualice
    }
  } catch (error) {
    console.error("[ERROR] No se pudo encontrar el dropdown de suministros:", error);
    return;
  }
}
    

// === SECHEEP: Automatización de extracción de facturas y descarga de PDFs ===
async function extraerFacturasYDescargarPDFs(usuario: string, password: string) {
  let browser, mongoClient, collection;
  try {
    ({ mongoClient, collection } = await conectarMongoDB());
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 1000 });
    page.setDefaultTimeout(300000);
    page.setDefaultNavigationTimeout(240000);

    await page.goto("https://oficinavirtual.secheep.gob.ar/Identity/Account/Login", { waitUntil: "domcontentloaded" });
    console.log("[DEBUG] URL actual:", page.url());
    await page.screenshot({ path: path.join(__dirname, '..', 'facturas', 'login_debug.png') });
    if (await login(page, usuario, password)){
      await page.click('a:has-text("Facturas")');

      await leePaginaFacturas(page);
    };
    await browser.close();
    await mongoClient.close();
    //// Mostrar resumen
    //console.table(resultados.map(r => ({ Suministro: r.suministro, Factura: r.factura, PDF: r.pdf ? 'Descargado' : 'No' })));
    //return resultados;
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    if (mongoClient) await mongoClient.close().catch(() => {});
    console.error("[FATAL] Error general en el proceso:", err);
    throw err;
  }
}

// Variables de entorno necesarias en .env:
// MONGO_URL=mongodb://localhost:27017
// SECHEEP_DB=secheep
// SECHEEP_COLLECTION=facturas
// SECHEEP_USER=usuario@correo.com
// SECHEEP_PASS=contraseña

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
const DB_NAME = process.env.SECHEEP_DB || "secheep";
const COLLECTION_NAME = process.env.SECHEEP_COLLECTION || "facturas";

async function conectarMongoDB() {
  const mongoClient = new MongoClient(MONGO_URL);
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);
  await collection.createIndex({ suministro: 1, factura: 1 }, { unique: true });
  return { mongoClient, db, collection };
}

// Ejemplo de uso (ajustar usuario y password desde .env o variables):
(async () => {
  const usuario = process.env.SECHEEP_USER || "";
  const password = process.env.SECHEEP_PASS || "";
  if (!usuario || !password) {
    console.error("Faltan credenciales de SECHEEP en .env");
    return;
  }
  await extraerFacturasYDescargarPDFs(usuario, password);
})();
