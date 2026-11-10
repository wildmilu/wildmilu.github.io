/* =====================================================================
   WildMilu · LÓGICA DEL SITIO
   ---------------------------------------------------------------------
   Las fotos viven en  fotos.json  y el texto de "Sobre Milagros" en
   sitio.json (los dos los edita el panel /admin). Este archivo los lee
   y arma la galería, los filtros y el visor.
   No hace falta tocarlo para agregar fotos.
   ===================================================================== */

const galeria   = document.getElementById("galeria");
const filtrosEl = document.getElementById("filtros");

// Orden fijo de los filtros (solo se muestran las clases que tienen fotos)
const CLASES = ["Aves", "Mamíferos", "Reptiles", "Anfibios", "Peces", "Invertebrados"];

let FOTOS = [];
let fotosVisibles = [];

/* ---------------------------------------------------------------------
   Rutas de imágenes
   --------------------------------------------------------------------- */
// Tolera "images/x.jpg", "/images/x.jpg" o una URL completa. Las rutas quedan
// relativas para que el sitio funcione en un dominio propio o en una subcarpeta.
function normalizarRuta(src) {
  if (!src) return "";
  const s = String(src).trim();
  if (/^https?:\/\//i.test(s)) return s;   // URL completa: se deja igual
  return s.replace(/^\/+/, "");             // "/images/x.jpg" → "images/x.jpg"
}

// Miniatura liviana para la grilla: images/x.jpg → images/thumbs/x.jpg
// (el panel la genera al subir cada foto; si falta, se usa la grande)
function rutaMiniatura(src) {
  const ruta = normalizarRuta(src);
  return ruta.startsWith("images/") ? ruta.replace("images/", "images/thumbs/") : ruta;
}

// Identificador de cada foto para su link propio: images/benteveo.jpg → "benteveo"
function idFoto(foto) {
  return normalizarRuta(foto.src).split("/").pop().replace(/\.[^.]+$/, "");
}

/* ---------- 0. Cargar los datos ---------- */
const sinCache = "?" + Date.now();   // evita leer una versión vieja

fetch("fotos.json" + sinCache)
  .then(r => r.json())
  .then(data => {
    FOTOS = (data.fotos || []).filter(f => f && f.src);  // ignora entradas vacías
    fotosVisibles = [...FOTOS];
    construirFiltros();
    renderizar();
    abrirDesdeLink();   // si entraron con un link a una foto puntual
  })
  .catch(err => {
    console.error("No se pudo cargar fotos.json:", err);
    galeria.innerHTML =
      "<p style='text-align:center;color:#8a8578'>No se pudieron cargar las fotos. " +
      "Si estás abriendo el sitio localmente, usá un servidor (ver README).</p>";
  });

// "Sobre Milagros": si sitio.json no está, queda el texto que trae index.html
fetch("sitio.json" + sinCache)
  .then(r => (r.ok ? r.json() : null))
  .then(sitio => {
    const sobre = sitio && sitio.sobre;
    if (!sobre) return;
    if (sobre.foto) document.getElementById("sobre-foto").src = normalizarRuta(sobre.foto);
    if (sobre.texto) {
      const cont = document.getElementById("sobre-parrafos");
      cont.replaceChildren(...sobre.texto.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean).map(t => {
        const p = document.createElement("p");
        p.textContent = t;
        return p;
      }));
    }
  })
  .catch(() => {});

/* ---------- 1. Filtros ---------- */
function construirFiltros() {
  filtrosEl.innerHTML = "";
  const presentes = new Set(FOTOS.map(f => f.categoria).filter(Boolean));
  const categorias = ["Todas",
    ...CLASES.filter(c => presentes.has(c)),
    ...[...presentes].filter(c => !CLASES.includes(c))];   // por si aparece alguna otra
  categorias.forEach((cat, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filtro" + (i === 0 ? " activo" : "");
    const cantidad = cat === "Todas" ? FOTOS.length : FOTOS.filter(f => f.categoria === cat).length;
    const nombre = document.createElement("span");
    nombre.textContent = cat;
    const numero = document.createElement("span");
    numero.className = "filtro__n";
    numero.textContent = cantidad;
    btn.append(nombre, numero);
    btn.setAttribute("aria-label", `${cat} (${cantidad} ${cantidad === 1 ? "foto" : "fotos"})`);
    btn.setAttribute("aria-pressed", i === 0);
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filtro").forEach(b => {
        b.classList.remove("activo");
        b.setAttribute("aria-pressed", false);
      });
      btn.classList.add("activo");
      btn.setAttribute("aria-pressed", true);
      filtrar(cat);
    });
    filtrosEl.appendChild(btn);
  });
}

let filtrando = null;
function filtrar(cat) {
  fotosVisibles = cat === "Todas" ? [...FOTOS] : FOTOS.filter(f => f.categoria === cat);
  if (sinMovimiento.matches) { renderizar(); return; }
  // la galería se desvanece, cambia y vuelve a aparecer
  clearTimeout(filtrando);
  galeria.classList.add("cambiando");
  filtrando = setTimeout(() => {
    renderizar();
    requestAnimationFrame(() => galeria.classList.remove("cambiando"));
  }, 180);
}

/* ---------- 2. Galería ---------- */
/* Grilla tipo "masonry" ordenada de izquierda a derecha: cada foto va a la
   columna más corta. Como fotos.json trae el ancho y alto de cada foto, el
   lugar queda reservado desde el principio y nada salta mientras carga. */
function cantidadColumnas() {
  if (window.innerWidth <= 560) return 1;
  if (window.innerWidth <= 900) return 2;
  return 3;
}

