/**
 * COMPARADOR DE PERFUMES - Backend (Google Apps Script)
 * ------------------------------------------------------
 * Cómo desplegar:
 * 1. Andá a script.google.com > Proyecto nuevo
 * 2. Borrá el contenido de Code.gs y pegá TODO este archivo
 * 3. Arriba a la derecha: Implementar > Nueva implementación
 * 4. Tipo: Aplicación web
 * 5. Ejecutar como: Yo
 * 6. Quién tiene acceso: Cualquier usuario
 * 7. Implementar > copiá la URL que te da (termina en /exec)
 * 8. Pegá esa URL en el frontend (index.html) donde dice GAS_URL
 *
 * Para debuggear un sitio en particular sin usar el frontend,
 * corré manualmente la función testUnSitio() de acá abajo,
 * cambiando el "id" del sitio, y mirá los logs (Ver > Registros).
 */

function emailAlertas_() { return Session.getEffectiveUser().getEmail(); }  // la cuenta dueña del script, la que instaló el disparador

const SITES = [
  { id: 'oasis',    name: 'Esencias Oasis',     baseUrl: 'https://esenciasoasis.com',     type: 'tiendanube' },
  { id: 'west',     name: 'West Import',        baseUrl: 'https://westimportshop.com',    type: 'shopify' },
  { id: 'rincon',   name: 'Rincón Perfumado',   baseUrl: 'https://rinconperfumado.com',   type: 'woocommerce' },
  { id: 'toms',     name: "Tom's Parfum Club",  baseUrl: 'https://tomsparfumclub.com.ar', type: 'tiendanube' },
  { id: 'vaphouse', name: 'Vaphouse (Pency)',   baseUrl: 'https://pency.app/vaphouse',    type: 'pency' },
  { id: 'koala',    name: 'Un Koala Perfumado', baseUrl: 'https://unkoalaperfumado.com.ar', type: 'empretienda' },
  { id: 'ambrosia', name: 'Ambrosía Perfumes',  baseUrl: 'https://www.ambrosiaperfumes.com.ar', type: 'tiendanube' },
  { id: 'pedix',    name: 'Huelepectacular', baseUrl: 'https://pedix.app/huelepectacular', type: 'pedix', categoriasExcluir: ['WaLMilAMEprICNjjUJra'] },
  { id: 'jrlstore', name: 'Idalium Parfums', baseUrl: 'https://pedix.app/idalium', type: 'pedix' },
  { id: 'banco',    name: 'Bancoperfumes',      baseUrl: 'https://bancoperfumes.tiendanegocio.com', type: 'tiendanegocio' },
  { id: 'klutch',   name: 'Klutch Shop',        baseUrl: 'https://klutchshop.ar',          type: 'tiendanegocio' },
  { id: 'milrah',   name: 'Milrah Perfumes',    baseUrl: 'https://milrahperfumes.com',     type: 'tiendanube' },
  { id: 'imperium', name: 'Imperium Fragans',   baseUrl: 'https://imperiumfragans.empretienda.com.ar', type: 'empretienda' },
];


/**
 * Punto de entrada del Web App.
 * Uso: TU_URL_DE_DEPLOY?q=lattafa+khamrah
 */
/**
 * Sirve la página web (sin ?q=) o el JSON de resultados (con ?q=).
 * Se mantiene el modo JSON por si querés pegarle a la URL directo para probar.
 */
/**
 * Permite usar la web app como API: /exec?q=khamrah devuelve el JSON crudo.
 * La función se llamaba desde doGet pero no estaba definida, así que ese camino
 * venía tirando error; la pantalla normal (sin ?q=) nunca pasó por acá.
 */
function jsonResponse_(datos) {
  return ContentService
    .createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const query = (e && e.parameter && e.parameter.q || '').trim();

  if (!query) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Comparador de Perfumes')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return jsonResponse_(buscarTodos_(query));
}

/**
 * Esta es la que llama el frontend vía google.script.run (sin fetch, sin CORS).
 */
function buscarPerfumes(query) {
  return buscarTodos_(query);
}

/**
 * Lógica compartida de búsqueda en los 10 sitios.
 */
function buscarTodos_(query) {
  const output = { query: query, results: [], errors: [] };

  if (!query) {
    output.errors.push('Falta la búsqueda');
    return output;
  }

  // Para las tiendas que no ponen la marca en el nombre del producto (ej. Klutch,
  // que publica "Khamrah" y no "Lattafa Khamrah"): si una tienda no devuelve nada,
  // se reintenta una sola vez sacando de la búsqueda las palabras que son marca.
  const queryAlternativa = consultaSinMarca_(query);

  SITES.forEach(function (site) {
    try {
      let items = buscarEnSitio_(site, query);

      if (items.length === 0 && queryAlternativa) {
        items = buscarEnSitio_(site, queryAlternativa);
        items.forEach(function (item) { item.marcaOmitida = true; });
      }

      items.forEach(function (item) { output.results.push(item); });
    } catch (err) {
      output.errors.push(site.name + ': ' + err.message);
    }
  });

  output.results.sort(function (a, b) {
    const aVal = a.pricePerMlTransferencia != null ? a.pricePerMlTransferencia : (a.pricePerMl != null ? a.pricePerMl : (a.price != null ? a.price : Infinity));
    const bVal = b.pricePerMlTransferencia != null ? b.pricePerMlTransferencia : (b.pricePerMl != null ? b.pricePerMl : (b.price != null ? b.price : Infinity));
    return aVal - bVal;
  });

  return output;
}

/**
 * Consulta una sola tienda y devuelve sus productos ya filtrados y con
 * precio por ml y precio por transferencia calculados.
 */
function buscarEnSitio_(site, query) {
  let items = [];
  if (site.type === 'shopify') items = scrapeShopify_(site, query);
  else if (site.type === 'woocommerce') items = scrapeWooCommerce_(site, query);
  else if (site.type === 'tiendanube') items = scrapeTiendanube_(site, query);
  else if (site.type === 'pency') items = scrapePency_(site, query);
  else if (site.type === 'empretienda') items = scrapeEmpretienda_(site, query);
  else if (site.type === 'pedix') items = scrapePedix_(site, query);
  else if (site.type === 'tiendanegocio') items = scrapeTiendaNegocio_(site, query);

  items = items.filter(function (item) { return !esDecant_(item.name, item.url); });
  items = items.filter(function (item) { return esRelevante_(item.name, query); });

  // De dónde salió el stock de cada item, para que el frontend no muestre como
  // certeza lo que en realidad es una heurística. El scraper puede haberlo
  // definido él mismo (Empretienda, Tiendanube); si no, lo deduce el tipo.
  items.forEach(function (item) {
    if (item.stockFuente !== undefined) return;
    item.stockFuente = item.inStock == null ? null : (FUENTE_STOCK_POR_TIPO[site.type] || null);
  });

  items.forEach(function (item) {
    const ml = extraerMl_(item.name);
    item.ml = ml;
    if (ml && item.price != null) {
      item.pricePerMl = item.price / ml;
      item.mlEstimado = false;
    } else if (item.price != null) {
      // No sabemos el tamaño real: asumimos 100ml (el más común) solo para poder ordenar bien
      item.pricePerMl = item.price / 100;
      item.mlEstimado = true;
    } else {
      item.pricePerMl = null;
      item.mlEstimado = false;
    }
  });

  const pctTransferencia = obtenerPorcentajeTransferencia_(site);
  if (pctTransferencia > 0) {
    items.forEach(function (item) {
      if (item.price != null) {
        item.priceTransferencia = Math.round(item.price * (1 - pctTransferencia / 100));
        item.pctTransferencia = pctTransferencia;
        item.pricePerMlTransferencia = item.ml
          ? item.priceTransferencia / item.ml
          : item.priceTransferencia / 100;
      }
    });
  }

  // Las tiendas que traen el precio de transferencia producto por producto
  // (TiendaNegocio) ya lo dejaron cargado: solo falta el precio por ml.
  items.forEach(function (item) {
    if (item.priceTransferencia != null && item.pricePerMlTransferencia == null) {
      item.pricePerMlTransferencia = item.ml
        ? item.priceTransferencia / item.ml
        : item.priceTransferencia / 100;
    }
  });

  return items;
}

// Marcas que suelen venir en el nombre del producto. Se usan para dos cosas:
// reintentar la búsqueda sin la marca, y agrupar el mismo perfume entre tiendas.
const MARCAS_CONOCIDAS = [
  'Lattafa', 'Afnan', 'Armaf', 'Ard Al Zaafaran', 'Al Haramain', 'Rasasi', 'Nabeel',
  'Maison Alhambra', 'Khadlaj', 'Bharara', 'Riifs', 'French Avenue', 'Paris Corner',
  'Swiss Arabian', 'Rayhaan', 'Maison Asrar'
];

/**
 * Saca de la búsqueda las palabras que son nombre de marca.
 * Devuelve null si no queda nada, o si no había ninguna marca que sacar
 * (en esos casos reintentar no aportaría nada).
 */
function consultaSinMarca_(query) {
  const palabrasDeMarca = {};
  MARCAS_CONOCIDAS.forEach(function (marca) {
    marca.toLowerCase().split(/\s+/).forEach(function (w) { palabrasDeMarca[w] = true; });
  });

  const palabras = query.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 0; });
  const resto = palabras.filter(function (w) { return !palabrasDeMarca[w]; });

  if (resto.length === 0 || resto.length === palabras.length) return null;
  return resto.join(' ');
}

function esDecant_(name, url) {
  const n = name.toLowerCase();
  const u = (url || '').toLowerCase();

  if (n.includes('decant') || n.includes('muestra') || n.includes('sample') || n.includes('mini') || n.includes('tester')) {
    return true;
  }
  if (u.includes('decant') || u.includes('muestra') || u.includes('sample')) {
    return true;
  }
  const match = n.match(/(\d+(?:[.,]\d+)?)\s?ml/);
  if (match) {
    const ml = parseFloat(match[1].replace(',', '.'));
    if (ml <= 20) return true;
  }
  return false;
}

