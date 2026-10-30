# Comparador de perfumes

Web app personal que consulta a la vez las tiendas argentinas de perfumes árabes que compro
y muestra precio y stock de todas juntas, ordenadas de la más conveniente a la menos.

Está hecha en **Google Apps Script**: `Code.gs` es el backend y `Index.html` la interfaz.
No hay build, no hay dependencias, no hay servidor propio.

## Qué hace

- Busca en **13 tiendas** al mismo tiempo (una sola búsqueda, un solo resultado ordenado).
- Ordena por **precio por mililitro**, que es la comparación honesta entre frascos de distinto
  tamaño. Cuando el tamaño no figura en el nombre asume 100 ml y lo marca con `~`.
- Contempla el **descuento por transferencia** de cada tienda y ordena con el precio real.
- **Agrupa el mismo perfume** vendido por distintas tiendas en una sola fila. Para decidir si
  dos son el mismo, ignora la marca y el vocabulario de perfumería y compara el resto de las
  palabras sin importar el orden. El tamaño **sí** separa: un 50 ml y un 100 ml no son
  intercambiables.
- **Verifica el stock** contra la ficha real del producto en las tiendas que no lo publican
  de forma confiable en el listado.
- Filtra decants y muestras, que no son comparables con un frasco.
- **Vigila búsquedas** en las 13 tiendas con un precio objetivo, y avisa por mail cuando alguna
  queda por debajo. También avisa cuando una búsqueda que no conseguía nadie aparece por primera vez.
- **Sigue productos puntuales**: guarda con qué precio entró cada uno, mide su mínimo y su
  máximo, y avisa cuando llega a tu objetivo (o baja un 5%, si no le pusiste objetivo).
- **Avisa cuando vuelve el stock** de un producto seguido que estaba agotado.
- Una **lista de prioridad** siempre visible con lo que estás por comprar, ordenable a mano
  dentro de cada prioridad.
- Link directo al carrito real en West Import.

## Las tiendas y cómo se leen

Cada tienda usa una plataforma de e-commerce distinta, y cada plataforma se lee diferente:

| Plataforma | Tiendas | Cómo se obtienen los datos |
|---|---|---|
| Shopify | West Import | API pública de sugerencias (`/search/suggest.json`) |
| WooCommerce | Rincón Perfumado | Store API (`/wp-json/wc/store/v1/products`) |
| Tiendanube | Esencias Oasis, Tom's Parfum Club, Ambrosía, Milrah | HTML de la página de búsqueda |
| Pency | Vaphouse | JSON embebido en el HTML |
| Empretienda | Un Koala Perfumado, Imperium Fragans | HTML de la página de búsqueda |
| Pedix | Huelepectacular, Idalium Parfums | JSON embebido en el HTML, + una API aparte para el stock |
| TiendaNegocio | Bancoperfumes, Klutch Shop | JSON embebido y escapado en el HTML |

Las que se leen del HTML dependen del tema de la tienda y **pueden romperse cuando la tienda
lo cambia**. Si una devuelve cero resultados, es lo primero para mirar.

### Qué precio se muestra y cómo se leen los descuentos

Cada resultado lleva `price` (lo que se paga hoy), y si la tienda lo publica, `priceLista` (el
precio tachado, que la pantalla muestra con el porcentaje) y `priceTransferencia` (el precio por
pagar con transferencia). Todo lo que ordena, compara o avisa usa el precio con transferencia si
existe. Cómo sale cada plataforma, verificado contra el sitio real:

| Plataforma | Precio de venta | Precio de lista | Descuento por transferencia |
|---|---|---|---|
| Tiendanube | el precio mostrado (ya con la promoción) | el tachado (`js-compare-price-display`) | % que dice la ficha ("20% de descuento pagando con Transferencia"); las cuatro tiendas dicen 20% |
| Pedix | **`priceDiscount`** si existe y es menor; si no, `price` | `price` (la tienda lo tacha) | no publica |
| Empretienda | el último precio del bloque | el `<del>` | el párrafo `products-feed__product-tranfer-discount` (la clase se escribe sin la s) |
| WooCommerce | `sale_price` o `price` | `regular_price` | no publica |
| Shopify | `price` | `compare_at_price_min` | **no se puede leer**, ver abajo |
| TiendaNegocio | `best_buy` (con la promo) o `price` | `price` | `discount_promo` / `discount_price` |
| Pency | `price` | no publica | no publica |