function proporcion(foto) {               // alto / ancho
  return foto.ancho && foto.alto ? foto.alto / foto.ancho : 0.75;
}

function crearTarjeta(foto, indice) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.dataset.id = idFoto(foto);
  if (foto.color) card.style.backgroundColor = foto.color;   // color de la foto mientras carga
  card.setAttribute("aria-label", `Ver foto: ${foto.titulo || "sin título"}`);

  const img = document.createElement("img");
  img.src = rutaMiniatura(foto.src);
  img.alt = "";                           // el nombre ya lo dice la tarjeta
  img.loading = indice < 6 ? "eager" : "lazy";
  img.decoding = "async";
  if (foto.ancho && foto.alto) { img.width = foto.ancho; img.height = foto.alto; }
  img.style.aspectRatio = `1 / ${proporcion(foto)}`;
  // aparece con un fundido suave cuando termina de cargar
  img.addEventListener("load", () => img.classList.add("lista"), { once: true });

  // Si falta la miniatura se usa la foto grande; si tampoco está
  // (ruta mal escrita, archivo borrado) se oculta la tarjeta.
  img.addEventListener("error", () => {
    const grande = normalizarRuta(foto.src);
    if (!img.src.endsWith(grande)) { img.src = grande; return; }
    console.warn("No se encontró la imagen:", grande);
    card.hidden = true;
  });

  const info = document.createElement("span");
  info.className = "card__info";
  const titulo = document.createElement("span");
  titulo.className = "card__titulo";
  titulo.textContent = foto.titulo || "";
  const especie = document.createElement("span");
  especie.className = "card__especie";
  especie.textContent = foto.especie || "";
  info.append(titulo, especie);

  card.append(img, info);
  card.addEventListener("click", () => abrirLightbox(indice));
  if (img.complete && img.naturalWidth) img.classList.add("lista");   // ya estaba en caché
  return card;
}

let columnasActuales = 0;
function renderizar() {
  const n = cantidadColumnas();
  columnasActuales = n;
  const columnas = Array.from({ length: n }, () => {
    const col = document.createElement("div");
    col.className = "galeria__col";
    return col;
  });
  const altura = new Array(n).fill(0);
  fotosVisibles.forEach((foto, i) => {
    let c = 0;                            // columna más corta (a igual altura, la de la izquierda)
    for (let k = 1; k < n; k++) if (altura[k] < altura[c] - 0.01) c = k;
    columnas[c].appendChild(crearTarjeta(foto, i));
    altura[c] += proporcion(foto) + 0.08;  // + el espacio entre tarjetas
  });
  galeria.replaceChildren(...columnas);
}

// Al girar el celular o cambiar el tamaño de la ventana, reacomodar si cambia la cantidad de columnas
let esperaResize;
window.addEventListener("resize", () => {
  clearTimeout(esperaResize);
  esperaResize = setTimeout(() => { if (cantidadColumnas() !== columnasActuales) renderizar(); }, 150);
});

/* ---------- 3. Visor (lightbox) ---------- */
const lightbox    = document.getElementById("lightbox");
const lbImg       = document.getElementById("lb-img");
const lbTitulo    = document.getElementById("lb-titulo");
const lbEspecie   = document.getElementById("lb-especie");
const lbDetalle   = document.getElementById("lb-detalle");
const lbContador  = document.getElementById("lb-contador");
const lbCerrar    = document.getElementById("lb-cerrar");
const lbCompartir = document.getElementById("lb-compartir");
const lbContenido = document.querySelector(".lightbox__contenido");
const lbMeta      = document.querySelector(".lightbox__meta");
const lbVecina    = document.getElementById("lb-vecina");
const lbLugar     = document.getElementById("lb-lugar");
const lbMas       = document.getElementById("lb-mas");
const lbHoja      = document.getElementById("lb-hoja");

const DURACION = 320;                              // ms de las animaciones
const CURVA = "cubic-bezier(0.22, 0.8, 0.24, 1)";
const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
const pausa = ms => new Promise(r => setTimeout(r, ms));

// La posición de la página la maneja el sitio: así, al cerrar el visor (que usa
// el historial), el navegador no la pisa y la foto vuelve a SU tarjeta.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

let indiceActual = 0;
let focoAnterior = null;      // para devolver el foco a la tarjeta al cerrar (teclado)
let entradaPropia = false;    // true si el visor agregó una entrada al historial
let cerrando = false;         // animación de cierre en curso
let animando = false;         // animación de pase en curso
let imagenOculta = null;      // miniatura de la galería escondida mientras "vuela" al visor

const visorAbierto = () => lightbox.classList.contains("abierto") && !cerrando;

// ¿Se está usando el teclado? El foco solo se mueve en ese caso, así con el
// dedo o el mouse no aparecen recuadros de foco.
let usandoTeclado = false;
let ultimoPuntero = "mouse";
document.addEventListener("keydown", e => { if (e.key === "Tab" || e.key === "Enter" || e.key === " ") usandoTeclado = true; });
document.addEventListener("pointerdown", e => { usandoTeclado = false; ultimoPuntero = e.pointerType; });

/* ---- Tamaño y posición de una foto dentro del visor ----
   Se calcula con el ancho/alto de fotos.json, así se sabe dónde va a quedar
   antes de que cargue (lo usan las animaciones). */