function extraerMl_(name) {
  const match = name.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s?ml/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

// Exige que el nombre del producto contenga TODAS las palabras de la búsqueda
// (no alguna suelta), para que "armaf mandarin" no traiga cualquier Armaf.
function esRelevante_(name, query) {
  const nameLower = name.toLowerCase();
  const palabras = query.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 0; });
  return palabras.every(function (palabra) { return nameLower.includes(palabra); });
}

// La planilla abierta, reusada durante toda una ejecución. Cada obtenerSheet_()
// hacía un openById más cuatro getSheetByName, y una sola acción del usuario la
// llamaba dos o tres veces.
let _ssCache = null;

function obtenerSheet_() {
  if (_ssCache) return _ssCache;

  const props = PropertiesService.getScriptProperties();
  let sheetId = props.getProperty('SHEET_ID');
  let ss;

  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch (err) {
      sheetId = null;
    }
  }

  if (!sheetId) {
    ss = SpreadsheetApp.create('Comparador de Perfumes - Datos');
    sheetId = ss.getId();
    props.setProperty('SHEET_ID', sheetId);
    ss.getSheets()[0].setName('Favoritos');
  }

  // Nos aseguramos de que TODAS las pestañas existan, aunque la planilla ya existiera de antes
  if (!ss.getSheetByName('Favoritos')) {
    const favSheet = ss.insertSheet('Favoritos');
    favSheet.appendRow(['Búsqueda', 'Precio objetivo', 'Fecha agregado', 'Última alerta enviada']);
  }
  if (!ss.getSheetByName('Historial')) {
    const histSheet = ss.insertSheet('Historial');
    histSheet.appendRow(['Fecha', 'Búsqueda', 'Sitio', 'Nombre', 'Precio', 'En stock', 'URL']);
  }
  if (!ss.getSheetByName('Seguimiento')) {
    const segSheet = ss.insertSheet('Seguimiento');
    segSheet.appendRow(COLUMNAS_SEGUIMIENTO);
    migrarCarritoASeguimiento_(ss, segSheet);
  } else {
    asegurarColumnasSeguimiento_(ss.getSheetByName('Seguimiento'));
  }

  _ssCache = ss;
  return ss;
}

const COLUMNAS_SEGUIMIENTO = ['ID', 'Nombre', 'Sitio', 'URL', 'Precio inicial', 'Precio actual',
                              'Precio objetivo', 'Prioridad', 'Fecha agregado', 'Última revisión',
                              'Última alerta', 'Precio anterior', 'Precio mínimo', 'Precio máximo'];

/**
 * Las tres últimas columnas se agregaron después. Si la planilla es de antes,
 * se le escriben los encabezados y se arranca el mínimo y el máximo con el
 * precio que cada producto tenga hoy: no hay historia previa que inventar.
 */
function asegurarColumnasSeguimiento_(sheet) {
  const anchoActual = sheet.getLastColumn();
  if (anchoActual >= COLUMNAS_SEGUIMIENTO.length) return;

  sheet.getRange(1, 1, 1, COLUMNAS_SEGUIMIENTO.length).setValues([COLUMNAS_SEGUIMIENTO]);

  const ultima = sheet.getLastRow();
  if (ultima < 2) return;

  const actuales = sheet.getRange(2, 6, ultima - 1, 1).getValues();
  const nuevas = actuales.map(function (f) {
    const precio = f[0] === '' ? '' : Number(f[0]);
    return ['', precio, precio];   // anterior, mínimo, máximo
  });
  sheet.getRange(2, 12, nuevas.length, 3).setValues(nuevas);
}

/**
 * El carrito viejo guardaba productos con cantidad, para hacer una cuenta.
 * Ahora esos mismos productos son cosas que se siguen, así que se pasan tal cual:
 * el precio con el que estaban cargados pasa a ser el precio inicial, que es
 * contra el que después se compara para saber si bajó.
 */
function migrarCarritoASeguimiento_(ss, segSheet) {
  const viejo = ss.getSheetByName('Carrito');
  if (!viejo) return;

  const data = viejo.getDataRange().getValues();
  const filas = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const precio = data[i][3] === '' ? '' : Number(data[i][3]);
    filas.push([
      data[i][0],           // ID
      data[i][1],           // Nombre
      data[i][2],           // Sitio
      data[i][5],           // URL
      precio,               // Precio inicial (el que tenía cuando lo agregaste)
      precio,               // Precio actual
      '',                   // Precio objetivo
      PRIORIDAD_NORMAL,     // Prioridad
      data[i][6] || new Date(),
      '',                   // Última revisión
      '',                   // Última alerta
      '',                   // Precio anterior
      precio,               // Precio mínimo
      precio,               // Precio máximo
    ]);
  }

  if (filas.length) {
    segSheet.getRange(2, 1, filas.length, COLUMNAS_SEGUIMIENTO.length).setValues(filas);
  }
  // La pestaña vieja se deja quieta: si algo salió mal, los datos siguen ahí.
  viejo.setName('Carrito (viejo)');
}

function agregarFavorito(query, precioObjetivo) {
  const ss = obtenerSheet_();
  const sheet = ss.getSheetByName('Favoritos');
  const data = sheet.getDataRange().getValues();

  // Si ya existe esa búsqueda, actualizamos el precio objetivo en vez de duplicar
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(query).toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(precioObjetivo || '');
      return listarFavoritos();
    }
  }

  sheet.appendRow([query, precioObjetivo || '', new Date()]);
  return listarFavoritos();
}

function listarFavoritos() {
  const ss = obtenerSheet_();
  const sheet = ss.getSheetByName('Favoritos');
  const data = sheet.getDataRange().getValues();
  const favoritos = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    favoritos.push({
      query: data[i][0],
      precioObjetivo: data[i][1] || null,
    });
  }

  return favoritos;
}

function eliminarFavorito(query) {
  const ss = obtenerSheet_();
  const sheet = ss.getSheetByName('Favoritos');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(query).toLowerCase()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }

  return listarFavoritos();
}

/**
 * La revisión diaria. El disparador ya creado apunta a este nombre, así que no
 * se renombra aunque ahora haga dos cosas: las búsquedas guardadas y los
 * productos que estás siguiendo.
 */
function revisarFavoritosYAlertar() {
  const alertas = { busquedas: revisarFavoritos_(), productos: revisarSeguimiento_() };

  if (alertas.busquedas.length || alertas.productos.length) {
    enviarEmailAlertas_(alertas);
  }
}

function revisarFavoritos_() {
  const favoritos = listarFavoritos();
  if (favoritos.length === 0) return [];

  const histSheet = obtenerSheet_().getSheetByName('Historial');
  const ahora = new Date();
  const alertas = [];

  favoritos.forEach(function (fav) {
    const resultado = buscarTodos_(fav.query);

    // Se guarda una sola fila por día y por búsqueda: la mejor oferta del día.
    // Antes se guardaban TODOS los resultados de todas las tiendas, y con unos
    // pocos favoritos eran cientos de miles de filas por año que nadie leía.
    const mejor = mejorOferta_(resultado.results);
    if (mejor) {
      histSheet.appendRow([ahora, fav.query, mejor.site, mejor.name,
                           precioEfectivo_(mejor), mejor.inStock, mejor.url]);
    }

    if (!fav.precioObjetivo) return;

    const cumplen = resultado.results
      .filter(function (r) {
        // `inStock !== false` y no `inStock`: desde que el stock dice la verdad,
        // null significa "no se sabe", y descartarlo dejaba afuera tiendas
        // enteras (Empretienda no publica stock en el listado).
        return r.inStock !== false && precioEfectivo_(r) != null &&
               precioEfectivo_(r) <= Number(fav.precioObjetivo);
      })
      .sort(function (a, b) { return precioEfectivo_(a) - precioEfectivo_(b); });

    if (cumplen.length === 0) {
      // Si ya nadie cumple el objetivo, se borra la huella para que el día que
      // vuelva a cumplirse (aunque sea al mismo precio) avise de nuevo.
      guardarUltimaAlerta_(fav.query, '');
      return;
    }

    const huellaActual = JSON.stringify(cumplen.map(function (i) { return i.site + ':' + precioEfectivo_(i); }));
    if (huellaActual !== obtenerUltimaAlerta_(fav.query)) {
      alertas.push({ query: fav.query, objetivo: fav.precioObjetivo, items: cumplen });
      guardarUltimaAlerta_(fav.query, huellaActual);
    }

    Utilities.sleep(1000);
  });

  return alertas;
}

function mejorOferta_(items) {
  const conPrecio = items.filter(function (r) {
    return r.inStock !== false && precioEfectivo_(r) != null;
  });
  if (!conPrecio.length) return null;
  return conPrecio.sort(function (a, b) {
    const am = a.pricePerMlTransferencia != null ? a.pricePerMlTransferencia : a.pricePerMl;
    const bm = b.pricePerMlTransferencia != null ? b.pricePerMlTransferencia : b.pricePerMl;
    return (am == null ? Infinity : am) - (bm == null ? Infinity : bm);
  })[0];
}

/**
 * Vuelve a mirar el precio de cada producto seguido.
 *
 * En vez de abrir la ficha (haría falta un lector de precios distinto por
 * plataforma), se repite la búsqueda EN SU PROPIA TIENDA y se busca el producto
 * por URL. Así se reusan los scrapers que ya están probados, y es una sola
 * tienda por producto en lugar de las trece.
 */
function revisarSeguimiento_() {
  return refrescarPrecios_(true);
}

/**
 * Vuelve a mirar los precios desde la pantalla, sin mandar mail y sin marcar
 * nada como avisado: si hoy un producto llegó a tu objetivo, el mail de las 9
 * tiene que salir igual aunque hayas tocado el botón antes.
 */
function actualizarPreciosSeguimiento() {
  refrescarPrecios_(false);
  return listarSeguimiento();
}

