# Estado del proyecto

Última actualización: 30/10/2026. Este archivo es la fuente de verdad para retomar el trabajo:
las conversaciones no lo son.

## Dónde está cada cosa

- `Code.gs`: backend en Apps Script (scrapers, revisión diaria, mail, planilla).
- `Index.html`: la pantalla.
- `README.md`: cómo funciona cada pieza y por qué.
- Los datos viven en una planilla de Google (pestañas `Favoritos`, `Seguimiento`, `Historial`,
  `Historial mensual`); el código se pega a mano en el proyecto de Apps Script y hay que crear una
  **versión nueva** de la implementación para que se vea.

## Qué se hizo (octubre 2026)

- **Siguiendo agrupado por marca** en secciones plegables; las fichas se mueven arrastrándolas
  (dentro de una marca o hacia otra). La marca sale de lo puesto a mano, de la que publica la
  tienda (Pedix) o del nombre.
- **Revisión diaria más robusta:** empieza por la prioridad alta, reparte el tiempo (Apps Script
  corta a los 6 minutos) y relee la planilla justo antes de escribir.
- **Mail:** los avisos se anotan como enviados solo después de que el mail salió. Antes se
  anotaban durante la revisión y un envío caído los perdía para siempre. Detalle en el README.
- **Descuentos corregidos:** Pedix usa `priceDiscount` como precio de venta (`price` es el
  tachado); Empretienda aporta el precio con transferencia; se muestra el precio de lista tachado.

## Decisiones tomadas (no volver a discutirlas)

- Sin flechas ▲▼ para ordenar: se arrastra con el mouse. No hay arrastre táctil a propósito.
- El aviso de stock es de un solo uso y se decide por el estado de hoy, no por el cambio.
- "No se sabe" nunca borra un "sin stock" ni dispara un aviso.
- Los avisos se confirman después de mandar el mail, nunca antes.
- La columna `Orden` de `Seguimiento` guarda el orden de arrastre.

## Pendiente

1. **West Import:** sus descuentos (Cyber Monday desde el 2/11/2026, efectivo y transferencia,
   listas mayoristas) los aplica un script del carrito y no se pueden leer. Hoy se muestra su
   precio de lista. Falta decidir qué porcentaje real corresponde y cargarlo con
   `descuentoTransferencia` en `SITES`.
2. **Desplegar** esta versión en Apps Script y ejecutar `probarMail()` una vez para confirmar que
   el correo llega.
3. Mirar en **Ejecuciones** si `revisarFavoritosYAlertar` corre cada día; si no, ejecutar
   `activarRevisionDiaria()`.
4. Después de desplegar, los productos de Idalium ya seguidos pueden mostrar una "baja" de golpe:
   es la corrección del precio, no una baja real.
5. Rincón Perfumado (WooCommerce) era la próxima candidata a compra directa al carrito.

## Trampas conocidas

- `Code.gs` está en LF e `Index.html` en CRLF: al editar con scripts, respetarlo.
- `google.script.run` no puede devolver `Date`: las fechas viajan como texto ISO.
- Este repo es público: no escribir direcciones de mail ni nombres de personas.