function tamanoEnVisor(foto) {
  const maxAncho = lbContenido.clientWidth || window.innerWidth;
  // la foto entra entera junto con sus textos (la descripción larga va en "Leer más")
  const estilo = getComputedStyle(lightbox);
  const libre = window.innerHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom)
    - (parseFloat(getComputedStyle(lbContenido).rowGap) || 0) - lbMeta.offsetHeight;
  const maxAlto = Math.max(window.innerHeight * 0.35, Math.min(window.innerHeight * 0.72, libre));
  const prop = proporcion(foto);
  let ancho = Math.min(maxAncho, foto.ancho || maxAncho), alto = ancho * prop;
  if (alto > maxAlto) { alto = maxAlto; ancho = alto / prop; }
  return { ancho, alto };
}

// Rectángulo en pantalla que ocuparía la foto (centrada junto con sus textos)
function rectEnVisor(foto) {
  const { ancho, alto } = tamanoEnVisor(foto);
  const estilo = getComputedStyle(lightbox);
  const arriba = parseFloat(estilo.paddingTop), abajo = parseFloat(estilo.paddingBottom);
  const separacion = parseFloat(getComputedStyle(lbContenido).rowGap) || 0;
  const disponible = window.innerHeight - arriba - abajo;
  const marco = lbContenido.getBoundingClientRect();
  return {
    left: marco.left + (marco.width - ancho) / 2,
    top: arriba + (disponible - (alto + separacion + lbMeta.offsetHeight)) / 2,
    width: ancho, height: alto,
  };
}

function ajustarTamano() {
  const foto = fotosVisibles[indiceActual];
  if (!foto) return;
  const { ancho, alto } = tamanoEnVisor(foto);
  lbImg.style.width = ancho + "px";
  lbImg.style.height = alto + "px";
}
window.addEventListener("resize", () => { if (visorAbierto()) { reiniciarZoom(false); ajustarTamano(); } });