function refrescarPrecios_(conAlertas) {
  const seguidos = listarSeguimiento();
  if (seguidos.length === 0) return [];

  const sheet = obtenerSheet_().getSheetByName('Seguimiento');
  const filas = sheet.getDataRange().getValues();
  const histSheet = obtenerSheet_().getSheetByName('Historial');
  const ahora = new Date();
  const alertas = [];
  const cache = {};   // una misma búsqueda sirve para varios productos de la misma tienda

  seguidos.forEach(function (seg) {
    const site = sitioPorNombre_(seg.site);
    if (!site) return;

    const consulta = consultaDeSeguimiento_(seg.name);
    const clave = site.id + '|' + consulta;

    if (cache[clave] === undefined) {
      try {
        cache[clave] = buscarEnSitio_(site, consulta);
      } catch (err) {
        cache[clave] = null;   // la tienda no respondió: hoy no se sabe
      }
      Utilities.sleep(500);
    }
    const encontrados = cache[clave];
    if (!encontrados) return;

    const match = encontrados.filter(function (r) { return r.url === seg.url; })[0];
    if (!match) return;   // ya no aparece: se deja el precio anterior, no se inventa

    const precioHoy = precioEfectivo_(match);
    if (precioHoy == null) return;

    const fila = indiceDeFila_(filas, seg.id);
    if (fila > 0) {
      // Una sola escritura con toda la fila en vez de cinco sueltas: con varios
      // productos seguidos, cada llamada a la planilla se nota.
      const nueva = filas[fila].slice();
      nueva[5]  = precioHoy;                                  // precio actual
      nueva[9]  = ahora;                                      // última revisión
      nueva[11] = seg.precioActual == null ? '' : seg.precioActual;  // el de antes de hoy
      nueva[12] = seg.precioMin == null ? precioHoy : Math.min(seg.precioMin, precioHoy);
      nueva[13] = seg.precioMax == null ? precioHoy : Math.max(seg.precioMax, precioHoy);
      sheet.getRange(fila + 1, 1, 1, COLUMNAS_SEGUIMIENTO.length).setValues([nueva]);
      filas[fila] = nueva;   // para que la marca de alerta de más abajo no pise esto
    }
    histSheet.appendRow([ahora, seg.name, seg.site, match.name, precioHoy, match.inStock, seg.url]);

    if (!conAlertas) return;

    // Avisa si llegó al objetivo o, sin objetivo, si bajó al menos un 5% del
    // precio con el que lo empezaste a seguir. El umbral evita que un redondeo
    // de la tienda mande un mail todos los días.
    const llegoAlObjetivo = seg.precioObjetivo != null && precioHoy <= seg.precioObjetivo;
    const bajoSolo = seg.precioObjetivo == null && seg.precioInicial &&
                     precioHoy <= seg.precioInicial * 0.95;
    if (!llegoAlObjetivo && !bajoSolo) return;

    const huella = String(precioHoy);
    if (fila > 0 && String(filas[fila][10]) === huella) return;   // ya se avisó a este precio

    alertas.push({
      name: seg.name, site: seg.site, url: seg.url,
      precioInicial: seg.precioInicial, precioHoy: precioHoy,
      objetivo: seg.precioObjetivo, enStock: match.inStock,
    });
    if (fila > 0) {
      sheet.getRange(fila + 1, 11).setValue(huella);
      filas[fila][10] = huella;
    }
  });

  return alertas;
}

function indiceDeFila_(filas, id) {
  for (let i = 1; i < filas.length; i++) {
    if (filas[i][0] === id) return i;
  }
  return -1;
}

/** Las dos palabras más largas del nombre: suelen ser las que identifican al perfume. */
function consultaDeSeguimiento_(nombre) {
  const palabras = String(nombre).replace(/[^\wáéíóúñÁÉÍÓÚÑ ]/g, ' ').split(/\s+/)
    .filter(function (w) { return w.length > 2 && !/^\d+$/.test(w); });
  palabras.sort(function (a, b) { return b.length - a.length; });
  return palabras.slice(0, 2).join(' ') || String(nombre);
}


const NL = '\n';
const SEPARADOR   = NL + NL + '─'.repeat(40) + NL + NL;
const SEPARADOR_2 = NL + NL + '═'.repeat(40) + NL + NL;

function enviarEmailAlertas_(alertas) {
  const partes = [];

  if (alertas.busquedas.length) {
    const bloques = alertas.busquedas.map(function (a) {
      const items = a.items.map(function (item, i) {
        return '  • ' + item.site + ': ' + pesos_(precioEfectivo_(item)) +
               (item.priceTransferencia != null ? ' (con transferencia)' : '') +
               (i === 0 ? '   ← el más barato' : '') + NL + '    ' + item.url;
      }).join(NL + NL);
      return '🎯 "' + a.query + '" (objetivo: ' + pesos_(a.objetivo) + ')' + NL + NL + items;
    }).join(SEPARADOR);

    partes.push('BÚSQUEDAS GUARDADAS' + NL + NL +
                'Estas tiendas están por debajo de tu precio objetivo:' + NL + NL + bloques);
  }

  if (alertas.productos.length) {
    const bloques = alertas.productos.map(function (a) {
      const motivo = a.objetivo != null
        ? 'llegó a tu objetivo de ' + pesos_(a.objetivo)
        : 'bajó desde ' + pesos_(a.precioInicial);
      return '📉 ' + a.name + NL +
             '   ' + a.site + ' — ahora ' + pesos_(a.precioHoy) + ', ' + motivo +
             (a.enStock === false ? NL + '   OJO: la tienda lo da como SIN STOCK' : '') +
             NL + '   ' + a.url;
    }).join(NL + NL);

    partes.push('PRODUCTOS QUE SEGUÍS' + NL + NL + bloques);
  }

  const cuantos = alertas.busquedas.length + alertas.productos.length;
  MailApp.sendEmail({
    to: emailAlertas_(),
    subject: '🧴 ' + cuantos + (cuantos === 1 ? ' novedad' : ' novedades') + ' en tu lista de perfumes',
    body: partes.join(SEPARADOR_2) + NL,
  });
}

function pesos_(n) {
  return n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString('es-AR');
}


function activarRevisionDiaria() {
  // Primero borramos triggers viejos de esta función, para no duplicar
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarFavoritosYAlertar') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('revisarFavoritosYAlertar')
    .timeBased()
    .everyDays(1)
    .atHour(9) // corre todos los días a las 9am
    .create();

  Logger.log('Listo, se activó la revisión diaria a las 9am.');
}

function obtenerUltimaAlerta_(query) {
  const ss = obtenerSheet_();
  const sheet = ss.getSheetByName('Favoritos');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(query).toLowerCase()) {
      return data[i][3] || '';
    }
  }
  return '';
}

function guardarUltimaAlerta_(query, valor) {
  const ss = obtenerSheet_();
  const sheet = ss.getSheetByName('Favoritos');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(query).toLowerCase()) {
      sheet.getRange(i + 1, 4).setValue(valor);
      break;
    }
  }
}

const PRIORIDAD_ALTA   = 1;
const PRIORIDAD_NORMAL = 2;
const PRIORIDAD_BAJA   = 3;

/**
 * Lo que realmente se paga: si la tienda hace descuento por transferencia, ese
 * es el precio. Es el mismo criterio con el que se ordena la lista en pantalla,
 * así que la alerta y el orden hablan del mismo número.
 */
function precioEfectivo_(item) {
  if (item.priceTransferencia != null) return Number(item.priceTransferencia);
  return item.price != null ? Number(item.price) : null;
}

function filaASeguido_(fila) {
  return {
    id:             fila[0],
    name:           fila[1],
    site:           fila[2],
    url:            fila[3],
    precioInicial:  fila[4] === '' ? null : Number(fila[4]),
    precioActual:   fila[5] === '' ? null : Number(fila[5]),
    precioObjetivo: fila[6] === '' ? null : Number(fila[6]),
    prioridad:      Number(fila[7]) || PRIORIDAD_NORMAL,
    ultimaRevision: fila[9] ? String(fila[9]) : null,
    precioAnterior: fila[11] === '' || fila[11] == null ? null : Number(fila[11]),
    precioMin:      fila[12] === '' || fila[12] == null ? null : Number(fila[12]),
    precioMax:      fila[13] === '' || fila[13] == null ? null : Number(fila[13]),
  };
}

function listarSeguimiento() {
  const sheet = obtenerSheet_().getSheetByName('Seguimiento');
  const data = sheet.getDataRange().getValues();
  const salida = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    salida.push(filaASeguido_(data[i]));
  }

  // Primero lo prioritario y, dentro de cada nivel, lo que más bajó de precio
  salida.sort(function (a, b) {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    return bajaPorcentual_(b) - bajaPorcentual_(a);
  });
  return salida;
}

/** Cuánto bajó desde que lo empezaste a seguir, en por ciento. 0 si no se puede saber. */
function bajaPorcentual_(seguido) {
  if (!seguido.precioInicial || seguido.precioActual == null) return 0;
  return (1 - seguido.precioActual / seguido.precioInicial) * 100;
}

/**
 * Empieza a seguir un producto. Si ya lo seguías, no lo duplica: actualiza el
 * precio actual y devuelve la lista como está.
 */
function agregarASeguimiento(item) {
  const sheet = obtenerSheet_().getSheetByName('Seguimiento');
  const data = sheet.getDataRange().getValues();
  const precio = precioEfectivo_(item);

  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === item.url) {
      if (precio != null) sheet.getRange(i + 1, 6).setValue(precio);
      return listarSeguimiento();
    }
  }

  sheet.appendRow([
    Utilities.getUuid(), item.name, item.site, item.url,
    precio == null ? '' : precio,   // precio inicial
    precio == null ? '' : precio,   // precio actual
    item.precioObjetivo == null ? '' : Number(item.precioObjetivo),
    item.prioridad || PRIORIDAD_NORMAL,
    new Date(), '', '',
    '',                             // precio anterior: todavía no hubo revisión
    precio == null ? '' : precio,   // mínimo
    precio == null ? '' : precio,   // máximo
  ]);
  return listarSeguimiento();
}

function eliminarDeSeguimiento(id) {
  const sheet = obtenerSheet_().getSheetByName('Seguimiento');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return listarSeguimiento();
}

/**
 * Cambia el precio objetivo o la prioridad. Solo toca lo que venga en `campos`.
 *
 * No devuelve la lista a propósito: la pantalla ya se pintó con el cambio antes
 * de llamar acá, y volver a leer y mandar toda la planilla era la mitad de la
 * demora. Tampoco lee todas las columnas: le alcanza con la de los IDs.
 */
