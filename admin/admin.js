/* =====================================================================
   WildMilu · PANEL DE MILAGROS
   ---------------------------------------------------------------------
   Reemplaza a Decap CMS + Netlify Identity. Habla directo con la API de
   GitHub usando una "llave" (token fine-grained con permiso solo sobre
   este repo). Cada vez que se publica, hace UN commit con fotos.json y
   las imágenes nuevas; el hosting (GitHub Pages / Cloudflare Pages)
   redeploya solo.

   Las fotos se achican en el navegador antes de subirlas, así el sitio
   no crece con archivos de 5 MB recién salidos de la cámara.
   ===================================================================== */

const CONFIG = {
  owner: "wildmilu",
  repo: "wildmilu.github.io",
  // El panel del sitio de prueba (/lab-t8wjo9y/admin) guarda en la rama "dev"; el real, en "main"
  branch: location.pathname.startsWith("/lab-t8wjo9y/") ? "dev" : "main",
  archivoDatos: "fotos.json",
  archivoSitio: "sitio.json",   // texto y foto de "Sobre Milagros"
  carpetaImagenes: "images",
  maxLado: 2000,      // px del lado más largo al achicar
  anchoMiniatura: 800, // px de ancho de la miniatura de la galería
  calidad: 0.85,      // calidad JPEG (0 a 1)
};

// Clases de animales (el filtro de la galería). Si agregás una, sumala también en js/main.js
const CATEGORIAS = ["Aves", "Mamíferos", "Reptiles", "Anfibios", "Peces", "Invertebrados"];
const CLAVE_TOKEN = "wildmilu-token";
const API = "https://api.github.com";

/* ---------- Estado ---------- */
let token = "";
let fotos = [];               // lo que se ve en el panel (con cambios)
let fotosPublicadas = [];     // copia de lo último publicado (para "Descartar")
let commitBase = "";          // commit sobre el que se cargó fotos.json
let shaDatos = "";            // sha de fotos.json en ese commit
let sitio = null;             // { sobre: { foto, texto } } con cambios
let sitioPublicado = null;    // copia de lo último publicado
let shaSitio = "";            // sha de sitio.json ("" si todavía no existe)
let imagenesNuevas = new Map();   // ruta → { base64, miniatura } (pendientes de subir; miniatura null = sin miniatura)
let vistasPrevias = new Map();    // ruta → objectURL (para ver fotos aún no desplegadas)
let cambios = [];             // descripciones para el mensaje del commit
let editando = -1;            // índice en edición (-1 = nueva)
let imagenElegida = null;     // { base64, url, nombre } en el formulario

const $ = id => document.getElementById(id);

/* =====================================================================
   API de GitHub
   ===================================================================== */