// Transformación que lleva el rectángulo "desde" a ocupar el rectángulo "hasta"
function transformacion(desde, hasta) {
  const dx = (hasta.left + hasta.width / 2) - (desde.left + desde.width / 2);
  const dy = (hasta.top + hasta.height / 2) - (desde.top + desde.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${hasta.width / desde.width})`;
}

function miniaturaEnGaleria(foto) {
  return galeria.querySelector(`.card[data-id="${CSS.escape(idFoto(foto))}"] img`);
}

// Se esconde la tarjeta entera (no solo la foto) mientras su foto está en el visor
function esconderTarjeta(img) {
  imagenOculta = img.closest(".card");
  imagenOculta.style.visibility = "hidden";
}

function mostrarMiniatura() {
  if (imagenOculta) imagenOculta.style.visibility = "";
  imagenOculta = null;
}

/* ---- Abrir: la foto "crece" desde su miniatura ---- */
function abrirLightbox(indice, { desdeLink = false } = {}) {
  indiceActual = indice;
  focoAnterior = document.activeElement;
  cerrando = false;
  lightbox.classList.add("abierto", "transicion");      // fondo y textos arrancan invisibles
  document.body.style.overflow = "hidden";
  mostrarFoto();
  // Link propio de la foto (#foto=benteveo). Se agrega al historial para que
  // el botón "atrás" del celular cierre el visor en vez de salir del sitio.
  if (!desdeLink) {
    history.pushState({ visor: true }, "", "#foto=" + idFoto(fotosVisibles[indice]));
    entradaPropia = true;
  }
  if (usandoTeclado) lbCerrar.focus({ preventScroll: true });

  const origen = !desdeLink && !sinMovimiento.matches && miniaturaEnGaleria(fotosVisibles[indice]);
  if (origen) {
    const desde = origen.getBoundingClientRect();
    const hasta = lbImg.getBoundingClientRect();
    esconderTarjeta(origen);
    lbImg.style.transition = "none";
    lbImg.style.transform = transformacion(hasta, desde);
  }
  lightbox.getBoundingClientRect();                     // fija el punto de partida
  if (origen) {
    lbImg.style.transition = `transform ${DURACION}ms ${CURVA}`;
    lbImg.style.transform = "";
  }
  lightbox.classList.remove("transicion");              // fondo y textos aparecen
}

/* ---- Cerrar: la foto vuelve a su lugar en la galería ---- */
async function ocultarLightbox() {
  if (!lightbox.classList.contains("abierto") || cerrando) return;
  cerrando = true;
  lbHoja.hidden = true;
  limpiarHoja();
  const foto = fotosVisibles[indiceActual];
  let destino = foto && !sinMovimiento.matches ? miniaturaEnGaleria(foto) : null;

  if (destino) {
    // si la foto quedó fuera de pantalla (se pasaron varias), se acomoda la galería
    const r = destino.getBoundingClientRect();
    if (r.bottom < 60 || r.top > window.innerHeight - 20) {
      // al instante (no "suave"): la foto tiene que volar a donde la tarjeta YA está
      window.scrollBy({ top: r.top + r.height / 2 - window.innerHeight / 2, behavior: "instant" });
    }
    const inicio = lbImg.getBoundingClientRect();       // donde se ve ahora (con arrastre o zoom)
    reiniciarZoom(false);
    lbContenido.style.transition = "none";
    lbContenido.style.transform = "";
    lbVecina.hidden = true;
    const base = lbImg.getBoundingClientRect();
    lbImg.style.transition = "none";
    lbImg.style.transform = transformacion(base, inicio);  // misma posición, sin salto
    lightbox.getBoundingClientRect();
    mostrarMiniatura();
    esconderTarjeta(destino);
    lbImg.style.transition = `transform ${DURACION}ms ${CURVA}`;
    lbImg.style.transform = transformacion(base, destino.getBoundingClientRect());
  }
  lightbox.style.transition = `background-color ${DURACION}ms ease, opacity ${DURACION}ms ease`;
  lightbox.style.backgroundColor = "rgba(20, 18, 15, 0)";
  lbCerrar.style.opacity = "0";
  lightbox.classList.add("transicion", destino ? "volando" : "desvaneciendo");
  await pausa(destino ? DURACION : 200);

  lightbox.classList.remove("abierto", "transicion", "volando", "desvaneciendo", "ampliado");
  for (const el of [lightbox, lbImg, lbContenido, lbCerrar]) { el.style.transition = ""; el.style.transform = ""; }
  lightbox.style.backgroundColor = "";
  lbCerrar.style.opacity = "";
  lbVecina.hidden = true;
  ladoVecina = 0;
  mostrarMiniatura();
  document.body.style.overflow = "";
  cerrando = false;
  if (usandoTeclado && focoAnterior && document.contains(focoAnterior)) focoAnterior.focus({ preventScroll: true });
}

function cerrarLightbox() {
  if (!visorAbierto()) return;
  if (ampliada()) { reiniciarZoom(true); return; }    // con zoom, primero se sale del zoom
  ocultarLightbox();
  if (entradaPropia) {
    entradaPropia = false;
    history.back();             // saca del historial la entrada que agregó el visor
  } else {                      // entraron directo con el link: se limpia la dirección
    history.replaceState(null, "", location.pathname + location.search);
  }
}

window.addEventListener("popstate", () => {
  const id = idDesdeDireccion();
  if (!id && visorAbierto()) { entradaPropia = false; ocultarLightbox(); }
  else if (id && !lightbox.classList.contains("abierto")) abrirDesdeLink();
});

function idDesdeDireccion() {
  const m = location.hash.match(/^#foto=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function abrirDesdeLink() {
  const id = idDesdeDireccion();
  if (!id || !FOTOS.length) return;
  const i = fotosVisibles.findIndex(f => idFoto(f) === id);
  if (i >= 0) abrirLightbox(i, { desdeLink: true });
  else history.replaceState(null, "", location.pathname + location.search);  // link viejo: foto borrada
}

function mostrarFoto() {
  const foto = fotosVisibles[indiceActual];
  if (!foto) return;
  reiniciarZoom(false);
  cerrarHoja(false);
  // Primero la miniatura (ya está en caché, aparece al instante)
  // y en cuanto baja la foto grande, se reemplaza.
  const grande = normalizarRuta(foto.src);
  const completa = new Image();
  completa.onload = () => { if (fotosVisibles[indiceActual] === foto) lbImg.src = grande; };
  completa.src = grande;
  lbImg.src = completa.complete ? grande : rutaMiniatura(foto.src);
  lbImg.alt = [foto.titulo, foto.especie].filter(Boolean).join(" — ");
  lbTitulo.textContent  = foto.titulo || "";
  lbEspecie.textContent = foto.especie || "";
  lbLugar.textContent = [foto.lugar, foto.fecha].filter(Boolean).join(" · ");
  lbLugar.hidden = !lbLugar.textContent;
  lbDetalle.textContent = foto.descripcion || "";
  lbDetalle.hidden = !lbDetalle.textContent;
  // "Leer más" solo si la descripción no entra en las líneas visibles
  lbMas.hidden = lbDetalle.hidden || lbDetalle.scrollHeight <= lbDetalle.clientHeight + 1;
  lbContador.textContent = `${indiceActual + 1} / ${fotosVisibles.length}`;
  ajustarTamano();              // con los textos ya puestos: sabe cuánto lugar queda para la foto
  precargarVecinas();
}

// Al pasar a otra foto, la dirección muestra la nueva (sin agregar entradas al historial)
function actualizarDireccion() {
  history.replaceState(history.state, "", "#foto=" + idFoto(fotosVisibles[indiceActual]));
}

/* Baja por adelantado la foto siguiente y la anterior: al deslizar aparecen al instante */
const precargadas = new Set();
function precargarVecinas() {
  const n = fotosVisibles.length;
  [1, -1].forEach(d => {
    const vecina = fotosVisibles[(indiceActual + d + n) % n];
    const ruta = vecina && normalizarRuta(vecina.src);
    if (ruta && !precargadas.has(ruta)) { precargadas.add(ruta); new Image().src = ruta; }
  });
}

/* Compartir: en el celular abre el menú de compartir (WhatsApp, etc.);
   en la compu copia el link */
const aviso = document.getElementById("aviso");
function mostrarAviso(texto) {
  aviso.textContent = texto;
  aviso.classList.add("visible");
  clearTimeout(mostrarAviso.t);
  mostrarAviso.t = setTimeout(() => aviso.classList.remove("visible"), 2200);
}

lbCompartir.addEventListener("click", async () => {
  const foto = fotosVisibles[indiceActual];
  // Página propia de la foto: al compartirla, WhatsApp/Instagram muestran ESA foto
  const url = location.origin + location.pathname.replace(/[^/]*$/, "") + "foto/" + idFoto(foto) + "/";
  const titulo = `${foto.titulo} · WildMilu`;
  if (navigator.share) {
    try { await navigator.share({ title: titulo, url }); } catch { /* canceló */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    mostrarAviso("Link copiado ✓");
  } catch {
    prompt("Copiá este link:", url);
  }
});

/* Eventos del visor */
/* "Leer más": el texto completo sube en una hoja que se puede scrollear */
let focoHoja = null;
function abrirHoja() {
  const foto = fotosVisibles[indiceActual];
  if (!foto) return;
  document.getElementById("lb-hoja-titulo").textContent = foto.titulo || "";
  document.getElementById("lb-hoja-especie").textContent = foto.especie || "";
  document.getElementById("lb-hoja-lugar").textContent = lbLugar.textContent;
  document.getElementById("lb-hoja-texto").textContent = foto.descripcion || "";
  lbHoja.hidden = false;
  lbHoja.querySelector(".hoja__caja").scrollTop = 0;
  focoHoja = document.activeElement;
  if (usandoTeclado) document.getElementById("lb-hoja-cerrar").focus({ preventScroll: true });
}
const hojaCaja = lbHoja.querySelector(".hoja__caja");
let cerrandoHoja = false;

function limpiarHoja() {
  hojaCaja.style.transition = hojaCaja.style.transform = "";
  lbHoja.style.transition = lbHoja.style.backgroundColor = "";
}

// Baja deslizándose (o se va al instante, si es por cambiar de foto)
async function cerrarHoja(animado = true) {
  if (lbHoja.hidden || cerrandoHoja) return;
  if (animado && !sinMovimiento.matches) {
    cerrandoHoja = true;
    hojaCaja.style.transition = `transform 260ms ${CURVA}`;
    hojaCaja.style.transform = "translateY(100%)";
    lbHoja.style.transition = "background-color 260ms ease";
    lbHoja.style.backgroundColor = "rgba(20, 18, 15, 0)";
    await pausa(260);
    cerrandoHoja = false;
  }
  lbHoja.hidden = true;
  limpiarHoja();
  if (usandoTeclado && focoHoja && lightbox.contains(focoHoja)) focoHoja.focus({ preventScroll: true });
}
const hojaAbierta = () => !lbHoja.hidden;
lbMas.addEventListener("click", abrirHoja);
document.getElementById("lb-hoja-cerrar").addEventListener("click", () => cerrarHoja());
lbHoja.addEventListener("click", e => { if (e.target === lbHoja) cerrarHoja(); });   // tocar afuera la cierra

/* Deslizar la hoja hacia abajo para cerrarla (si el texto está arriba de todo;
   si no, el dedo scrollea el texto como siempre) */
let arrastreHoja = null;
hojaCaja.addEventListener("touchstart", e => {
  arrastreHoja = e.touches.length === 1 && !cerrandoHoja && hojaCaja.scrollTop <= 0
    ? { y0: e.touches[0].clientY, yPrevio: e.touches[0].clientY, t: e.timeStamp, v: 0, dy: 0, activo: false }
    : null;
}, { passive: true });

hojaCaja.addEventListener("touchmove", e => {
  const a = arrastreHoja;
  if (!a) return;
  if (e.touches.length !== 1) { arrastreHoja = null; volverHoja(); return; }
  const y = e.touches[0].clientY;
  if (!a.activo) {
    if (y < a.y0) { arrastreHoja = null; return; }    // hacia arriba: scroll normal del texto
    if (e.cancelable) e.preventDefault();             // hacia abajo: que no rebote el texto
    if (y - a.y0 < 4) return;
    a.activo = true;
    a.y0 = y;
    hojaCaja.style.transition = lbHoja.style.transition = "none";
  }
  if (e.cancelable) e.preventDefault();
  a.dy = Math.max(0, y - a.y0);
  const dt = e.timeStamp - a.t;
  if (dt > 0) a.v = 0.8 * ((y - a.yPrevio) / dt) + 0.2 * a.v;
  a.yPrevio = y;
  a.t = e.timeStamp;
  hojaCaja.style.transform = `translateY(${a.dy}px)`;
  const resto = 1 - Math.min(1, a.dy / hojaCaja.offsetHeight);
  lbHoja.style.backgroundColor = `rgba(20, 18, 15, ${(0.55 * resto).toFixed(3)})`;
}, { passive: false });

function volverHoja() {
  hojaCaja.style.transition = `transform 250ms ${CURVA}`;
  lbHoja.style.transition = "background-color 250ms ease";
  hojaCaja.style.transform = "";
  lbHoja.style.backgroundColor = "";
  setTimeout(() => { if (!arrastreHoja && !cerrandoHoja) limpiarHoja(); }, 260);
}

function soltarHoja() {
  const a = arrastreHoja;
  arrastreHoja = null;
  if (!a || !a.activo) return;
  // se cierra si bajó bastante, o si fue un deslizón rápido hacia abajo
  if (a.dy > 100 || (a.v > 0.4 && a.dy > 20)) cerrarHoja();
  else volverHoja();
}
hojaCaja.addEventListener("touchend", soltarHoja, { passive: true });
hojaCaja.addEventListener("touchcancel", soltarHoja, { passive: true });

lbCerrar.addEventListener("click", cerrarLightbox);
document.getElementById("lb-prev").addEventListener("click", () => cambiar(-1));
document.getElementById("lb-next").addEventListener("click", () => cambiar(1));
lightbox.addEventListener("click", e => { if (e.target === lightbox && !ampliada()) cerrarLightbox(); });

document.addEventListener("keydown", e => {
  if (!visorAbierto()) return;
  if (hojaAbierta()) {
    if (e.key === "Escape") cerrarHoja();
    if (e.key === "Tab") { e.preventDefault(); document.getElementById("lb-hoja-cerrar").focus(); }
    return;
  }
  if (e.key === "Escape")     cerrarLightbox();
  if (e.key === "ArrowLeft")  cambiar(-1);
  if (e.key === "ArrowRight") cambiar(1);
  // Con Tab, el foco queda dentro del visor (no se va a la página de atrás)
  if (e.key === "Tab") {
    const enfocables = [...lightbox.querySelectorAll("button")].filter(b => b.offsetParent !== null);
    const primero = enfocables[0], ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    else if (!lightbox.contains(document.activeElement)) { e.preventDefault(); primero.focus(); }
  }
});

/* ---------- Zoom ----------
   Celular: pellizcar, o tocar dos veces. Con zoom, un dedo mueve la foto.
   Compu: clic para ampliar/achicar, arrastrar para moverse, o pellizcar el trackpad. */
const ZOOM_MAX = 4, ZOOM_TOQUE = 2.5;
let zoom = { s: 1, x: 0, y: 0 };
const ampliada = () => zoom.s > 1.01;

function aplicarZoom(animado) {
  lbImg.style.transition = animado ? `transform 0.28s ${CURVA}` : "none";
  lbImg.style.transform = zoom.s !== 1 || zoom.x || zoom.y ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` : "";
  lightbox.classList.toggle("ampliado", ampliada());
}