Dos trampas que ya costaron caro: **en Pedix `price` es el precio tachado** y el que se paga es
`priceDiscount` (en Idalium lo tiene casi la mitad del catálogo); y **en Empretienda el precio por
transferencia está en un párrafo aparte**, así que sin leerlo esas tiendas se comparaban a precio
de lista contra otras que sí lo tenían cargado.

**West Import** aplica sus descuentos (Cyber Monday, efectivo y transferencia, listas mayoristas
por cantidad) con scripts del carrito y no figuran en ningún dato de la página, así que el
comparador muestra su precio de lista. Si se sabe el descuento real, se declara a mano en `SITES`
con `descuentoTransferencia: 25`; ese número manda sobre cualquier lectura.

## El stock no es igual en todas

Cada resultado dice de dónde salió su estado de stock, y la interfaz no muestra como certeza
lo que es una deducción:

- **`dato`** — la tienda lo publica en su propia API. Es firme.
- **`cartel`** — se dedujo de un cartel en el HTML del listado (Tiendanube). Si cambian la
  plantilla, dejamos de verlo.
- **`ficha`** — se confirmó abriendo la página del producto. Aparece con un ✓ en la interfaz.
- **`null`** — la tienda no lo dice. Se muestra como `CONSULTAR`, que no significa "no hay".

Empretienda no publica stock en el listado, así que esos productos arrancan en `CONSULTAR` y
se confirman abriendo la ficha. Shopify queda afuera de esa verificación a propósito: la ficha
de West Import viene dando falsos negativos.

**Pedix es un caso aparte.** Dejó de traer `stockQty` en el catálogo —los 997 productos de
Idalium vienen con `active:true` y ninguna marca de stock—, así que la tienda entera figuraba
como `CONSULTAR` aunque al abrir un producto dijera "sin stock". El stock se pide ahora a un
endpoint que devuelve la tienda completa de una sola vez:

    https://api.pedix.app/v1/establishments/<establishmentId>/stock
    -> { productStock: [ { productId, stockQty }, ... ] }

El `establishmentId` sale de las URLs de las imágenes del propio catálogo, así que no hay nada
que configurar por tienda. **No es una API documentada**, es la que usa la web de Pedix: si la
cambian, esas dos tiendas vuelven a `CONSULTAR` —no a mentir—, y el `stockQty` embebido sigue
como respaldo por si alguna tienda Pedix todavía lo trae.

## Cómo se decide si un resultado corresponde a lo buscado

`esRelevante_` exige que el nombre del producto contenga **todas** las palabras buscadas, como
palabras enteras. La comparación normaliza acentos y separa la cifra de la unidad, así que
`100ml` y `100 ml` son lo mismo.

Que sean palabras enteras importa: cuando la comparación era por subcadena, buscar `king` daba
por bueno `Kingsman` y `Viking`.

Cuando una tienda no devuelve nada, la búsqueda se reintenta una vez sin las palabras que son
marca, porque hay tiendas que publican "Khamrah" y no "Lattafa Khamrah". Ese reintento **no** se
hace si al sacar la marca queda una sola palabra corta: `bharara king` se convertía en `king` y
traía medio catálogo.

## Búsquedas guardadas y productos seguidos

Son dos cosas distintas, a propósito:

- Una **búsqueda vigilada** ("khamrah") sigue al mercado: todos los días se consultan las 13
  tiendas y avisa si alguna quedó por debajo del precio objetivo. Una palabra con un guion
  adelante descarta resultados (`rome extradose -femme`), porque para el sistema alcanza con que
  estén todas las palabras pedidas y así entran la versión de mujer o la de otra marca homónima.
  Si la búsqueda no devolvía nada en ninguna tienda y un día aparece, el aviso sale igual, aunque
  el precio esté por encima del objetivo: es lo único que un producto seguido no puede hacer.