async function gh(ruta, { method = "GET", body } = {}) {
  const res = await fetch(API + ruta, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = new Error(`GitHub respondió ${res.status}`);
    err.status = res.status;
    err.esperar = Number(res.headers.get("retry-after")) || 0;
    try { err.detalle = (await res.json()).message; } catch {}
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const repo = () => `/repos/${CONFIG.owner}/${CONFIG.repo}`;

function base64ATexto(b64) {
  const bytes = Uint8Array.from(atob(b64.replace(/\n/g, "")), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function leerArchivo(ruta, commit) {
  try {
    const archivo = await gh(`${repo()}/contents/${ruta}?ref=${commit}`);
    return { sha: archivo.sha, datos: JSON.parse(base64ATexto(archivo.content)) };
  } catch (err) {
    if (err.status === 404 && ruta === CONFIG.archivoSitio) return { sha: "", datos: null };  // todavía no existe
    throw err;
  }
}

// Texto de respaldo si sitio.json no existe (el mismo que trae index.html)
const SITIO_INICIAL = { sobre: { foto: "images/Perfil.jpeg", texto: "" } };

async function cargar() {
  const ref = await gh(`${repo()}/git/ref/heads/${CONFIG.branch}`);
  const [datos, datosSitio] = await Promise.all([
    leerArchivo(CONFIG.archivoDatos, ref.object.sha),
    leerArchivo(CONFIG.archivoSitio, ref.object.sha),
  ]);
  commitBase = ref.object.sha;
  shaDatos = datos.sha;
  shaSitio = datosSitio.sha;
  fotosPublicadas = (datos.datos.fotos || []).filter(f => f && f.src);
  fotos = structuredClone(fotosPublicadas);
  sitioPublicado = datosSitio.datos || structuredClone(SITIO_INICIAL);
  sitio = structuredClone(sitioPublicado);
  imagenesNuevas.clear();
  cambios = [];
  render();
}

/* GitHub limita cuántos archivos se pueden crear por minuto (~80).
   Con muchas fotos subimos a un ritmo seguro y, si igual pide esperar, esperamos. */
const pausa = ms => new Promise(r => setTimeout(r, ms));
let ultimaSubida = 0;
async function subirArchivo(base64) {
  for (let intento = 1; ; intento++) {
    const espera = ultimaSubida + 900 - Date.now();   // ~65 por minuto
    if (espera > 0) await pausa(espera);
    ultimaSubida = Date.now();
    try {
      return await gh(`${repo()}/git/blobs`, { method: "POST", body: { content: base64, encoding: "base64" } });
    } catch (err) {
      const limite = err.status === 429 || (err.status === 403 && /rate limit/i.test(err.detalle || ""));
      if (!limite || intento >= 4) throw err;
      await pausa((err.esperar || 60) * 1000);
    }
  }
}

/* Un solo commit con fotos.json + imágenes nuevas */
async function publicar(progreso = () => {}) {
  const ref = await gh(`${repo()}/git/ref/heads/${CONFIG.branch}`);
  const cabeza = ref.object.sha;

  // Si alguien publicó desde otro dispositivo, no pisamos sus cambios.
  if (cabeza !== commitBase) {
    const [d, ds] = await Promise.all([leerArchivo(CONFIG.archivoDatos, cabeza), leerArchivo(CONFIG.archivoSitio, cabeza)]);
    if (d.sha !== shaDatos || ds.sha !== shaSitio) {
      const err = new Error("conflicto");
      err.conflicto = true;
      throw err;
    }
  }

  const commit = await gh(`${repo()}/git/commits/${cabeza}`);
  const arbol = [];

  const usadas = new Set([...fotos.map(f => rutaRepo(f.src)), rutaRepo(sitio.sobre.foto)]);
  const archivos = [];
  for (const [ruta, imagen] of imagenesNuevas) {
    if (!usadas.has(ruta)) continue;  // se agregó y se reemplazó/borró antes de publicar
    // la foto grande (para el visor) y su miniatura (para la grilla)
    archivos.push([ruta, imagen.base64]);
    if (imagen.miniatura) archivos.push([rutaMiniatura(ruta), imagen.miniatura]);
  }
  for (const [n, [destino, base64]] of archivos.entries()) {
    progreso(n + 1, archivos.length);
    const blob = await subirArchivo(base64);
    arbol.push({ path: destino, mode: "100644", type: "blob", sha: blob.sha });
  }

  // Las imágenes de fotos borradas NO se eliminan del repo: alguna puede
  // estar usada en otra parte del sitio (ej: la de "Sobre Milagros").

  arbol.push({
    path: CONFIG.archivoDatos, mode: "100644", type: "blob",
    content: JSON.stringify({ fotos }, null, 2) + "\n",
  });
  if (JSON.stringify(sitio) !== JSON.stringify(sitioPublicado)) {
    arbol.push({
      path: CONFIG.archivoSitio, mode: "100644", type: "blob",
      content: JSON.stringify(sitio, null, 2) + "\n",
    });
  }

  const nuevoArbol = await gh(`${repo()}/git/trees`, { method: "POST", body: { base_tree: commit.tree.sha, tree: arbol } });
  const mensaje = cambios.length === 1 ? cambios[0] : `Actualizar galería (${cambios.length} cambios)\n\n- ` + cambios.join("\n- ");
  const nuevo = await gh(`${repo()}/git/commits`, { method: "POST", body: { message: mensaje, tree: nuevoArbol.sha, parents: [cabeza] } });
  await gh(`${repo()}/git/refs/heads/${CONFIG.branch}`, { method: "PATCH", body: { sha: nuevo.sha } });

  await cargar();
}

/* =====================================================================
   Imágenes
   ===================================================================== */
function rutaRepo(src) {
  return String(src || "").trim().replace(/^\/+/, "");
}

/* images/x.jpg → images/thumbs/x.jpg (misma convención que js/main.js) */
function rutaMiniatura(ruta) {
  return ruta.replace(/^images\//, "images/thumbs/");
}

function urlMiniatura(src) {
  const ruta = rutaRepo(src);
  if (/^https?:\/\//i.test(src)) return src;
  return vistasPrevias.get(ruta) || "../" + rutaMiniatura(ruta);
}

/* Dibuja la imagen a cierto tamaño y la devuelve como JPEG (Blob) */
function aJpeg(img, ancho, alto) {
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext("2d").drawImage(img, 0, 0, ancho, alto);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo convertir la imagen")), "image/jpeg", CONFIG.calidad));
}

function aBase64(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result.split(",")[1]);
    lector.onerror = reject;
    lector.readAsDataURL(blob);
  });
}

function cargarImagen(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("formato")); };
    img.src = url;
  });
}