function reiniciarZoom(animado) {
  if (zoom.s === 1 && !zoom.x && !zoom.y) return;
  zoom = { s: 1, x: 0, y: 0 };
  aplicarZoom(animado);
}

// Centro y tamaño de la foto sin zoom, en pantalla
function baseZoom() {
  const r = lbImg.getBoundingClientRect();
  return { cx: r.left + r.width / 2 - zoom.x, cy: r.top + r.height / 2 - zoom.y, w: r.width / zoom.s, h: r.height / zoom.s };
}

// Que la foto ampliada no deje bordes vacíos (y si entra, quede centrada en pantalla)
function limitar(z, b) {
  if (z.s <= 1.01) return { s: 1, x: 0, y: 0 };
  const eje = (pos, tam, centro, vista) => {
    const t = tam * z.s;
    if (t <= vista) return vista / 2 - centro;
    return Math.min(t / 2 - centro, Math.max(vista - centro - t / 2, pos));
  };
  return { s: z.s, x: eje(z.x, b.w, b.cx, window.innerWidth), y: eje(z.y, b.h, b.cy, window.innerHeight) };
}

// Zoom a escala s dejando quieto el punto (px, py) de la pantalla
function zoomEn(s, px, py, b = baseZoom(), desde = zoom) {
  const ux = (px - b.cx - desde.x) / desde.s, uy = (py - b.cy - desde.y) / desde.s;
  return { s, x: px - b.cx - s * ux, y: py - b.cy - s * uy };
}