- Un **producto seguido** (un frasco concreto en una tienda concreta) sigue un precio: se
  vuelve a consultar sólo en su propia tienda y se lo ubica por URL, lo que reusa los scrapers
  ya escritos y evita trece consultas por producto.

Al lado de cada búsqueda vigilada se muestra el precio de la última medición. Sirve para detectar
el objetivo que quedó por encima del precio de mercado: esa búsqueda deja de avisar oportunidades
y pasa a avisar cada cambio de precio.

Las dos cosas las revisa el mismo disparador diario, `revisarFavoritosYAlertar`, a las 9 de la
mañana. Desde la pantalla se puede forzar la revisión de los productos seguidos con "Actualizar
ahora"; ese camino **no** consume la alerta, así que el mail de las 9 sale igual.

De cada producto seguido se guarda el precio de entrada, el actual, el de la revisión anterior,
y el mínimo y el máximo alcanzados. Ojo con qué significan esos dos últimos: salen de las
mediciones, no de todos los precios que la tienda haya tenido. Con una medición por día, un
precio que aparece y desaparece entre revisiones no queda registrado.

### Marcas y prioridad

Los productos seguidos se agrupan por marca en secciones plegables (se recuerda cuáles quedaron
abiertas). El título de cada una resume cuántos hay, cuántos son ALTA, cuántos llegaron a su
objetivo y cuántos están sin stock. La marca sale, en este orden, de lo que se le puso a mano
(botón 🏷), de lo que publica la tienda (Pedix la trae como `groupName`, y solo se acepta si es una de
`MARCAS_CONOCIDAS`, porque a veces el grupo es una categoría) o de buscarla en el nombre entre esas mismas;
si nada coincide va a "Sin marca". Escribir "LATTAFA" o "Lattafa Perfumes" cae en la sección "Lattafa".

Las fichas se mueven arrastrándolas con el mouse (manija ⠿): soltadas sobre otra ficha quedan justo
antes; sobre el título de una marca, van al final de esa marca y, si era otra, cambian de marca.
El orden se guarda en la columna `Orden` y la prioridad no mueve nada de lugar. Antes había
flechas ▲▼, que resultaban incómodas; el arrastre solo anda con mouse, no en el celular.

Cada ficha muestra cuándo se revisó por última vez; si pasaron dos días o más, en rojo, porque
entonces el precio y el stock ya no son de hoy. La revisión empieza por los productos que hace más
que no se miran y corta a los 4 minutos (Apps Script mata todo a los 6 y no se guardaría nada):
los que queden se hacen en la próxima vuelta.

### Avisar cuando vuelva el stock

Cada producto seguido guarda también si tiene stock y, si no tiene, desde qué día. Para los
agotados hay un botón "Avisar si vuelve": cuando la revisión diaria lo encuentra con stock,
manda un mail y el aviso se apaga solo, como el "avisame cuando llegue" de las tiendas.

Algunas reglas que no se deducen a simple vista:

- **Antes de avisar, el stock se confirma en la ficha** en las tiendas donde el listado no es
  confiable (Tiendanube, Empretienda). Un mail de "volvió" no puede salir por un cartel mal leído.
- **El aviso se decide por el estado de hoy, no por el cambio respecto a ayer.** Así "Actualizar
  ahora" no se come el mail: si lo tocaste y ya viste que volvió, el de las 9 sale igual.
- **"No se sabe" no toca nada.** Si un día la tienda no responde o la ficha no lo dice, no se
  borra un "sin stock" anterior ni se dispara un aviso.
- **Que un producto desaparezca de la búsqueda no lo da por agotado**: hay tiendas que esconden
  lo agotado del buscador, y eso no alcanza para afirmarlo.
- **Si la tienda no muestra precio cuando está agotado**, igual se registra el stock y se
  conserva el último precio conocido.