/* Achica la foto (lado mayor ≤ maxLado), la pasa a JPEG y arma su miniatura */
async function procesarImagen(archivo) {
  const img = await cargarImagen(archivo);
  const w = img.naturalWidth, h = img.naturalHeight;

  const escala = Math.min(1, CONFIG.maxLado / Math.max(w, h));
  const ancho = Math.round(w * escala), alto = Math.round(h * escala);
  let blob = await aJpeg(img, ancho, alto);
  // Si ya era un JPEG chico, recomprimirlo solo lo empeora: va el original.
  if (escala === 1 && archivo.type === "image/jpeg" && archivo.size <= blob.size) blob = archivo;

  // color promedio: la galería lo muestra de fondo mientras la foto carga
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 1;
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(img, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const color = "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");

  const escalaMini = Math.min(1, CONFIG.anchoMiniatura / w);
  const mini = await aJpeg(img, Math.round(w * escalaMini), Math.round(h * escalaMini));

  return {
    base64: await aBase64(blob),
    miniatura: await aBase64(mini),
    url: URL.createObjectURL(blob),
    peso: blob.size,
    ancho,
    alto,
    color,
  };
}

function slug(texto) {
  return (texto || "foto").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "foto";
}

function rutaNueva(titulo, reservadas = []) {
  const existentes = new Set([...fotos.map(f => rutaRepo(f.src)), ...imagenesNuevas.keys(), ...reservadas]);
  const base = `${CONFIG.carpetaImagenes}/${slug(titulo)}`;
  let ruta = `${base}.jpg`, n = 2;
  while (existentes.has(ruta)) ruta = `${base}-${n++}.jpg`;
  return ruta;
}

/* =====================================================================
   Interfaz
   ===================================================================== */
function aviso(texto, esError = false, fijo = false) {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.toggle("error-aviso", esError);
  el.hidden = false;
  clearTimeout(aviso.t);
  if (!fijo) aviso.t = setTimeout(() => (el.hidden = true), esError ? 8000 : 5000);
}

function boton(texto, titulo, clase, accion) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn--icono " + clase;
  b.textContent = texto;
  b.title = titulo;
  b.setAttribute("aria-label", titulo);
  b.addEventListener("click", accion);
  return b;
}