// Deja el zoom entre 1 y el máximo, sin bordes vacíos
function normalizarZoom(animado) {
  zoom = limitar({ ...zoom, s: Math.min(ZOOM_MAX, Math.max(1, zoom.s)) }, baseZoom());
  aplicarZoom(animado);
}

function alternarZoom(px, py) {
  if (ampliada()) { reiniciarZoom(true); return; }
  const b = baseZoom();
  zoom = limitar(zoomEn(ZOOM_TOQUE, px, py, b), b);
  aplicarZoom(true);
}

// Compu: clic para ampliar, arrastrar para moverse
let arrastreMouse = null;
lbImg.addEventListener("pointerdown", e => {
  if (e.pointerType !== "mouse" || e.button !== 0) return;
  e.preventDefault();
  arrastreMouse = { x: e.clientX, y: e.clientY, z: { ...zoom }, movio: false };
});
window.addEventListener("pointermove", e => {
  if (!arrastreMouse || !ampliada()) return;
  const dx = e.clientX - arrastreMouse.x, dy = e.clientY - arrastreMouse.y;
  if (Math.hypot(dx, dy) > 4) arrastreMouse.movio = true;
  zoom = limitar({ s: zoom.s, x: arrastreMouse.z.x + dx, y: arrastreMouse.z.y + dy }, baseZoom());
  aplicarZoom(false);
  lightbox.classList.add("moviendo");
});
window.addEventListener("pointerup", e => {
  if (!arrastreMouse) return;
  if (!arrastreMouse.movio && e.pointerType === "mouse") alternarZoom(e.clientX, e.clientY);
  arrastreMouse = null;
  lightbox.classList.remove("moviendo");
});
// Pellizcar en el trackpad (llega como rueda + Ctrl)
lightbox.addEventListener("wheel", e => {
  if (!e.ctrlKey || !visorAbierto()) return;
  e.preventDefault();
  const b = baseZoom();
  const s = Math.min(ZOOM_MAX, Math.max(1, zoom.s * Math.exp(-e.deltaY * 0.01)));
  zoom = limitar(zoomEn(s, e.clientX, e.clientY, b), b);
  aplicarZoom(false);
}, { passive: false });

/* ---------- Pasar de foto con animación (carrusel) ----------
   La foto actual se corre y la vecina entra desde el costado. En el celular
   sigue al dedo; en la compu lo hacen las flechas y el teclado. */
const SEPARACION = 24;                       // espacio entre una foto y la otra
let ladoVecina = 0;                          // 1 = la siguiente (a la derecha), -1 = la anterior

const indiceVecino = dir => (indiceActual + dir + fotosVisibles.length) % fotosVisibles.length;
const recorrido = () => window.innerWidth + SEPARACION;

// Ubica la foto vecina exactamente donde va a quedar cuando pase a ser la actual
// (así al terminar la animación no hay ningún salto, aunque cambie la proporción)
function prepararVecina(dir) {
  const foto = fotosVisibles[indiceVecino(dir)];
  const r = rectEnVisor(foto);
  const grande = normalizarRuta(foto.src);
  lbVecina.src = precargadas.has(grande) ? grande : rutaMiniatura(foto.src);
  Object.assign(lbVecina.style, {
    width: r.width + "px", height: r.height + "px",
    left: r.left + "px", top: r.top + "px",
    transition: "none",
    transform: `translateX(${dir * recorrido()}px)`,
  });
  lbVecina.hidden = false;
  ladoVecina = dir;
}