function actualizarSeguimiento(id, campos) {
  const sheet = obtenerSheet_().getSheetByName('Seguimiento');
  const ultima = sheet.getLastRow();
  if (ultima < 2) return;

  const ids = sheet.getRange(2, 1, ultima - 1, 1).getValues();

  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] !== id) continue;
    const fila = i + 2;

    if (campos && campos.precioObjetivo !== undefined) {
      const v = campos.precioObjetivo;
      sheet.getRange(fila, 7).setValue(v === null || v === '' ? '' : Number(v));
      sheet.getRange(fila, 11).setValue('');   // el objetivo cambió: la alerta vieja ya no vale
    }
    if (campos && campos.prioridad !== undefined) {
      sheet.getRange(fila, 8).setValue(Number(campos.prioridad) || PRIORIDAD_NORMAL);
    }
    return;
  }
}

function vaciarSeguimiento() {
  const sheet = obtenerSheet_().getSheetByName('Seguimiento');
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  return listarSeguimiento();
}


/* =========================================================
 * SHOPIFY (West Import)
 * Usa el endpoint público de sugerencias de búsqueda.
 * ========================================================= */
function scrapeShopify_(site, query) {
  const url = site.baseUrl + '/search/suggest.json?q=' + encodeURIComponent(query) +
    '&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=show';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());

  const data = JSON.parse(res.getContentText());
  const products = (data.resources && data.resources.results && data.resources.results.products) || [];

  return products.map(function (p) {
    let inStock = p.available !== false ? true : null; // si Shopify dice que SÍ hay, confiamos. Si dice que NO, quedamos en duda por ahora.

    if (inStock === null) {
      // Re-chequeamos contra la ficha real. Si ahí confirma disponible, lo damos por bueno.
      // Si la ficha TAMBIÉN dice que no hay, no lo marcamos como "sin stock" seguro
      // (West Import viene mostrando falsos negativos), queda como "no lo sabemos".
      const confirmado = verificarStockShopify_(site.baseUrl + p.url);
      inStock = confirmado ? true : null;
    }

    return {
      site: site.name,
      name: p.title,
      price: parseUsPrice_(p.price),
      inStock: inStock,
      url: site.baseUrl + p.url,
    };
  });
}

function verificarStockShopify_(productUrl) {
  try {
    const cleanUrl = productUrl.split('?')[0];
    const res = UrlFetchApp.fetch(cleanUrl + '.js', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return false;
    const data = JSON.parse(res.getContentText());
    const variants = data.variants || [];
    return variants.some(function (v) { return v.available; });
  } catch (err) {
    return false;
  }
}

/* =========================================================
 * WOOCOMMERCE (Rincón Perfumado)
 * Usa la Store API pública (sin autenticación).
 * ========================================================= */
function scrapeWooCommerce_(site, query) {
  const palabraClave = palabraMasEspecifica_(query);
  const url = site.baseUrl + '/wp-json/wc/store/v1/products?search=' + encodeURIComponent(palabraClave) + '&per_page=20';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());

  const products = JSON.parse(res.getContentText());
  if (!Array.isArray(products)) throw new Error('Respuesta inesperada (¿Store API deshabilitada?)');

  return products.map(function (p) {
    const minorUnit = (p.prices && p.prices.currency_minor_unit != null) ? p.prices.currency_minor_unit : 2;
    const rawPrice = p.prices ? (p.prices.sale_price || p.prices.price) : null;
    const price = rawPrice ? Number(rawPrice) / Math.pow(10, minorUnit) : null;

    return {
      site: site.name,
      name: p.name,
      price: price,
      inStock: p.is_in_stock !== false,
      url: p.permalink,
    };
  });
}

// El buscador de WooCommerce exige frase exacta, así que le mandamos
// solo la palabra más larga (suele ser la más específica) y dejamos
// que esRelevante_ exija después que también tenga las demás palabras.
function palabraMasEspecifica_(query) {
  const palabras = query.trim().split(/\s+/);
  return palabras.reduce(function (mayor, actual) {
    return actual.length > mayor.length ? actual : mayor;
  }, palabras[0]);
}

/* =========================================================
 * TIENDANUBE (Esencias Oasis, Tom's Parfum Club)
 * No hay API pública documentada -> parseamos el HTML
 * de la página de resultados de búsqueda (/buscar?q=).
 *
 * OJO: esto depende del tema de la tienda y puede romperse.
 * Si devuelve 0 resultados, correr dumpHtml_() para inspeccionar
 * el HTML crudo y ajustar las expresiones regulares de abajo.
 * ========================================================= */
function scrapeTiendanube_(site, query) {
  const url = site.baseUrl + '/search?q=' + encodeURIComponent(query);
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());

  const html = res.getContentText();
  const categoriaPorId = extraerCategoriasPorProductId_(html);

  // Encontramos las posiciones de cada marcador de producto (no usamos split(), para poder
  // mirar tanto hacia adelante -nombre/precio- como hacia atrás -imagen con cartel de stock-)
  const markerPositions = [];
  ['<div class="product-item-information', '<div class="item-description'].forEach(function (marcador) {
    let pos = html.indexOf(marcador);
    while (pos !== -1) {
      markerPositions.push(pos);
      pos = html.indexOf(marcador, pos + 10);
    }
  });
  markerPositions.sort(function (a, b) { return a - b; });

  const items = [];

  markerPositions.forEach(function (pos, iMarcador) {
    // Acotamos la ventana a este producto: si miráramos 3000 caracteres fijos
    // hacia atrás, en un tema con los productos más juntos leeríamos el cartel
    // de "Sin stock" del producto anterior y lo daríamos por propio.
    const marcadorPrevio = iMarcador > 0 ? markerPositions[iMarcador - 1] : 0;
    const desde = Math.max(marcadorPrevio, pos - 3000);
    const marcadorSiguiente = iMarcador + 1 < markerPositions.length ? markerPositions[iMarcador + 1] : html.length;

    const forwardCorto = html.substring(pos, Math.min(pos + 2000, marcadorSiguiente));  // nombre y precio, como siempre
    const forwardLargo = html.substring(pos, Math.min(pos + 8000, marcadorSiguiente));  // solo para el ID (Ambrosía/Decants)
    const beforeText = html.substring(desde, pos); // la imagen y su cartel de stock

    const nameMatch = forwardCorto.match(/class="[^"]*\bitem-name\b[^"]*"[^>]*>\s*([^<]+?)\s*</);
    const hrefMatch = forwardCorto.match(/href="([^"]+)"/);
    if (!nameMatch || !hrefMatch) return;

    const idMatch = forwardLargo.match(/data-store="product-item-[a-z]+-(\d+)"/);
    if (idMatch && categoriaPorId[idMatch[1]] === 'Decants') return;

    let price = null;
    const priceAttrMatch = forwardCorto.match(/data-product-price="([\d.]+)"/);
    if (priceAttrMatch) {
      const raw = priceAttrMatch[1];
      price = raw.indexOf('.') !== -1 ? parseFloat(raw) : Number(raw) / 100;
    } else {
      const priceTextMatch = forwardCorto.match(/js-price-display[^"]*"[^>]*>\s*\$?\s*([\d.,]+)/);
      if (priceTextMatch) price = parsePrice_(priceTextMatch[1]);
    }

    // El cartel de "Sin stock" puede estar ANTES del marcador (sobre la imagen, tema Ambrosía)
    // o DESPUÉS (tema Tom's/Oasis) - miramos las dos zonas juntas.
    const zonaStock = beforeText + forwardCorto;
    const noStock = hayStockLabelVisible_(zonaStock);

    const rawHref = hrefMatch[1];
    const productUrl = rawHref.startsWith('http') ? rawHref : site.baseUrl + rawHref;

    items.push({
      site: site.name,
      name: nameMatch[1].trim(),
      price: price,
      inStock: !noStock,
      // Es el cartel del tema, no un dato de la tienda: si cambian la plantilla
      // esto pasa a decir "hay stock" siempre. verificarStockLote() lo confirma.
      stockFuente: 'cartel',
      url: productUrl,
    });
  });

  return items;
}

// Busca el div de "Sin stock"/"Agotado" y confirma que NO esté oculto con style="display:none"
// (en Tiendanube esa plantilla siempre existe en el HTML, oculta por default).
function hayStockLabelVisible_(html) {
  const regex = /<div[^>]*(?:stock-label|label-stock)[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const tagCompleto = match[0];
    const estaOculto = /style="[^"]*display:\s*none/i.test(tagCompleto);
    if (!estaOculto) {
      // Confirmamos que el texto que sigue realmente diga "sin stock" o "agotado"
      const despues = html.substring(match.index, match.index + 150).toLowerCase();
      if (despues.includes('sin stock') || despues.includes('agotado')) return true;
    }
  }
  return false;
}

// Extrae el array "googleItems" (si existe) y arma un mapa product_id -> categoría,
// para poder descartar decants con certeza en vez de adivinar por el nombre.
function extraerCategoriasPorProductId_(html) {
  const marcador = 'const googleItems = ';
  const inicio = html.indexOf(marcador);
  if (inicio === -1) return {};

  let i = inicio + marcador.length;
  if (html[i] !== '[') return {};

  let profundidad = 0;
  let fin = i;
  for (; fin < html.length; fin++) {
    if (html[fin] === '[') profundidad++;
    else if (html[fin] === ']') {
      profundidad--;
      if (profundidad === 0) { fin++; break; }
    }
  }

  try {
    const items = JSON.parse(html.substring(i, fin));
    const mapa = {};
    items.forEach(function (gi) {
      if (gi.source && gi.source.product_id) {
        mapa[gi.source.product_id] = gi.info && gi.info.item_category;
      }
    });
    return mapa;
  } catch (err) {
    return {};
  }
}

/* =========================================================
 * PENCY (Vaphouse)
 * Catálogo probablemente renderizado por JS (SPA) -> UrlFetchApp
 * puede NO ver los productos si vienen de una API externa.
 * Cacheamos el HTML crudo 1 hora para no golpear el sitio seguido.
 * Si esto devuelve 0 resultados siempre, hay que inspeccionar
 * el Network tab del navegador para encontrar la API real.
 * ========================================================= */
