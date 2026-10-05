# 🐦 WildMilu — Fotografía de naturaleza de Milagros

Sitio web estático + panel propio para que Milagros cargue fotos sola.
Sin servidores ni servicios pagos: se aloja gratis en GitHub Pages
→ https://wildmilu.github.io

## 📂 Estructura
```
wildmilu/
├── index.html          → la página principal
├── fotos.json          → 👈 los datos de las fotos (los edita el panel)
├── sitio.json          → texto y foto de "Sobre Milagros" (también desde el panel)
├── css/styles.css      → estilos (colores/tipografías en :root)
├── js/main.js          → lógica: lee fotos.json y arma la galería
├── images/             → las fotos (las grandes, para el visor)
│   └── thumbs/         → miniaturas de 800px para la grilla (las arma el panel)
├── admin/              → 🔐 el panel de Milagros
│   ├── index.html
│   ├── admin.js        → habla con la API de GitHub y achica las fotos
│   └── admin.css
├── scripts/generar.py  → arma la versión publicada: página por foto (vista previa) + sitemap
├── .github/workflows/  → publica solo en GitHub Pages: sitio real (main) + sitio de prueba (dev)
├── 404.html
├── PUBLICAR.md         → 🚀 para vos: hosting gratis + crear la llave del panel
├── GUIA-MILAGROS.md    → 🐦 guía simple para que Mili suba fotos
└── README.md           → este archivo
```

## ⚙️ Cómo funciona
- La web lee **`fotos.json`** y arma la galería sola.
- El panel `/admin` edita `fotos.json` y sube las fotos **directo al repo de
  GitHub** (un commit por cada "Publicar"). El hosting detecta el cambio y
  republica en ~1 minuto.
- Antes de subir, el panel **achica cada foto** (máx. 2000px, JPEG) para que la
  web cargue rápido aunque Mili suba fotos de 5 MB de la cámara.
- El acceso al panel es con una llave (token de GitHub con permiso solo sobre
  este repo). Ver **PUBLICAR.md**.

## ▶️ Verlo local
Como usa `fetch`, hay que servirlo (no abrir con doble clic):
```bash
cd wildmilu
python -m http.server 8000
```
Y entrá a http://localhost:8000 (el panel en http://localhost:8000/admin/).

## ➕ Agregar fotos
- **Milagros:** desde el panel → ver **GUIA-MILAGROS.md**.
- **A mano (vos):** editás `fotos.json`, copiás la imagen a `images/` (y una
  versión de 800px de ancho con el mismo nombre a `images/thumbs/`) y `git push`.
  Si falta la miniatura, la galería usa la foto grande.

**Clases (filtro de la galería):** Aves · Mamíferos · Reptiles · Anfibios · Peces · Invertebrados
(se cambian en `admin/admin.js` → `CATEGORIAS` y en `js/main.js` → `CLASES`).
La galería solo muestra los filtros de las clases que tienen fotos.

## 🎨 Personalizar
Colores/tipografías: `:root` al inicio de `css/styles.css`.
Textos (hero, "Sobre Milagros"): en `index.html`.

Hecho con cariño para sorprender a Milagros. 💚