// Mueve las dos fotos según cuánto se arrastró (dx negativo = hacia la izquierda)
function arrastrarHorizontal(dx) {
  const dir = dx < 0 ? 1 : -1;
  if (dir !== ladoVecina) prepararVecina(dir);
  lbContenido.style.transition = "none";
  lbContenido.style.transform = `translateX(${dx}px)`;
  lbVecina.style.transform = `translateX(${dx + dir * recorrido()}px)`;
}

function animar(el, transform) {
  el.style.transition = `transform ${DURACION}ms ${CURVA}`;
  el.style.transform = transform;
}

// Termina el pase: la actual sale, la vecina queda en el centro y pasa a ser la actual
async function completarPase(dir) {
  animando = true;
  animar(lbContenido, `translateX(${-dir * recorrido()}px)`);
  animar(lbVecina, "translateX(0px)");
  await pausa(DURACION);
  if (!visorAbierto()) { animando = false; return; }
  indiceActual = indiceVecino(dir);
  mostrarFoto();
  actualizarDireccion();
  lbContenido.style.transition = "none";
  lbContenido.style.transform = "";
  lbContenido.classList.add("entrando");             // el texto aparece suave
  try { await lbImg.decode(); } catch { /* si falla, igual seguimos */ }
  lbVecina.hidden = true;                            // recién ahora: sin parpadeo
  ladoVecina = 0;
  requestAnimationFrame(() => lbContenido.classList.remove("entrando"));
  animando = false;
}

// No llegó a pasar: todo vuelve a su lugar
function cancelarPase() {
  if (!ladoVecina) return;
  animar(lbContenido, "translateX(0px)");
  animar(lbVecina, `translateX(${ladoVecina * recorrido()}px)`);
  const lado = ladoVecina;
  setTimeout(() => { if (ladoVecina === lado && !animando) { lbVecina.hidden = true; ladoVecina = 0; } }, DURACION);
}

// Flechas y teclado
function cambiar(dir) {
  if (animando || cerrando || fotosVisibles.length < 2) return;
  reiniciarZoom(false);
  if (sinMovimiento.matches) {                      // accesibilidad: sin animación
    indiceActual = indiceVecino(dir);
    mostrarFoto();
    actualizarDireccion();
    return;
  }
  prepararVecina(dir);
  lbVecina.getBoundingClientRect();                 // fija la posición inicial antes de animar
  completarPase(dir);
}

/* ---------- Gestos con el dedo ----------
   - izquierda/derecha → la foto sigue al dedo y entra la vecina
   - hacia abajo → la foto sigue al dedo y, al soltar, vuelve a la galería
   - pellizcar / tocar dos veces → zoom; con zoom, un dedo mueve la foto */
let modo = null;                                    // "gesto" | "mover" | "pellizco"
let toqueX = 0, toqueY = 0, toqueT = 0, direccion = null, bajada = 0, deslizado = 0;
let ultimoX = 0, ultimoT = 0, velocidad = 0;        // px/ms, para pases rápidos y cortos
let inicioZoom = null, ultimoToque = null;

function moverVisor(dy, animado) {
  const t = animado ? "0.25s ease" : "0s";
  lbContenido.style.transition = `transform ${t}`;
  lightbox.style.transition    = `background-color ${t}`;
  lbCerrar.style.transition    = `opacity ${t}`;
  // la foto baja con el dedo y se achica apenas (como en Fotos del iPhone)
  lbContenido.style.transform  = dy ? `translateY(${dy}px) scale(${Math.max(0.85, 1 - dy / 1200)})` : "";
  // el fondo se aclara y deja ver la galería; la X desaparece
  lightbox.style.backgroundColor = dy ? `rgba(20, 18, 15, ${Math.max(0, 1 - dy / 350)})` : "";
  lbCerrar.style.opacity = dy ? Math.max(0, 1 - dy / 60) : "";
}

const distancia = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const medio = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

function empezarMover(t) {
  modo = "mover";
  toqueX = t.clientX; toqueY = t.clientY;
  inicioZoom = { z: { ...zoom } };
}

lightbox.addEventListener("touchstart", e => {
  if (animando || cerrando || hojaAbierta()) return;   // con la hoja abierta, el dedo scrollea el texto
  if (e.touches.length === 2) {                      // empieza un pellizco: se deja cualquier otro gesto
    if (modo === "gesto" && direccion === "horizontal") cancelarPase();
    if (modo === "gesto" && direccion === "vertical") moverVisor(0, true);
    const [a, b] = e.touches;
    modo = "pellizco";
    inicioZoom = { d: distancia(a, b), m: medio(a, b), z: { ...zoom }, b: baseZoom() };
    return;
  }
  if (e.touches.length > 2 || e.target.closest("button")) return;  // tocar un botón no es un gesto
  const t = e.touches[0];
  toqueT = e.timeStamp;
  if (ampliada()) { empezarMover(t); return; }
  modo = "gesto";
  toqueX = ultimoX = t.clientX;
  toqueY = t.clientY;
  ultimoT = e.timeStamp;
  direccion = null;
  bajada = deslizado = velocidad = 0;
}, { passive: true });