function scrapePency_(site, query) {
  const res = UrlFetchApp.fetch(site.baseUrl, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
  const html = res.getContentText();

  const blocks = html.split('{"position":').slice(1);
  const items = [];

  blocks.forEach(function (block) {
    const titleMatch = block.match(/"title":"([^"]*)"/);
    const categoryMatch = block.match(/"category":"([^"]*)"/);
    const priceMatch = block.match(/"price":(\d+(?:\.\d+)?)/);
    const typeMatch = block.match(/"type":"([^"]*)"/);

    if (!titleMatch) return;

    const title = titleMatch[1].trim();
    const category = categoryMatch ? categoryMatch[1].trim() : '';
    // Combinamos marca + nombre para que el filtro de relevancia pueda
    // encontrar "armaf" aunque no esté en el título del producto.
    const nombreCompleto = (category + ' ' + title).trim();

    items.push({
      site: site.name,
      name: nombreCompleto,
      price: priceMatch ? Number(priceMatch[1]) : null,
      inStock: typeMatch ? typeMatch[1] === 'available' : true,
      url: site.baseUrl,
    });
  });

  return items;
}

function scrapeEmpretienda_(site, query) {
  const url = site.baseUrl + '/search?q=' + encodeURIComponent(query);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
  const html = res.getContentText();

  const blocks = html.split('products-feed__product-wrapper').slice(1);
  const items = [];

  blocks.forEach(function (rawBlock) {
    const block = rawBlock.substring(0, 2000);

    const nameMatch = block.match(/products-feed__product-name[^>]*>\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/);
    const hrefMatch = block.match(/href="([^"]+)"/);
    if (!nameMatch || !hrefMatch) return;

    const priceBlockMatch = block.match(/products-feed__product-price[^>]*>([\s\S]*?)<\/p>/);
    let price = null;
    if (priceBlockMatch) {
      const priceMatches = priceBlockMatch[1].match(/\$[\d.,]+/g) || [];
      // El último precio del bloque es el vigente (el primero, si hay <del>, es el tachado)
      if (priceMatches.length > 0) price = parsePrice_(priceMatches[priceMatches.length - 1]);
    }

    // El listado de Empretienda NO trae el stock: verificado a mano contra
    // unkoalaperfumado (12 productos, cero marcas de stock en el HTML).
    // Por eso un cartel de "sin stock" prueba que NO hay, pero su ausencia no
    // prueba que sí: en ese caso queda en null y lo resuelve verificarStockLote().
    const lowerBlock = block.toLowerCase();
    const noStock = lowerBlock.includes('sin stock') || lowerBlock.includes('agotado') || lowerBlock.includes('sold-out') || lowerBlock.includes('sold_out');

    items.push({
      site: site.name,
      name: nameMatch[1].trim(),
      price: price,
      inStock: noStock ? false : null,
      stockFuente: noStock ? 'cartel' : null,
      url: hrefMatch[1],
    });
  });

  return items;
}