function sinAcentos(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function render() {
  renderSobre();
  const lista = $("lista");
  lista.innerHTML = "";
  $("contador").textContent = `(${fotos.length})`;

  const busqueda = sinAcentos($("buscar").value.trim());
  const buscando = busqueda.length > 0;
  lista.classList.toggle("buscando", buscando);
  $("ayuda-orden").hidden = buscando || fotos.length < 2;
  if (ordenable) ordenable.option("disabled", buscando);   // con búsqueda activa no se reordena
  let visibles = 0;

  fotos.forEach((foto, i) => {
    if (buscando) {
      const textoFoto = sinAcentos([foto.titulo, foto.especie, foto.lugar, foto.categoria, foto.fecha].join(" "));
      if (!textoFoto.includes(busqueda)) return;
    }
    visibles++;
    const li = document.createElement("li");
    li.className = "item";

    const asa = document.createElement("span");
    asa.className = "item__asa";
    asa.textContent = "⠿";
    asa.title = "Arrastrá para cambiar el orden";
    asa.setAttribute("aria-hidden", "true");

    const img = document.createElement("img");
    img.src = urlMiniatura(foto.src);
    img.onerror = () => { img.onerror = null; img.src = "../" + rutaRepo(foto.src); };  // sin miniatura: la grande
    img.alt = "";
    img.loading = "lazy";

    const texto = document.createElement("div");
    texto.className = "item__texto";
    const titulo = document.createElement("div");
    titulo.className = "item__titulo";
    titulo.textContent = foto.titulo || "(sin título)";
    if (imagenesNuevas.has(rutaRepo(foto.src))) {
      const et = document.createElement("span");
      et.className = "etiqueta";
      et.textContent = "nueva";
      titulo.appendChild(et);
    }
    const meta = document.createElement("div");
    meta.className = "item__meta";
    meta.textContent = [foto.categoria, foto.especie].filter(Boolean).join(" · ");
    const faltan = [!foto.titulo && "título", !foto.lugar && "lugar", !foto.fecha && "fecha"].filter(Boolean);
    if (faltan.length) {
      const falta = document.createElement("span");
      falta.className = "falta";
      falta.textContent = `· falta ${faltan.join(", ").replace(/, ([^,]*)$/, " y $1")}`;
      meta.appendChild(falta);
    }
    texto.append(titulo, meta);

    const acciones = document.createElement("div");
    acciones.className = "item__acciones";
    const subir = boton("↑", "Subir", "btn--suave", () => mover(i, -1));
    const bajar = boton("↓", "Bajar", "btn--suave", () => mover(i, 1));
    subir.disabled = i === 0;
    bajar.disabled = i === fotos.length - 1;
    acciones.append(
      subir, bajar,
      boton("Editar", "Editar", "btn--suave", () => abrirFormulario(i)),
      boton("Borrar", "Borrar", "btn--peligro", () => borrar(i)),
    );

    li.append(asa, img, texto, acciones);
    lista.appendChild(li);
  });
  $("sin-resultados").hidden = !buscando || visibles > 0;

  $("pendientes").hidden = cambios.length === 0;
  $("pendientes-texto").textContent = cambios.length === 1
    ? "Tenés 1 cambio sin publicar"
    : `Tenés ${cambios.length} cambios sin publicar`;
}

function mover(i, dir) {
  const j = i + dir;
  [fotos[i], fotos[j]] = [fotos[j], fotos[i]];
  cambios.push(`Reordenar "${fotos[j].titulo}"`);
  render();
}

function borrar(i) {
  if (!confirm(`¿Borrar "${fotos[i].titulo}"? (se borra al publicar)`)) return;
  const [foto] = fotos.splice(i, 1);
  cambios.push(`Eliminar foto "${foto.titulo}"`);
  render();
}

/* ---------- Formulario ---------- */
function abrirFormulario(i = -1) {
  editando = i;
  imagenElegida = null;
  const foto = i >= 0 ? fotos[i] : { titulo: "", especie: "", categoria: "Aves", lugar: "", fecha: "", descripcion: "" };

  $("dialogo-titulo").textContent = i >= 0 ? "Editar foto" : "Agregar foto";
  $("archivo-label").textContent = i >= 0 ? "Cambiar foto" : "Elegir foto";
  $("archivo").value = "";
  $("archivo-info").textContent = "";
  $("form-error").hidden = true;
  $("vista-previa").hidden = i < 0;
  if (i >= 0) $("vista-previa").src = urlMiniatura(foto.src);

  $("f-titulo").value = foto.titulo || "";
  $("f-especie").value = foto.especie || "";
  $("f-categoria").value = CATEGORIAS.includes(foto.categoria) ? foto.categoria : "Aves";
  $("f-lugar").value = foto.lugar || "";
  $("f-fecha").value = foto.fecha || "";
  $("f-descripcion").value = foto.descripcion || "";

  $("dialogo").showModal();
}

async function alElegirArchivo() {
  const archivo = $("archivo").files[0];
  if (!archivo) return;
  $("archivo-info").textContent = "Preparando la foto…";
  $("btn-guardar").disabled = true;
  try {
    imagenElegida = await procesarImagen(archivo);
    $("vista-previa").src = imagenElegida.url;
    $("vista-previa").hidden = false;
    const mb = (archivo.size / 1048576).toFixed(1);
    const kb = Math.round(imagenElegida.peso / 1024);
    $("archivo-info").textContent = `Lista ✓ ${imagenElegida.ancho}×${imagenElegida.alto}px · ${mb} MB → ${kb} KB`;
    if (!$("f-titulo").value) $("f-titulo").value = archivo.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  } catch {
    imagenElegida = null;
    $("archivo-info").textContent = "No se pudo leer esta foto. Probá con JPG o PNG.";
  } finally {
    $("btn-guardar").disabled = false;
  }
}

function guardarFormulario(e) {
  e.preventDefault();
  const titulo = $("f-titulo").value.trim();
  if (editando < 0 && !imagenElegida) {
    $("form-error").textContent = "Falta elegir la foto.";
    $("form-error").hidden = false;
    return;
  }
  if (!titulo) {
    $("form-error").textContent = "Falta el título.";
    $("form-error").hidden = false;
    return;
  }

  const anterior = editando >= 0 ? fotos[editando] : {};
  const datos = {
    src: anterior.src || "",
    titulo,
    especie: $("f-especie").value.trim(),
    categoria: $("f-categoria").value,
    lugar: $("f-lugar").value.trim(),
    fecha: $("f-fecha").value.trim(),
    descripcion: $("f-descripcion").value.trim(),
  };

  // Tamaño de la foto: la galería lo usa para reservar el lugar y que nada salte al cargar
  if (anterior.ancho && anterior.alto) { datos.ancho = anterior.ancho; datos.alto = anterior.alto; }
  if (anterior.color) datos.color = anterior.color;

  if (imagenElegida) {
    const ruta = rutaNueva(titulo);
    imagenesNuevas.set(ruta, { base64: imagenElegida.base64, miniatura: imagenElegida.miniatura });
    vistasPrevias.set(ruta, imagenElegida.url);
    datos.src = ruta;
    datos.ancho = imagenElegida.ancho;
    datos.alto = imagenElegida.alto;
    datos.color = imagenElegida.color;
  }

  if (editando >= 0) {
    fotos[editando] = datos;
    cambios.push(`Editar foto "${titulo}"`);
  } else {
    fotos.unshift(datos);   // las nuevas aparecen primero en la galería
    cambios.push(`Agregar foto "${titulo}"`);
  }

  $("dialogo").close();
  render();
}

/* ---------- Reordenar arrastrando (SortableJS) ---------- */
let ordenable = null;
if (window.Sortable) {
  ordenable = Sortable.create($("lista"), {
    handle: ".item__asa",
    animation: 150,
    ghostClass: "item--fantasma",
    chosenClass: "item--arrastrando",
    scroll: true,
    bubbleScroll: true,
    onEnd: ({ oldIndex, newIndex }) => {
      if (oldIndex === newIndex) return;
      const [foto] = fotos.splice(oldIndex, 1);
      fotos.splice(newIndex, 0, foto);
      cambios.push(`Reordenar "${foto.titulo || "foto"}"`);
      render();
    },
  });
}

/* ---------- Agregar varias fotos de una vez ---------- */
// Nombres automáticos de cámaras y celulares: no sirven como título
const NOMBRES_AUTOMATICOS = /^(img|dsc|dscn|dscf|dcim|pxl|mvimg|photo|image|imagen|foto|captura|screenshot|whatsapp|wa|edit|edited|copia|copy|final)$/i;

function tituloDesdeArchivo(nombre) {
  const palabras = nombre.replace(/\.[^.]+$/, "").split(/[-_\s.]+/)
    .filter(p => p && !/\d/.test(p) && !NOMBRES_AUTOMATICOS.test(p));
  const t = palabras.join(" ");
  return /[a-záéíóúñ]{3,}/i.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : "";  // "IMG_1234" → sin título
}

async function agregarVarias() {
  const elegidos = [...$("archivos-varios").files];
  $("archivos-varios").value = "";
  if (!elegidos.length) return;
  const nuevas = [], fallaron = [];
  for (const [n, archivo] of elegidos.entries()) {
    aviso(`Preparando ${n + 1} de ${elegidos.length}…`, false, true);
    try {
      const imagen = await procesarImagen(archivo);
      const titulo = tituloDesdeArchivo(archivo.name);
      const ruta = rutaNueva(titulo || archivo.name.replace(/\.[^.]+$/, ""), nuevas.map(f => f.src));
      imagenesNuevas.set(ruta, { base64: imagen.base64, miniatura: imagen.miniatura });
      vistasPrevias.set(ruta, imagen.url);
      nuevas.push({ src: ruta, titulo, especie: "", categoria: "Aves", lugar: "", fecha: "", descripcion: "",
                    ancho: imagen.ancho, alto: imagen.alto, color: imagen.color });
      cambios.push(`Agregar foto "${titulo || archivo.name}"`);
    } catch {
      fallaron.push(archivo.name);
    }
  }
  fotos.unshift(...nuevas);   // quedan primeras, en el orden en que se eligieron
  render();
  aviso(fallaron.length
    ? `Se agregaron ${nuevas.length}. No se pudieron leer: ${fallaron.join(", ")} (probá con JPG o PNG).`
    : `Se agregaron ${nuevas.length} fotos. Completá sus datos con "Editar" y después tocá Publicar.`, fallaron.length > 0);
}

/* ---------- Editor de "Sobre Milagros" ---------- */
let perfilElegido = null;     // foto nueva elegida en el editor (procesada)

function renderSobre() {
  $("sobre-miniatura").src = urlMiniatura(sitio.sobre.foto);
  $("sobre-miniatura").onerror = function () { this.onerror = null; this.src = "../" + rutaRepo(sitio.sobre.foto); };
  const texto = (sitio.sobre.texto || "").trim();
  $("sobre-resumen").textContent = texto ? texto.split(/\n/)[0] : "(usa el texto original del sitio)";
}

function abrirSobre() {
  perfilElegido = null;
  $("perfil-archivo").value = "";
  $("perfil-info").textContent = "";
  $("perfil-previa").src = vistasPrevias.get(rutaRepo(sitio.sobre.foto)) || "../" + rutaRepo(sitio.sobre.foto);
  $("perfil-texto").value = sitio.sobre.texto || "";
  $("dialogo-sobre").showModal();
}

async function alElegirPerfil() {
  const archivo = $("perfil-archivo").files[0];
  if (!archivo) return;
  $("perfil-info").textContent = "Preparando la foto…";
  $("btn-guardar-sobre").disabled = true;
  try {
    perfilElegido = await procesarImagen(archivo);
    $("perfil-previa").src = perfilElegido.url;
    $("perfil-info").textContent = `Lista ✓ ${perfilElegido.ancho}×${perfilElegido.alto}px · ${Math.round(perfilElegido.peso / 1024)} KB`;
  } catch {
    perfilElegido = null;
    $("perfil-info").textContent = "No se pudo leer esta foto. Probá con JPG o PNG.";
  } finally {
    $("btn-guardar-sobre").disabled = false;
  }
}

function guardarSobre(e) {
  e.preventDefault();
  const texto = $("perfil-texto").value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const nuevo = structuredClone(sitio);
  nuevo.sobre.texto = texto;
  if (perfilElegido) {
    // nombre nuevo cada vez: así nadie ve la foto vieja guardada en caché
    const ruta = `${CONFIG.carpetaImagenes}/perfil-${Date.now().toString(36)}.jpg`;
    imagenesNuevas.set(ruta, { base64: perfilElegido.base64, miniatura: null });
    vistasPrevias.set(ruta, perfilElegido.url);
    nuevo.sobre.foto = ruta;
  }
  if (JSON.stringify(nuevo) !== JSON.stringify(sitio)) {
    sitio = nuevo;
    cambios.push(perfilElegido ? 'Actualizar "Sobre Milagros" (foto y texto)' : 'Actualizar texto de "Sobre Milagros"');
  }
  $("dialogo-sobre").close();
  render();
}

/* ---------- Login / sesión ---------- */
function mostrar(vista) {
  $("vista-login").hidden = vista !== "login";
  $("vista-panel").hidden = vista !== "panel";
}

function mensajeError(err) {
  if (err.status === 401) return "La llave no es válida o venció. Pedile una nueva a Pablo.";
  if (err.status === 403 || err.status === 404) return "La llave no tiene permiso sobre el repositorio.";
  if (err.conflicto) return "Hubo cambios desde otro dispositivo. Recargá la página y volvé a hacer tus cambios.";
  if (err instanceof TypeError) return "Sin conexión. Revisá internet y probá de nuevo.";
  return "Algo salió mal: " + (err.detalle || err.message);
}

async function entrar(t, recordar) {
  token = t;
  try {
    await cargar();
    try { recordar ? localStorage.setItem(CLAVE_TOKEN, t) : localStorage.removeItem(CLAVE_TOKEN); } catch {}
    mostrar("panel");
  } catch (err) {
    token = "";
    try { localStorage.removeItem(CLAVE_TOKEN); } catch {}
    mostrar("login");
    $("login-error").textContent = mensajeError(err);
    $("login-error").hidden = false;
  }
}

/* ---------- Eventos ---------- */
$("f-categoria").innerHTML = CATEGORIAS.map(c => `<option>${c}</option>`).join("");

$("form-login").addEventListener("submit", e => {
  e.preventDefault();
  $("login-error").hidden = true;
  entrar($("token").value.trim(), $("recordar").checked);
});

$("btn-salir").addEventListener("click", () => {
  if (cambios.length && !confirm("Tenés cambios sin publicar. ¿Salir igual?")) return;
  try { localStorage.removeItem(CLAVE_TOKEN); } catch {}
  location.reload();
});

$("btn-agregar").addEventListener("click", () => abrirFormulario());
$("archivos-varios").addEventListener("change", agregarVarias);
$("buscar").addEventListener("input", render);
$("btn-editar-sobre").addEventListener("click", abrirSobre);
$("btn-cancelar-sobre").addEventListener("click", () => $("dialogo-sobre").close());
$("perfil-archivo").addEventListener("change", alElegirPerfil);
$("form-sobre").addEventListener("submit", guardarSobre);
$("btn-cancelar").addEventListener("click", () => $("dialogo").close());
$("archivo").addEventListener("change", alElegirArchivo);
$("form-foto").addEventListener("submit", guardarFormulario);

$("btn-descartar").addEventListener("click", () => {
  if (!confirm("¿Descartar todos los cambios sin publicar?")) return;
  fotos = structuredClone(fotosPublicadas);
  sitio = structuredClone(sitioPublicado);
  imagenesNuevas.clear();
  cambios = [];
  render();
});

$("btn-publicar").addEventListener("click", async () => {
  const btn = $("btn-publicar");
  btn.disabled = true;
  btn.textContent = "Publicando…";
  try {
    await publicar((n, total) => {
      btn.textContent = `Subiendo ${n} de ${total}…`;
      if (total > 10) aviso(`Subiendo fotos: ${n} de ${total}. No cierres esta página.`, false, true);
    });
    aviso("¡Publicado! 🎉 En 1-2 minutos se ve en la web.");
  } catch (err) {
    aviso(mensajeError(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Publicar";
  }
});

window.addEventListener("beforeunload", e => {
  if (cambios.length) { e.preventDefault(); e.returnValue = ""; }
});

/* ---------- Inicio ---------- */
let guardado = null;
try { guardado = localStorage.getItem(CLAVE_TOKEN); } catch {}
if (guardado) entrar(guardado, true);
else mostrar("login");