lightbox.addEventListener("touchmove", e => {
  if (!modo) return;
  if (e.cancelable) e.preventDefault();               // que Safari no scrollee la página de atrás
  if (modo === "pellizco" && e.touches.length === 2) {
    const [a, b] = e.touches, m = medio(a, b);
    const s = Math.min(ZOOM_MAX * 1.15, Math.max(0.85, inicioZoom.z.s * distancia(a, b) / inicioZoom.d));
    const z = zoomEn(s, inicioZoom.m.x, inicioZoom.m.y, inicioZoom.b, inicioZoom.z);
    zoom = { s, x: z.x + (m.x - inicioZoom.m.x), y: z.y + (m.y - inicioZoom.m.y) };
    aplicarZoom(false);
    return;
  }
  const t = e.touches[0];
  if (modo === "ignorar") return;
  if (modo === "mover") {
    zoom = limitar({ s: zoom.s, x: inicioZoom.z.x + t.clientX - toqueX, y: inicioZoom.z.y + t.clientY - toqueY }, baseZoom());
    aplicarZoom(false);
    return;
  }
  if (modo !== "gesto") return;
  const x = t.clientX;
  const dx = x - toqueX;
  const dy = t.clientY - toqueY;
  if (!direccion && Math.hypot(dx, dy) > 10) direccion = Math.abs(dy) > Math.abs(dx) ? "vertical" : "horizontal";
  if (direccion === "vertical") {
    bajada = Math.max(0, dy);                         // solo hacia abajo
    moverVisor(bajada, false);
  } else if (direccion === "horizontal" && fotosVisibles.length > 1) {
    deslizado = dx;
    arrastrarHorizontal(dx);
    const dt = e.timeStamp - ultimoT;
    if (dt > 0) velocidad = 0.8 * ((x - ultimoX) / dt) + 0.2 * velocidad;
    ultimoX = x;
    ultimoT = e.timeStamp;
  }
}, { passive: false });

lightbox.addEventListener("touchend", e => {
  if (!modo) return;
  if (modo === "pellizco") {
    normalizarZoom(true);
    // levantó un dedo y la foto sigue ampliada: el otro dedo la mueve
    if (e.touches.length === 1 && ampliada()) empezarMover(e.touches[0]);
    else modo = e.touches.length ? "ignorar" : null;  // el dedo que queda no hace nada
    return;
  }
  if (modo === "ignorar") { if (!e.touches.length) modo = null; return; }
  const t = e.changedTouches[0];
  const toqueCorto = e.timeStamp - toqueT < 250 && Math.hypot(t.clientX - toqueX, t.clientY - toqueY) < 10;
  if (modo === "mover") {
    if (e.touches.length) return;                     // todavía queda un dedo apoyado
    modo = null;
    normalizarZoom(true);
    if (toqueCorto) dobleToque(t, e);
    return;
  }
  modo = null;
  if (toqueCorto) { dobleToque(t, e); direccion = null; return; }

  if (direccion === "horizontal" && ladoVecina) {
    // pasa si se arrastró más de un cuarto de pantalla, o si fue un deslizamiento rápido
    const rapido = Math.abs(velocidad) > 0.35 && Math.sign(velocidad) === Math.sign(deslizado);
    if (Math.abs(deslizado) > window.innerWidth * 0.25 || (rapido && Math.abs(deslizado) > 20)) {
      completarPase(deslizado < 0 ? 1 : -1);
    } else {
      cancelarPase();
    }
  } else if (direccion === "vertical") {
    if (bajada > 110) cerrarLightbox();               // vuelve volando a su lugar en la galería
    else moverVisor(0, true);                         // no llegó: vuelve a su lugar
  }
  direccion = null;
}, { passive: true });

// Dos toques rápidos sobre la foto: ampliar ahí (o volver a ver la foto entera)
function dobleToque(t, e) {
  const previo = ultimoToque;
  ultimoToque = { x: t.clientX, y: t.clientY, t: e.timeStamp };
  if (!previo || e.timeStamp - previo.t > 300 || Math.hypot(t.clientX - previo.x, t.clientY - previo.y) > 40) return;
  ultimoToque = null;
  if (ampliada() || e.target === lbImg) alternarZoom(t.clientX, t.clientY);
}

// Si el sistema interrumpe el gesto (llamada, notificación...), todo vuelve a su lugar
lightbox.addEventListener("touchcancel", () => {
  if (modo === "gesto" && direccion === "horizontal") cancelarPase();
  else if (modo === "gesto") moverVisor(0, true);
  else if (modo === "pellizco") { zoom = limitar(zoom, baseZoom()); aplicarZoom(true); }
  modo = direccion = null;
});

/* ---------- Volver arriba (aparece al bajar mucho por la galería) ---------- */
const botonArriba = document.getElementById("arriba");
let esperaScroll = null;
window.addEventListener("scroll", () => {
  if (esperaScroll) return;
  esperaScroll = requestAnimationFrame(() => {
    esperaScroll = null;
    const inicio = document.getElementById("galeria-sec").offsetTop;
    botonArriba.classList.toggle("visible", window.scrollY > inicio + window.innerHeight * 1.2);
  });
}, { passive: true });
botonArriba.addEventListener("click", () => {
  document.getElementById("galeria-sec").scrollIntoView({ behavior: sinMovimiento.matches ? "auto" : "smooth" });
});

/* ---------- 4. Menú del celular ---------- */
const navMenu  = document.getElementById("nav-menu");
const navLinks = document.getElementById("nav-links");

function menuAbierto(abierto) {
  navLinks.classList.toggle("abierto", abierto);
  navMenu.classList.toggle("abierto", abierto);
  navMenu.setAttribute("aria-expanded", abierto);
  navMenu.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
}
navMenu.addEventListener("click", () => menuAbierto(!navLinks.classList.contains("abierto")));
navLinks.addEventListener("click", e => { if (e.target.closest("a")) menuAbierto(false); });
document.addEventListener("click", e => { if (!e.target.closest(".nav")) menuAbierto(false); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && navLinks.classList.contains("abierto")) { menuAbierto(false); navMenu.focus(); }
});
