import * as dotenv from "dotenv";
import * as fs from "fs-extra";
import * as path from "path";
import { chromium } from "playwright";

dotenv.config();

// Variables de entorno necesarias en .env:
// SAMEEP_USER=usuario
// SAMEEP_PASS=contraseña

async function loginSameep(page: any): Promise<{ success: boolean; error?: string }> {
  try {
    await page.goto("https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.gamexamplelogin", { waitUntil: "domcontentloaded" });
    await page.screenshot({ path: path.join(__dirname, '..', 'facturas', 'sameep_login_debug.png') });

    // Completar usuario y contraseña (ajustar selectores reales)
    const usuario = process.env.SAMEEP_USER || "";
    const password = process.env.SAMEEP_PASS || "";
    if (!usuario || !password) {
      const msg = "Faltan credenciales de SAMEEP en .env";
      console.error(msg);
      return { success: false, error: msg };
    }

    // TODO: Ajustar los selectores según el HTML real del login
    await page.fill('input[name="vUSERNAME"]', usuario).catch(() => {});
    await page.fill('input[name="vUSERPASSWORD"]', password).catch(() => {});
    await page.click('button, input[name="BTNENTER"]'); // Ajustar selector del botón de login

    // Esperar redirección o validación (ajustar selector de éxito)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(__dirname, '..', 'facturas', 'sameep_postlogin.png') });

    // Verificar si el login fue exitoso por URL
    const urlActual = page.url();
    if (urlActual.includes("/com.sameep.wpseleccionarcliente")) {
      // Extraer lista de clientes del tbody de la tabla con id='GridContainerTbl'
      const clientes = await page.$$eval('#GridContainerTbl tbody tr', rows =>
        rows.map(row => {
          const cols = Array.from(row.querySelectorAll('td'));
          return cols.map(col => (col as HTMLElement).innerText.trim());
        })
      );
      // Guardar la lista de clientes en un archivo JSON
      const clientesPath = path.join(__dirname, '..', 'facturas', 'sameep_clientes.json');
      await fs.writeJson(clientesPath, clientes, { spaces: 2 });
      console.log(`Clientes extraídos y guardados en ${clientesPath}`);
      return { success: true };
    } else {
      return { success: false, error: 'No se redirigió a la página de selección de cliente tras login.' };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
const readComprobantes = async (page: any): Promise<any> => {
  try {
    const tableData: any[] = [];
    await page.waitForTimeout(2000); // Esperar a que se cargue la página de comprobantes
    await page.waitForSelector('table[id="GridContainerTbl"]', { timeout: 10000 });
    // Leer los datos de la tabla de comprobantes
    const table = await page.locator('table[id="GridContainerTbl"]').locator('tbody');
    const allRows = await table.locator('tr').all();
    const rowCount = await allRows.length;
    console.log("Comprobantes...", await rowCount);
    await page.waitForTimeout(1000); // Esperar a que se cargue la tabla
    let rowIndex = 0;
    for (const row of await allRows) {
      rowIndex++;

      const cells = await row.locator('th, td').all().catch((err: any) => {
        console.error("Error al obtener las celdas de la fila:", err.message || String(err));
        return [];
      });
      const rowData = await Promise.all(cells.map((cell:any) => cell.textContent()));
      const cleanData = rowData.map((data:any) => data.replace(" ","").trim()); // Limpiar espacios en blanco
      console.log("Fila de comprobante: ", rowIndex, "de ", rowCount, cleanData[1], cleanData[8], cleanData[9], cleanData[11]);


      const btn = await cells[14].locator('img.BlobContentReadonlyMedio', { timeout: 5000 });
      const btnDisabled = await btn.getAttribute('style');

      console.log("btnDisabled", btnDisabled);

      if ( await btn?.count() === 0 || btnDisabled?.includes("display:none") ) {
        console.log("No se encontró el botón de PDF en esta fila, saltando...");
        continue; // Si no hay botón, saltar a la siguiente fila
      }
      await page.waitForTimeout(1000)
      await btn.click(); // Click en el botón de PDF
      const factura = await page.waitForSelector('div.gx-responsive-popup.gx-popup-centered.PopupBorder.gx-popup.gx-popup-default.gx-popup-initial', { timeout: 15000 }).catch((err: any) => {
        console.error("Error al esperar el popup de PDF:", err.message || String(err));
        return null; // Si no se encuentra el popup, retornar null
      });
      if (factura) {
        console.log("Popup de PDF abierto");
        // Esperar a que el popup de PDF esté visible
        await page.waitForSelector('div[id="gxp0_b"]', { timeout: 10000 }).catch((err: any) => {
          console.error("Error al esperar el popup de PDF:", err.message || String(err));
          return null; // Si no se encuentra el popup, retornar null
        });
        const frame = page.frame({ name: 'gxp0_ifrm' }); // By name
        if (!frame) {
          console.error("No se pudo encontrar el frame del popup de PDF");
          continue; // Si no se encuentra el frame, saltar a la siguiente fila
        }
        await frame.waitForTimeout(1000); // Esperar a que se cargue el contenido del popup
        //await page.locator('div.PopupContent.gx-popup-content.gx-popup-pdf').waitFor({ state: 'visible' });
  const downloadPromise = page.waitForEvent('download');
  const download = await downloadPromise;
  await page.locator('#gxp0_cls').click();
  await page.locator('.gx-mask').click();
        /*
        const emb = await frame.locator('embed'); // Ajustar el selector según el HTML real
        if (await emb.count() === 0) {
          console.error("No se encontró el elemento embed en el popup de PDF");
          continue; // Si no hay embed, saltar a la siguiente fila
        }
        await emb.locator('cr-icon-button#download').click(); // Ajustar el selector según el HTML real
        // Esperar a que se descargue el PDF
        await page.waitForTimeout(5000); // Ajustar el tiempo según sea necesario
        console.log("PDF descargado o abierto en el popup");
        */
        await page.waitForTimeout(1000)
        // Cerrar el popup de PDF
        await page.locator('span.PopupHeaderButton.gx-popup-close').click().catch(
          (err: any) => {
            console.error("Error al cerrar el popup de PDF:", err.message || String(err));
          }
        ); // Cerrar el popup de P
      } else {
        console.error("No se pudo abrir el popup de PDF");
      }
      //await page.locator('div.PopupContent.gx-popup-content.gx-popup-pdf').waitFor({ state: 'visible' });
      //await page.waitForTimeout(3000); // Esperar a que se cargue el contenido del popup

    }
    await page.goBack();
    await page.waitForTimeout(1000); // Esperar a que se cargue la página de comprobantes
//    console.log(data.length, " filas encontradas en la tabla de comprobantes");
    return {};
  } catch (err: any) {
    console.error("Error al leer los comprobantes:", err.message || String(err));
    throw new Error(`Error al leer los comprobantes: ${err.message || String(err)}`);
  }
}

const readSaldos = async (page: any): Promise<any> => {
  try {
    // Esperar a que la tabla de saldos esté visible
    //await page.waitForSelector('table[id="GridContainerTbl"]', { timeout: 5000 });

    // Leer los datos de la tabla de saldos
    //await page.locator('span[id="span_W0018SOC_NUMERO"]').waitFor({ state: 'visible' });
    //await page.waitForSelector('span[id="span_W0018SOC_APELLI"]', { timeout: 10000 }).catch((err: any) => {
    //  console.error("Error al esperar el selector de saldo:", err.message || String(err));
    //  //throw new Error(`Error al esperar el selector de saldo: ${err.message || String(err)}`);
    //});
    await page.waitForTimeout(1500); // Esperar a que se cargue la página de saldos
    const client_id = await page.locator('span#span_W0018SOC_APELLI.ReadonlyTextDestacado').innerText();
    const suministro_id = await page.locator('span#span_W0018SOC_NUMERO.ReadonlyTextDestacado').innerText();
    console.log("\n\nLeyendo saldos para el cliente:", suministro_id, client_id);
    //console.log("Leyendo saldos para el cliente:", client_id);
    const suministrosData = await page.locator('table[id="GridContainerTbl"]').locator('tbody').locator('tr');
    console.log("Suministros encontrados", await suministrosData.count());
    for (let si = 0; si < await suministrosData.count(); si++) {
      const row = suministrosData.nth(si);
      const cols = await row.locator('a', { hasText: "Saldo" });
      // Extaer el texto de las facturas que conforman el saldo
      await cols.click();
      await readComprobantes(page);
      console.log("Info vuelve de Read Comprobantes", si + 1, ' de ', await suministrosData.count());
      await page.waitForTimeout(1000); // Esperar a que se cargue la página de saldos

      await page.waitForTimeout(1000); // Esperar a que se cargue la página de nuevo

    }
    await page.goBack();
    console.log(await suministrosData.count(), " filas encontradas en la tabla de saldos");
    return suministrosData;
  }
  catch (err: any) {
    console.error("Error al leer los saldos:", err.message || String(err));
    throw new Error(`Error al leer los saldos: ${err.message || String(err)}`);
  }
}

const readClientData = async (page: any): Promise<any> => {
  try {
    //const client_id = await page.locator('span[id="W0015SOC_NUMERO"]').innerText()+"/"+await page.locator('span[id="W0015SUMI_NUMER"]').innerText();
    const clientData = await page.locator('table[id="GridContainerTbl"]').locator('tbody').locator('tr');
    console.log("Lista de Clientes...", await clientData.count(), " filas encontradas");
    for (let ci = 0; ci < await clientData.count(); ci++) {
      const row = clientData.nth(ci);
      const cols = await row.locator('td', {hasText: "Ingresar"});
      cols.click();
      await page.waitForTimeout(1000); // Esperar a que se cargue la

      await readSaldos(page); // Leer los saldos del cliente
      await page.waitForTimeout(1500); // Esperar a que se cargue la
      console.log("Vuelve de readSaldos para Cliente", ci + 1, 'de', await clientData.count());
    }
    console.log(await clientData.count(), " filas encontradas en la tabla de clientes");
    return clientData;
  } catch (err: any) {
    console.error("Error al leer los datos del cliente:", err.message || String(err));
    throw new Error(`Error al leer los datos del cliente: ${err.message || String(err)}`);
  }
}


(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('dialog', async dialog => {
    console.log(dialog.message());
    await dialog.dismiss();
  });
  await page.evaluate(() => alert('1'));
  const result = await loginSameep(page);
  if (!result.success) {
    console.error("Error en login:", result.error);
  } else {
    console.log("Login SAMEEP completado exitosamente");
  }
  const clientes = await readClientData(page).catch(err => {
    console.error("Error al leer los datos del cliente:", err.message || String(err));
  });
  if (clientes) {
    console.log("Datos del cliente leídos correctamente:", clientes);
  } else {
    console.error("No se pudieron leer los datos del cliente.");
  }
/*
  const response  = await page.goto("https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.saldosocio?Jkxgp5lN39+P1U22zIZrL9DkmrK7FHrcmRuy4UwqPryeXggnVd+I+eXKSZoP_h+h", { waitUntil: "domcontentloaded" }).catch((err: any) => {
    console.error("Error al cargar la página de SAMEEP:", err.message || String(err));
    return null;
  });
  if (!response || !response.ok()) {
    console.error("Error al cargar la página de SAMEEP");
    await browser.close();
    return;
  }
  */
  //await page.goto("https://www.bing.com/search?q=docker+hub+crawl4ai&cvid=8e10096dfa8140159449d5d17f1c11b5&gs_lcrp=EgRlZGdlKgYIABBFGDkyBggAEEUYOTIGCAEQRRg8MgYIAhBFGDzSAQkxNTgzMmowajmoAgiwAgE&FORM=ANAB01&PC=U531&dayref=1", { waitUntil: "domcontentloaded" })
  //await page.screenshot({ path: path.join(__dirname, '..', 'facturas', 'sameep_saldosocio_debug.png') });
  //const clientData = await readClientData(page);
  // El navegador queda abierto para inspección manual
  //await browser.close();
  //await mongoClient.close();

})();