## El Historial

La revisión de las 9 escribe una fila por cosa seguida por día en la pestaña `Historial`:
fecha, tipo (`búsqueda` o `producto`), qué se sigue, tienda, precio y stock. Es la materia
prima de un gráfico de evolución de precios; hoy nada la lee. "Actualizar ahora" no escribe
ahí: actualiza Siguiendo, pero la medición oficial del día es la de las 9.

Para que no crezca sin fin, el detalle diario se guarda solo para el mes en curso y los tres
anteriores. Los meses más viejos se resumen solos en `Historial mensual` —mínimo, máximo,
promedio, días medidos y días con stock, con la tienda y la URL del mínimo— y su detalle se
borra. Se resume por meses enteros, así cada mes se resume una sola vez, y el proceso se puede
repetir sin duplicar nada: primero escribe el resumen y después borra el detalle.

Los días se cuentan como días, no como filas: si la revisión corrió dos veces el mismo día,
ese día cuenta una vez, con su mejor precio.

El Historial anterior al 10/09/2026 se apartó entero en `Historial (viejo)`. Tenía otro formato
y datos que no sirven para un gráfico: hasta el 08/09 guardaba todos los resultados de todas
las tiendas, y hasta el 09/09 parte eran perfumes equivocados por el bug de relevancia. Se
puede borrar a mano cuando se quiera.

### Cómo funciona el mail

La revisión diaria (`revisarFavoritosYAlertar`, a las 9) hace tres cosas en este orden: revisa los
productos seguidos, revisa las búsquedas guardadas, y manda **un solo mail** con todo.

La regla importante: **primero se manda el mail y recién después se anota que los avisos salieron**
(`confirmarAvisos_`: apaga el 🔔 de un solo uso, guarda el precio avisado, marca las búsquedas que
aparecieron). Si el envío falla, o el script se corta por el límite de 6 minutos, no queda nada
anotado y mañana se vuelve a intentar. Antes se anotaba durante la revisión, y un mail caído
dejaba el aviso como enviado sin haber salido nunca.

- Una parte que falla no tira abajo a la otra: si se cae la vigilancia de precios, igual sale el
  mail de los productos seguidos, con una sección "La revisión tuvo problemas" que dice qué.
- El aviso de precio se **rearma** cuando el producto deja de cumplir el objetivo: si sube y
  vuelve a bajar al mismo precio, avisa de nuevo.
- Hay un candado: dos corridas a la vez (un disparador duplicado) no mandan el mismo mail dos veces.
- Los tiempos se reparten: 3 minutos para consultar tiendas, hasta 4,5 para confirmar stock en
  fichas, hasta 5,5 para escribir. Lo que no llega se hace la próxima vez, ordenado por prioridad.
- `probarMail()` manda un mail de prueba y dice cuánta cuota de envíos queda: sirve para comprobar
  permisos y destinatario sin esperar a las 9.

## Cómo instalarlo

1. Crear un proyecto en [script.google.com](https://script.google.com).
2. Pegar `Code.gs` en el archivo de código y `Index.html` en un archivo HTML llamado `Index`
   (sin extensión, así lo nombra Apps Script).
3. Implementar como aplicación web.

Los mails de alerta llegan a la cuenta dueña del script, la que crea el disparador diario
`revisarFavoritosYAlertar`. No hay ninguna dirección escrita en el código.

**Al actualizar hay que crear una versión nueva** (Implementar → Gestionar implementaciones →
lápiz → Versión: Nueva). Guardar sin crear versión deja la web app sirviendo el código viejo.

## Agregar una tienda

Solo se toca `SITES` en `Code.gs`. El frontend recibe la lista con `listarConfig()`, así que
el panel de tiendas y el contador del subtítulo se actualizan solos. Lo mismo con las marcas:
viven en `MARCAS_CONOCIDAS` y de ahí salen los chips de búsqueda.

Si la tienda usa una plataforma ya soportada, no hace falta escribir ningún scraper.

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