function scrapePedix_(site, query) {
  const res = UrlFetchApp.fetch(site.baseUrl, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
  const html = res.getContentText();

  const categoriasDecant = extraerCategoriasDecantPedix_(html);
  const blocks = html.split('{"id":"').slice(1);
  const items = [];

  blocks.forEach(function (rawBlock) {
    const block = rawBlock.substring(0, 1500);

    const categoryMatch = block.match(/"categoryId":"([^"]*)"/);
    if (categoryMatch && categoriasDecant[categoryMatch[1]]) return;

    const nameMatch = block.match(/"name":"([^"]*)"/);
    if (!nameMatch) return;
    const name = nameMatch[1].trim();
    if (!esRelevante_(name, query)) return;
    if (esDecant_(name, '')) return; // red de seguridad extra, por si el nombre mismo lo delata

    const idMatch = block.match(/^([^"]+)"/);
    const productId = idMatch ? idMatch[1] : null;

    const priceMatch = block.match(/"price":(\d+(?:\.\d+)?)/);
    const stockMatch = block.match(/"stockQty":(\d+)/);
    const activeMatch = block.match(/"active":(true|false)/);

    const stockQty = stockMatch ? Number(stockMatch[1]) : null;
    const active = activeMatch ? activeMatch[1] === 'true' : true;
    // Si tenemos el dato real de stockQty, confiamos en él.
    // Si no lo tenemos, no sabemos de verdad (el sitio solo lo revela al abrir la ficha), así que usamos null.
    const inStock = stockQty != null ? (stockQty > 0 && active) : null;

    const url = (productId && categoryMatch)
      ? site.baseUrl + '/categoria/' + categoryMatch[1] + '/producto/' + productId
      : site.baseUrl;

    items.push({
      site: site.name,
      name: name,
      price: priceMatch ? Number(priceMatch[1]) : null,
      inStock: inStock,
      url: url,
    });
  });

  return items;
}

// Busca en el HTML todas las categorías cuyo título contenga "decant" (sin importar mayúsculas/acentos)
// y devuelve un mapa { categoryId: true } para poder excluirlas sin mantener una lista fija a mano.
function extraerCategoriasDecantPedix_(html) {
  const mapa = {};
  const regex = /title="([^"]*[Dd]ecant[^"]*)"\s+href="[^"]*\/categoria\/([^"\/]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    mapa[match[2]] = match[1];
  }
  return mapa;
}

function scrapeTiendaNegocio_(site, query) {
  const url = site.baseUrl + '/productos/buscar?keywords=' + encodeURIComponent(query);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
  const html = res.getContentText();

  const items = [];

  // TiendaNegocio publica los productos como JSON escapado dentro del HTML.
  // Primero ubicamos dónde arranca cada producto, así podemos acotar el bloque
  // de cada uno (desde su título hasta el título del siguiente).
  const productRegex = /&q;title&q;:&q;([^&]+)&q;,&q;price&q;:\d+,&q;promo&q;:[^,]*,&q;stock&q;:(?:\d+|null)/g;
  const inicios = [];
  const titulos = [];
  let m;
  while ((m = productRegex.exec(html)) !== null) {
    inicios.push(m.index);
    titulos.push(m[1]);
  }

  for (let k = 0; k < inicios.length; k++) {
    const title = titulos[k].trim();
    if (!esRelevante_(title, query)) continue;

    const startIdx = inicios[k];
    const finIdx = (k + 1 < inicios.length) ? inicios[k + 1] : Math.min(html.length, startIdx + 8000);
    const bloqueProducto = html.substring(startIdx, finIdx);

    const hashMatch = bloqueProducto.match(/&q;hash&q;:&q;([^&]+)&q;/);
    const productUrl = hashMatch ? site.baseUrl + '/producto/' + hashMatch[1] : url;

    // Las variantes viven antes del "hash"; los datos sueltos del producto, después
    const posHash = bloqueProducto.indexOf('&q;hash&q;');
    const antesDelHash = posHash !== -1 ? bloqueProducto.substring(0, posHash) : bloqueProducto;

    const delProducto = [];

    // --- Caso A: el producto tiene variantes, una por tamaño (ej. Bancoperfumes) ---
    const optionsRegex = /&q;options&q;:&q;([^&]+)&q;/g;
    let optMatch;
    while ((optMatch = optionsRegex.exec(antesDelHash)) !== null) {
      const tamano = optMatch[1];
      if (esDecant_(tamano, '')) continue;

      const antes = antesDelHash.substring(Math.max(0, optMatch.index - 400), optMatch.index);
      const despues = antesDelHash.substring(optMatch.index, optMatch.index + 500);
      const priceMatch = antes.match(/&q;price&q;:(\d+(?:\.\d+)?)(?!.*&q;price&q;)/s);
      const stockMatch = antes.match(/&q;stockAvailable&q;:(true|false)(?!.*&q;stockAvailable&q;)/s);
      const discountPriceMatch = despues.match(/&q;discount_price&q;:([\d.]+)/);

      if (priceMatch) {
        const precio = Number(priceMatch[1]);
        const item = {
          site: site.name,
          name: title + ' (' + tamano + ')',
          price: precio,
          inStock: stockMatch ? stockMatch[1] === 'true' : true,
          url: productUrl,
        };
        if (discountPriceMatch) {
          const precioTransferencia = Math.round(Number(discountPriceMatch[1]));
          if (precioTransferencia < precio) {
            item.priceTransferencia = precioTransferencia;
            item.pctTransferencia = Math.round((1 - precioTransferencia / precio) * 100);
          }
        }
        delProducto.push(item);
      }
    }

    // --- Caso B: producto sin variantes; precio y stock están en el nivel de arriba
    // (ej. Klutch Shop). Solo entra si el caso A no encontró nada para este producto.
    if (delProducto.length === 0) {
      const bestMatch  = bloqueProducto.match(/&q;best_buy&q;:(\d+(?:\.\d+)?)/);
      const promoMatch = bloqueProducto.match(/&q;promo&q;:(\d+(?:\.\d+)?)/);
      const priceMatch = bloqueProducto.match(/&q;price&q;:(\d+(?:\.\d+)?)/);

      // best_buy es el precio que la tienda realmente cobra (ya contempla la promo)
      const precio = bestMatch ? Number(bestMatch[1])
                   : (promoMatch ? Number(promoMatch[1])
                   : (priceMatch ? Number(priceMatch[1]) : null));

      if (precio != null && precio > 0) {
        const stockMatch = bloqueProducto.match(/&q;stockAvailable&q;:(true|false)/);
        const item = {
          site: site.name,
          name: title,
          price: precio,
          inStock: stockMatch ? stockMatch[1] === 'true' : null,
          url: productUrl,
        };

        // discount_promo acompaña a best_buy; discount_price, al precio de lista
        const dPromo = bloqueProducto.match(/&q;discount_promo&q;:(\d+(?:\.\d+)?)/);
        const dPrice = bloqueProducto.match(/&q;discount_price&q;:(\d+(?:\.\d+)?)/);
        const transferencia = dPromo ? Number(dPromo[1]) : (dPrice ? Number(dPrice[1]) : null);

        if (transferencia != null && transferencia > 0 && transferencia < precio) {
          item.priceTransferencia = Math.round(transferencia);
          item.pctTransferencia = Math.round((1 - transferencia / precio) * 100);
        }

        delProducto.push(item);
      }
    }

    delProducto.forEach(function (i) { items.push(i); });
  }

  return items;
}
function parsePrice_(raw) {
  if (raw == null) return null;
  // Formato argentino: $164.250,00 -> 164250.00
  const cleaned = String(raw).replace(/[^\d.,]/g, '');
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

function parseUsPrice_(raw) {
  if (raw == null) return null;
  // Formato US/Shopify: "71815.00" -> 71815.00 (el punto YA es decimal, no tocar)
  const num = parseFloat(String(raw).replace(/[^\d.]/g, ''));
  return isNaN(num) ? null : num;
}

function obtenerLinkCarritoShopify(productUrl, cantidad) {
  try {
    const cleanUrl = productUrl.split('?')[0];
    const res = UrlFetchApp.fetch(cleanUrl + '.js', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;

    const data = JSON.parse(res.getContentText());
    const variantDisponible = data.variants.find(function (v) { return v.available; }) || data.variants[0];
    if (!variantDisponible) return null;

    const baseUrl = cleanUrl.split('/products/')[0];
    return baseUrl + '/cart/' + variantDisponible.id + ':' + (cantidad || 1);
  } catch (err) {
    return null;
  }
}
function obtenerLinkCarritoMultipleWest(items) {
  try {
    const partes = [];
    let baseUrl = null;

    items.forEach(function (item) {
      const cleanUrl = item.url.split('?')[0];
      const res = UrlFetchApp.fetch(cleanUrl + '.js', { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return;

      const data = JSON.parse(res.getContentText());
      const variantDisponible = data.variants.find(function (v) { return v.available; }) || data.variants[0];
      if (!variantDisponible) return;

      if (!baseUrl) baseUrl = cleanUrl.split('/products/')[0];
      partes.push(variantDisponible.id + ':' + (item.cantidad || 1));
    });

    if (partes.length === 0 || !baseUrl) return null;
    return baseUrl + '/cart/' + partes.join(',');
  } catch (err) {
    return null;
  }
}

/* =========================================================
 * FUNCIONES DE DEBUG - EJECUTAR ESTAS DESDE EL DESPLEGABLE
 * (Apps Script oculta del desplegable las funciones que
 * terminan en "_", por eso estas son wrappers sin "_")
 * ========================================================= */

function debugOasisMandarinStock2() {
  const url = 'https://esenciasoasis.com/search?q=mandarin+sky';
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  const blocks = html.split(/<div class="(?:item-description|product-item-information)/).slice(1);
  Logger.log('Cantidad de bloques totales: ' + blocks.length);

  blocks.forEach(function (rawBlock) {
    const block = rawBlock.substring(0, 2000);
    if (block.toLowerCase().indexOf('mandarin') === -1) return;

    Logger.log('=== Bloque con "mandarin" ===');
    Logger.log('¿Contiene "sin stock"? ' + block.toLowerCase().includes('sin stock'));
    Logger.log('¿Contiene "agotado"? ' + block.toLowerCase().includes('agotado'));
    Logger.log(block);
  });
}

function debugOasisMandarinFinal() {
  const site = SITES.find(function (s) { return s.id === 'oasis'; });
  const resultado = scrapeTiendanube_(site, 'mandarin sky');
  Logger.log(JSON.stringify(resultado, null, 2));
}

function debugOasisVentanaGrande() {
  const url = 'https://esenciasoasis.com/search?q=' + encodeURIComponent('mandarin sky');
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  const blocks = html.split(/<div class="(?:item-description|product-item-information)/).slice(1);
  const primerBloque = blocks[0].substring(0, 8000); // la ventana grande que usamos ahora

  const idxSinStock = primerBloque.toLowerCase().indexOf('sin stock');
  Logger.log('¿Aparece "sin stock" en la ventana de 8000? ' + (idxSinStock !== -1));
  if (idxSinStock !== -1) {
    Logger.log('Posición dentro del bloque: ' + idxSinStock + ' (el bloque en sí mide ' + primerBloque.length + ')');
    Logger.log(primerBloque.substring(Math.max(0, idxSinStock - 200), idxSinStock + 100));
  }
}

function debugHuelepectacularBharara() {
  const site = SITES.find(function (s) { return s.id === 'pedix'; });
  const res = UrlFetchApp.fetch(site.baseUrl, { muteHttpExceptions: true });
  const html = res.getContentText();

  const blocks = html.split('{"id":"').slice(1);
  blocks.forEach(function (rawBlock) {
    const block = rawBlock.substring(0, 500);
    const nameMatch = block.match(/"name":"([^"]*)"/);
    if (!nameMatch || nameMatch[1].toLowerCase().indexOf('bharara') === -1) return;

    const categoryMatch = block.match(/"categoryId":"([^"]*)"/);
    const priceMatch = block.match(/"price":(\d+(?:\.\d+)?)/);
    Logger.log(nameMatch[1] + ' | categoryId: ' + (categoryMatch ? categoryMatch[1] : '?') + ' | price: ' + (priceMatch ? priceMatch[1] : '?'));
  });
}

function debugHuelepectacularCategorias() {
  const site = SITES.find(function (s) { return s.id === 'pedix'; });
  const res = UrlFetchApp.fetch(site.baseUrl, { muteHttpExceptions: true });
  const html = res.getContentText();

  const idx = html.indexOf('eL52cEQkAZw7Jq1eHxht');
  Logger.log(html.substring(Math.max(0, idx - 300), idx + 100));
}


function debugHuelepectacularStockBug2() {
  const site = SITES.find(function (s) { return s.id === 'pedix'; });
  const res = UrlFetchApp.fetch(site.baseUrl, { muteHttpExceptions: true });
  const html = res.getContentText();

  const idx = html.indexOf('oumIJuHIJPNEbo2PopRu');
  Logger.log(html.substring(idx + 700, idx + 1300));
}

function debugWestBhararaKingSoleil() {
  const url = 'https://westimportshop.com/products/bharara-king-soleil-edp-100ml.json';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log('HTTP: ' + res.getResponseCode());
  Logger.log(res.getContentText());
}

function debugWestBhararaKingSoleilCorto() {
  const url = 'https://westimportshop.com/products/bharara-king-soleil-edp-100ml.json';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());

  Logger.log('Título: ' + data.product.title);
  Logger.log('Cantidad de variantes: ' + data.product.variants.length);
  data.product.variants.forEach(function (v, i) {
    Logger.log('Variante ' + i + ': available=' + v.available + ' | precio=' + v.price);
  });
}

function debugWestBhararaOnyx() {
  const url = 'https://westimportshop.com/products/bharara-onyx-edp-100ml.js';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());

  Logger.log('Título: ' + data.title);
  Logger.log('Cantidad de variantes: ' + data.variants.length);
  data.variants.forEach(function (v, i) {
    Logger.log('Variante ' + i + ': available=' + v.available + ' | precio=' + v.price);
  });
}

function debugAmbrosiaBhararaKing() {
  const url = 'https://www.ambrosiaperfumes.com.ar/search?q=bharara+king';
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();
  const idx = html.indexOf('bharara-king-parfum-100ml1');
  Logger.log(html.substring(Math.max(0, idx - 1500), idx + 300));
}

function debugAmbrosiaBhararaKing2() {
  const url = 'https://www.ambrosiaperfumes.com.ar/search?q=bharara+king';
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();
  const idx = html.indexOf('bharara-king-parfum-100ml1');

  const bloqueAmplio = html.substring(idx, idx + 3000);
  Logger.log('¿Tiene "product-item-label-stock"? ' + bloqueAmplio.includes('product-item-label-stock'));
  Logger.log('¿Tiene "sin stock" en minúsculas? ' + bloqueAmplio.toLowerCase().includes('sin stock'));

  const idxStock = bloqueAmplio.indexOf('product-item-label-stock');
  if (idxStock !== -1) {
    Logger.log(bloqueAmplio.substring(Math.max(0, idxStock - 50), idxStock + 300));
  }
}

function debugAmbrosiaFuncionReal() {
  const site = SITES.find(function (s) { return s.id === 'ambrosia'; });
  const resultado = scrapeTiendanube_(site, 'bharara king');
  Logger.log(JSON.stringify(resultado, null, 2));
}

function debugAmbrosiaBloqueReal() {
  const url = 'https://www.ambrosiaperfumes.com.ar/search?q=' + encodeURIComponent('bharara king');
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  const blocks = html.split(/<div class="(?:item-description|product-item-information)/).slice(1);

  blocks.forEach(function (rawBlock) {
    const blockCorto = rawBlock.substring(0, 2000);
    if (blockCorto.indexOf('bharara-king-parfum-100ml1') === -1) return;

    Logger.log('¿Tiene "sin stock" en este blockCorto? ' + blockCorto.toLowerCase().includes('sin stock'));
    Logger.log('Largo real de este blockCorto: ' + blockCorto.length);
    Logger.log('Últimos 300 caracteres del blockCorto:');
    Logger.log(blockCorto.substring(blockCorto.length - 300));
  });
}

function debugAmbrosiaVerificarPatron() {
  const url = 'https://www.ambrosiaperfumes.com.ar/search?q=' + encodeURIComponent('bharara king');
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  const blocks = html.split(/<div class="(?:item-description|product-item-information)/).slice(1);

  blocks.forEach(function (rawBlock) {
    const blockLargo = rawBlock.substring(0, 8000);
    if (blockLargo.indexOf('bharara-king-parfum-100ml1') === -1) return;

    const lowerBlock = blockLargo.toLowerCase();
    const patron1 = /class="[^"]*stock-label[^"]*"[^>]*>\s*sin stock/.test(lowerBlock);
    const patron2 = lowerBlock.includes('>agotado<');
    const patron3 = lowerBlock.includes('>sin stock<');

    Logger.log('¿Contiene "sin stock" en algún lado del blockLargo? ' + lowerBlock.includes('sin stock'));
    Logger.log('Patrón 1 (class stock-label): ' + patron1);
    Logger.log('Patrón 2 (>agotado<): ' + patron2);
    Logger.log('Patrón 3 (>sin stock<): ' + patron3);

    const idx = lowerBlock.indexOf('sin stock');
    if (idx !== -1) {
      Logger.log('Contexto real alrededor de "sin stock":');
      Logger.log(blockLargo.substring(Math.max(0, idx - 150), idx + 50));
    }
  });
}

function debugAmbrosiaBuscarCercaDelLink() {
  const url = 'https://www.ambrosiaperfumes.com.ar/search?q=' + encodeURIComponent('bharara king');
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();
  const lowerHtml = html.toLowerCase();

  // Buscamos TODAS las apariciones del link de este producto (puede haber más de una copia)
  let idx = html.indexOf('bharara-king-parfum-100ml1');
  let contador = 0;
  while (idx !== -1 && contador < 5) {
    Logger.log('=== Aparición ' + (contador + 1) + ' en posición ' + idx + ' ===');
    const ventana = lowerHtml.substring(Math.max(0, idx - 1000), idx + 3000);
    Logger.log('¿"sin stock" en un radio de -1000/+3000 de esta aparición? ' + ventana.includes('sin stock'));
    idx = html.indexOf('bharara-king-parfum-100ml1', idx + 10);
    contador++;
  }
}

function debugAmbrosiaPosicionExacta() {
  const url = 'https://www.ambrosiaperfumes.com.ar/search?q=' + encodeURIComponent('bharara king');
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();
  const lowerHtml = html.toLowerCase();

  const idxSinStock = lowerHtml.indexOf('sin stock', 950000);
  Logger.log('Posición de "sin stock": ' + idxSinStock);

  Logger.log('Posición ocurrencia 1 del link: 956383');
  Logger.log('Posición ocurrencia 2 del link: 959494');
  Logger.log('Diferencia con ocurrencia 1: ' + (idxSinStock - 956383));
  Logger.log('Diferencia con ocurrencia 2: ' + (idxSinStock - 959494));

  Logger.log('¿Tiene "product-item-information" antes de "sin stock" y después de la ocurrencia 1?');
  const entreMedio = html.substring(956383, idxSinStock);
  Logger.log('Cantidad de "product-item-information" entre medio: ' + (entreMedio.match(/product-item-information/g) || []).length);
}

function debugAmbrosiaPosicionMarcador() {
  const url = 'https://www.ambrosiaperfumes.com.ar/search?q=' + encodeURIComponent('bharara king');
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  // Buscamos todas las posiciones del marcador "product-item-information" cerca de esta zona
  let idx = html.indexOf('product-item-information', 950000);
  let contador = 0;
  while (idx !== -1 && idx < 962000 && contador < 5) {
    Logger.log('Marcador en posición: ' + idx);
    idx = html.indexOf('product-item-information', idx + 10);
    contador++;
  }
}
function debugAmbrosiaContenedorExterior() {
  const url = 'https://www.ambrosiaperfumes.com.ar/search?q=' + encodeURIComponent('bharara king');
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  // Buscamos hacia atrás desde la posición del "Sin stock" (958776) para encontrar
  // el div contenedor que envuelve TODO el producto (imagen + info)
  Logger.log(html.substring(958776 - 2500, 958776 + 50));
}
function debugOasisPrecioTransferencia() {
  const url = 'https://esenciasoasis.com/search?q=mandarin+sky';
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  const idx = html.indexOf('product-list-item.discount');
  Logger.log(html.substring(Math.max(0, idx - 300), idx + 400));
}
function debugOasisBuscarDescuento() {
  const url = 'https://esenciasoasis.com/search?q=mandarin+sky';
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  Logger.log('¿Tiene "discount"? ' + html.includes('discount'));
  Logger.log('¿Tiene "Transferencia"? ' + html.includes('Transferencia'));
  Logger.log('¿Tiene "20%"? ' + html.includes('20%'));

  const idx = html.indexOf('Transferencia');
  if (idx !== -1) {
    Logger.log(html.substring(Math.max(0, idx - 500), idx + 100));
  }
}
function debugOasisDondeDiscount() {
  const url = 'https://esenciasoasis.com/search?q=mandarin+sky';
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  const idx = html.indexOf('discount');
  Logger.log(html.substring(Math.max(0, idx - 200), idx + 400));
}
function debugOasisFichaProducto() {
  const url = 'https://esenciasoasis.com/productos/armaf-odyssey-mandarin-sky-perfume-arabe/';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const html = res.getContentText();

  Logger.log('¿Tiene "Transferencia"? ' + html.includes('Transferencia'));
  Logger.log('¿Tiene "discount"? ' + html.includes('discount'));

  const idx = html.indexOf('Transferencia');
  if (idx !== -1) {
    Logger.log(html.substring(Math.max(0, idx - 500), idx + 100));
  }
}
function debugOasisConfigGlobal() {
  const url = 'https://esenciasoasis.com/search?q=mandarin+sky';
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  ['discountPercentage', 'discount_percentage', 'transferDiscount', 'paymentDiscount', '"percentage"'].forEach(function (clave) {
    Logger.log('¿Tiene "' + clave + '"? ' + html.includes(clave));
  });
}
function debugWestPorcentajeEnBusqueda() {
  const url = 'https://westimportshop.com/search/suggest.json?q=mandarin+sky&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=show';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const texto = res.getContentText();

  Logger.log('¿Tiene "Transferencia"? ' + texto.includes('Transferencia'));
  Logger.log('¿Tiene "40%"? ' + texto.includes('40%'));
  Logger.log('¿Tiene "compare_at_price"? ' + texto.includes('compare_at_price'));
}
function debugPorcentajesTransferencia2() {
  const ids = ['oasis', 'toms', 'ambrosia', 'west'];
  ids.forEach(function (id) {
    const site = SITES.find(function (s) { return s.id === id; });
    if (!site) { Logger.log(id + ': no encontrado en SITES'); return; }
    Logger.log(site.name + ': ' + obtenerPorcentajeTransferencia_(site) + '%');
  });
}
function obtenerPorcentajeTransferencia_(site) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'transferPct_' + site.id;
  const cacheado = cache.get(cacheKey);
  if (cacheado !== null) return Number(cacheado);

  let porcentaje = 0;
  try {
    if (site.type === 'tiendanube') {
      const res = UrlFetchApp.fetch(site.baseUrl + '/search?q=lattafa', {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
      });
      const primerProductoMatch = res.getContentText().match(/href="([^"]*\/productos\/[^"]+)"/);
      if (primerProductoMatch) {
        const productUrl = primerProductoMatch[1].startsWith('http') ? primerProductoMatch[1] : site.baseUrl + primerProductoMatch[1];
        const resProducto = UrlFetchApp.fetch(productUrl, { muteHttpExceptions: true });
        const match = resProducto.getContentText().match(/(\d+)%\s*de descuento/i);
        if (match) porcentaje = Number(match[1]);
      }
    } else if (site.id === 'west') {
      const res = UrlFetchApp.fetch(site.baseUrl + '/products/armaf-odyssey-mandarin-sky-100ml-man', { muteHttpExceptions: true });
      const match = res.getContentText().match(/(\d+)%\s*Transferencia/i);
      if (match) porcentaje = Number(match[1]);
    }
  } catch (err) {
    porcentaje = 0;
  }

  cache.put(cacheKey, String(porcentaje), 21600);
  return porcentaje;
}
function debugOasisPasoAPaso() {
  const site = SITES.find(function (s) { return s.id === 'oasis'; });

  const res = UrlFetchApp.fetch(site.baseUrl + '/search?q=lattafa', {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  const primerProductoMatch = html.match(/href="(\/productos\/[^"]+)"/);
  Logger.log('¿Encontró link de producto? ' + (primerProductoMatch ? primerProductoMatch[1] : 'NO'));

  if (primerProductoMatch) {
    const resProducto = UrlFetchApp.fetch(site.baseUrl + primerProductoMatch[1], { muteHttpExceptions: true });
    const htmlProducto = resProducto.getContentText();
    Logger.log('HTTP de la ficha: ' + resProducto.getResponseCode());
    Logger.log('¿Tiene "de descuento"? ' + htmlProducto.includes('de descuento'));

    const idx = htmlProducto.indexOf('de descuento');
    if (idx !== -1) {
      Logger.log(htmlProducto.substring(Math.max(0, idx - 50), idx + 30));
    }
  }
}
function debugOasisFormatoLinks() {
  const site = SITES.find(function (s) { return s.id === 'oasis'; });
  const res = UrlFetchApp.fetch(site.baseUrl + '/search?q=lattafa', {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  const match1 = html.match(/href="(https:\/\/esenciasoasis\.com\/productos\/[^"]+)"/);
  Logger.log('¿Con dominio completo? ' + (match1 ? match1[1] : 'NO'));

  const match2 = html.match(/href="([^"]*\/productos\/[^"]+)"/);
  Logger.log('¿Con /productos/ en cualquier lado? ' + (match2 ? match2[1] : 'NO'));
}
function debugOasisPasoAPaso2() {
  const site = SITES.find(function (s) { return s.id === 'oasis'; });

  const res = UrlFetchApp.fetch(site.baseUrl + '/search?q=lattafa', {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
  });
  const html = res.getContentText();

  const match = html.match(/href="([^"]*\/productos\/[^"]+)"/);
  Logger.log('Link encontrado: ' + (match ? match[1] : 'NO'));

  if (match) {
    const productUrl = match[1].startsWith('http') ? match[1] : site.baseUrl + match[1];
    Logger.log('URL final a pedir: ' + productUrl);

    const resProducto = UrlFetchApp.fetch(productUrl, { muteHttpExceptions: true });
    Logger.log('HTTP: ' + resProducto.getResponseCode());

    const htmlProducto = resProducto.getContentText();
    Logger.log('Largo del HTML: ' + htmlProducto.length);
    Logger.log('¿Tiene "de descuento"? ' + htmlProducto.includes('de descuento'));
    Logger.log('¿Tiene "Transferencia"? ' + htmlProducto.includes('Transferencia'));
  }
}
function debugOasisTextoDescuento() {
  const url = 'https://esenciasoasis.com/productos/lattafa-petra-perfume-arabe/';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const html = res.getContentText();

  const idx = html.indexOf('de descuento');
  Logger.log(html.substring(Math.max(0, idx - 100), idx + 50));
}
function debugLimpiarCacheYProbar() {
  const cache = CacheService.getScriptCache();
  ['oasis', 'toms', 'ambrosia', 'west'].forEach(function (id) {
    cache.remove('transferPct_' + id);
  });

  const ids = ['oasis', 'toms', 'ambrosia', 'west'];
  ids.forEach(function (id) {
    const site = SITES.find(function (s) { return s.id === id; });
    Logger.log(site.name + ': ' + obtenerPorcentajeTransferencia_(site) + '%');
  });
}

function debugTomsMandarinStock() {
  const site = SITES.find(function (s) { return s.id === 'toms'; });
  const resultado = scrapeTiendanube_(site, 'mandarin sky');
  Logger.log(JSON.stringify(resultado, null, 2));
}
function debugBancoTransferencia() {
  const url = 'https://bancoperfumes.tiendanegocio.com/productos/buscar?keywords=khamrah';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const html = res.getContentText();

  ['transferencia', 'Transferencia', '5%', 'descuento'].forEach(function (clave) {
    Logger.log('¿Tiene "' + clave + '"? ' + html.includes(clave));
  });

  const idx = html.toLowerCase().indexOf('transferencia');
  if (idx !== -1) {
    Logger.log(html.substring(Math.max(0, idx - 300), idx + 100));
  }
}
function debugBanco5Porciento() {
  const url = 'https://bancoperfumes.tiendanegocio.com/productos/buscar?keywords=khamrah';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const html = res.getContentText();

  const idx = html.indexOf('5%');
  Logger.log(html.substring(Math.max(0, idx - 300), idx + 100));
}
function debugBancoFichaProducto() {
  const url = 'https://bancoperfumes.tiendanegocio.com/producto/odyssey-mandarin-sky-armaf';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const html = res.getContentText();

  Logger.log('HTTP: ' + res.getResponseCode());
  ['pagando con Transferencia', 'Transferencia', 'discount', 'porcentaje'].forEach(function (clave) {
    Logger.log('¿Tiene "' + clave + '"? ' + html.includes(clave));
  });

  const idx = html.indexOf('pagando con Transferencia');
  if (idx !== -1) {
    Logger.log(html.substring(Math.max(0, idx - 200), idx + 50));
  }
}
function debugBancoTransferenciaReal() {
  const url = 'https://bancoperfumes.tiendanegocio.com/producto/odyssey-mandarin-sky-armaf';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const html = res.getContentText();

  const idx = html.indexOf('Transferencia');
  Logger.log(html.substring(Math.max(0, idx - 300), idx + 50));
}
function debugBancoNuevo() {
  const site = SITES.find(function (s) { return s.id === 'banco'; });
  try {
    const resultado = scrapeTiendaNegocio_(site, 'mandarin sky');
    Logger.log(JSON.stringify(resultado, null, 2));
  } catch (err) {
    Logger.log('ERROR: ' + err.message);
  }
}
function debugBancoDiscountEnBusqueda() {
  const url = 'https://bancoperfumes.tiendanegocio.com/productos/buscar?keywords=mandarin+sky';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const html = res.getContentText();

  Logger.log('¿Tiene "discount_rate"? ' + html.includes('discount_rate'));
  Logger.log('¿Tiene "discount_price"? ' + html.includes('discount_price'));
}
function debugBancoDiscountPosicion() {
  const url = 'https://bancoperfumes.tiendanegocio.com/productos/buscar?keywords=mandarin+sky';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const html = res.getContentText();

  const idxOptions = html.indexOf('&q;options&q;:&q;60ml&q;');
  const idxDiscount = html.indexOf('&q;discount_rate&q;', idxOptions);

  Logger.log('Posición de "options:60ml": ' + idxOptions);
  Logger.log('Posición del "discount_rate" más cercano después: ' + idxDiscount);
  Logger.log('Distancia: ' + (idxDiscount - idxOptions));

  Logger.log('--- Texto completo entre medio ---');
  Logger.log(html.substring(idxOptions, idxDiscount + 50));
}
function debugBancoVerDespues() {
  const url = 'https://bancoperfumes.tiendanegocio.com/productos/buscar?keywords=mandarin+sky';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const html = res.getContentText();

  const idxOptions = html.indexOf('&q;options&q;:&q;60ml&q;');
  const despues = html.substring(idxOptions, idxOptions + 500);

  Logger.log('Contenido de "despues":');
  Logger.log(despues);
  Logger.log('---');
  const match = despues.match(/&q;discount_price&q;:([\d.]+)/);
  Logger.log('¿Matcheó el regex? ' + (match ? match[1] : 'NO'));
}
/* =========================================================
 * VERIFICACIÓN DE STOCK
 *
 * No todas las tiendas dicen lo mismo cuando decís "hay stock":
 *
 *   dato   -> la tienda lo publica como tal en su propia API/JSON.
 *             WooCommerce (is_in_stock), Pency ("type":"available"),
 *             Pedix (stockQty), TiendaNegocio (stockAvailable), Shopify (available).
 *   cartel -> lo dedujimos de un cartel en el HTML del listado (Tiendanube).
 *             Si la tienda cambia la plantilla, dejamos de verlo y todo
 *             pasaría a figurar "en stock" sin que nadie se entere.
 *   null   -> el listado directamente no lo dice (Empretienda).
 *
 * Para los dos últimos casos está verificarStockLote(): abre la ficha real del
 * producto, donde la plataforma sí publica el dato, y lo confirma.
 * ========================================================= */

const FUENTE_STOCK_POR_TIPO = {
  woocommerce:   'dato',
  pency:         'dato',
  pedix:         'dato',
  tiendanegocio: 'dato',
  shopify:       'dato',
  tiendanube:    'cartel',
  empretienda:   null,
};

// Tipos cuya ficha de producto sí trae el stock de forma confiable.
// Shopify queda AFUERA a propósito: en West Import la ficha viene dando falsos
// negativos (dice que no hay y sin embargo se puede comprar), así que
// scrapeShopify_ ya decidió dejar esos casos en "no lo sabemos" y no los pisamos.
const TIPOS_VERIFICABLES = { tiendanube: true, empretienda: true };

function sitioPorNombre_(nombre) {
  for (let i = 0; i < SITES.length; i++) {
    if (SITES[i].name === nombre) return SITES[i];
  }
  return null;
}

function claveStockCache_(url) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url);
  return 'stock_' + Utilities.base64EncodeWebSafe(digest);
}

/**
 * Lee el stock de la ficha de un producto. Devuelve true, false o null
 * (null = la ficha no lo dice y no queremos inventarlo).
 */
function leerStockDeFicha_(site, contenido) {
  if (site.type === 'tiendanube') {
    // OJO: no sirve schema.org/availability. En una ficha agotada de Esencias Oasis
    // aparece 8 veces "InStock" (son los productos relacionados del pie) y una sola
    // vez "OutOfStock". El "available" de Tiendanube, en cambio, sale solo para las
    // variantes del producto que estás mirando.
    const matches = contenido.match(/"available"\s*:\s*(?:true|false)/g);
    if (!matches || !matches.length) return null;
    return matches.some(function (m) { return m.indexOf('true') !== -1; });
  }

  if (site.type === 'empretienda') {
    // var s_producto = {"sale_off":null,"precio":83631,...,"stock":true,...}
    const match = contenido.match(/s_producto\s*=\s*\{[^}]*?"stock"\s*:\s*(true|false)/);
    if (!match) return null;
    return match[1] === 'true';
  }

  return null;
}

/**
 * Verifica contra la ficha real el stock de los productos cuyo listado no lo
 * publica de forma confiable. Las tiendas que ya dan el dato ni se tocan.
 *
 * pedidos: [{ url, site }]   (site = nombre visible de la tienda)
 * devuelve: { url: true | false | null }
 *
 * Usa fetchAll para pedir todas las fichas a la vez (si no, 15 productos serían
 * 15 viajes de ida y vuelta) y cachea media hora para que refiltrar no
 * vuelva a golpear las tiendas.
 */
function verificarStockLote(pedidos) {
  const salida = {};
  if (!pedidos || !pedidos.length) return salida;

  const cache = CacheService.getScriptCache();
  const pendientes = [];

  pedidos.slice(0, 20).forEach(function (p) {
    if (!p || !p.url || salida[p.url] !== undefined) return;

    const site = sitioPorNombre_(p.site);
    if (!site || !TIPOS_VERIFICABLES[site.type]) { salida[p.url] = null; return; }

    const cacheado = cache.get(claveStockCache_(p.url));
    if (cacheado !== null) {
      salida[p.url] = cacheado === 'si' ? true : (cacheado === 'no' ? false : null);
      return;
    }

    salida[p.url] = null; // hasta que la ficha diga otra cosa
    pendientes.push({ url: p.url, site: site });
  });

  if (!pendientes.length) return salida;

  const requests = pendientes.map(function (p) {
    return {
      url: p.url,
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ComparadorPerfumes/1.0)' },
    };
  });

  let respuestas;
  try {
    respuestas = UrlFetchApp.fetchAll(requests);
  } catch (err) {
    // fetchAll es todo o nada: si una URL falla feo (DNS, timeout) se cae el lote
    // entero, así que reintentamos de a una para no perder las que sí andan.
    respuestas = requests.map(function (req) {
      try { return UrlFetchApp.fetch(req.url, req); } catch (e) { return null; }
    });
  }

  pendientes.forEach(function (p, i) {
    let estado = null;
    try {
      const res = respuestas[i];
      if (res && res.getResponseCode() === 200) estado = leerStockDeFicha_(p.site, res.getContentText());
    } catch (err) {
      estado = null;
    }
    salida[p.url] = estado;
    cache.put(claveStockCache_(p.url), estado === true ? 'si' : (estado === false ? 'no' : 'ns'), 1800);
  });

  return salida;
}

/**
 * Devuelve al frontend la configuración que antes estaba duplicada a mano:
 * la lista de tiendas (para el panel "Tiendas" y el contador del subtítulo)
 * y la de marcas (para los chips de búsqueda y el ruido al agrupar).
 * Al agregar una tienda o una marca ya solo hay que tocar SITES o
 * MARCAS_CONOCIDAS acá arriba: el frontend se entera solo.
 */
function listarConfig() {
  return {
    sitios: SITES.map(function (s) {
      return { name: s.name, url: s.baseUrl };
    }),
    marcas: MARCAS_CONOCIDAS.slice(),
  };
}
