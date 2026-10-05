# 🚀 Publicar WildMilu en GitHub Pages (para Pablo)

El sitio ya no depende de Netlify: es HTML estático + un panel propio (`/admin`)
que guarda los cambios directo en GitHub. Se aloja **gratis** en GitHub Pages
en **https://wildmilu.github.io**.

---

## 1 · Crear la organización `wildmilu`

1. GitHub → **+** (arriba a la derecha) → **New organization** → plan **Free**.
2. **Organization name:** `wildmilu`.

## 2 · Pasar el repo a la organización

1. En el repo: **Settings → General → Danger Zone → Transfer ownership**.
2. **New owner:** `wildmilu`. Confirmá.

## 3 · Renombrar y hacer público el repo

1. Ya en `wildmilu/wildmilu`: **Settings → General → Repository name** →
   `wildmilu.github.io` → **Rename**.
2. **Danger Zone → Change repository visibility → Public**.
   (No hay nada privado: son las mismas fotos que ya se ven en la web, y la
   llave del panel NO está guardada en el repo.)

## 4 · Activar GitHub Pages

**Settings → Pages → Build and deployment**:
- **Source:** Deploy from a branch
- **Branch:** `main` · `/ (root)` → **Save**

En 1-2 minutos queda en **https://wildmilu.github.io**. Cada cambio en `main`
(tuyo o del panel de Mili) se publica solo en ~1 minuto.

> 💡 Tu clon local sigue funcionando (GitHub redirige), pero conviene
> actualizarlo: `git remote set-url origin https://github.com/wildmilu/wildmilu.github.io.git`

---

## 🔑 Crear la llave del panel (una vez por año, aprox.)

El panel usa un *token* de GitHub con permiso **solo sobre este repo**.
Mili no necesita cuenta de GitHub: usa la llave que vos le pasás.

1. GitHub → tu foto → **Settings → Developer settings → Personal access tokens
   → Fine-grained tokens → Generate new token**.
2. **Token name:** `WildMilu panel`
3. **Expiration:** la más larga disponible (anotá cuándo vence 📅).
4. **Resource owner:** `wildmilu` (la organización, no tu usuario).
   **Repository access:** *Only select repositories* → `wildmilu.github.io`.
5. **Permissions → Repository permissions → Contents: Read and write**.
   (Nada más. "Metadata: Read" se agrega solo.)
   > Si al generarla dice que queda *pendiente de aprobación*, aprobala vos mismo
   > en la organización: **Settings → Personal access tokens → Pending requests**.
6. **Generate token** y copiá la llave (empieza con `github_pat_`).
7. Abrí **https://wildmilu.github.io/admin** en el celu/compu de Mili, pegá la llave,
   dejá tildado "Recordarme" y entrá. Listo: no la tiene que volver a poner.

> 🔒 Si la llave se pierde o se filtra: borrala en GitHub (mismo lugar) y creá
> otra. Solo da acceso a este repo, nada más de tu cuenta.
>
> ⏰ Cuando venza, el panel va a decir "La llave no es válida o venció":
> generá una nueva y volvé a cargarla.

---

## 🌐 Dominio propio (opcional, ~USD 10/año)

Si algún día comprás `wildmilu.com`: **Settings → Pages → Custom domain**.
No hay que tocar código (el sitio usa rutas relativas).

---

## 🧹 Dar de baja Netlify

Cuando el sitio nuevo ande (y probaste el panel), en https://app.netlify.com:
**Site configuration → Delete this site**. Si tenías dominio apuntando a
Netlify, cambiá los DNS antes.

---

## 📊 Estadísticas de visitas (GoatCounter)

El sitio ya trae el código de GoatCounter (gratis, sin cookies). Para ver los
números hay que crear la cuenta **una sola vez**:

1. Entrá a https://www.goatcounter.com/signup
2. **Code:** `wildmilu` (tiene que ser exactamente ese: el sitio manda las
   visitas a `wildmilu.goatcounter.com`).
3. Completá email y contraseña → listo.
4. Las visitas se ven en **https://wildmilu.goatcounter.com**. Podés invitar a
   Mili desde *Settings → Users*.

---

## ⚙️ Publicación automática (GitHub Actions) — activar una vez

Cada cambio en `main` lo publica el proceso `.github/workflows/publicar.yml`,
que además arma una página por foto (para que al compartirla se vea ESA foto
en WhatsApp/Instagram) y el `sitemap.xml` para Google.

**Activarlo:** Settings → Pages → Build and deployment → **Source: GitHub Actions**.
Después: pestaña **Actions** → "Publicar sitio" → **Run workflow** (o esperá al
próximo cambio). Si algo falla, ahí mismo se ve el error en rojo.

## 🔎 Aparecer en Google (Search Console) — una vez

1. Entrá a https://search.google.com/search-console → **Agregar propiedad**
   → **Prefijo de URL** → `https://wildmilu.github.io/`.
2. Verificación: elegí **Etiqueta HTML**. Copiá el código del `content="..."`
   y agregalo en `index.html` (o pedíselo a Claude), publicá y tocá **Verificar**.
3. En **Sitemaps** cargá `sitemap.xml` → Enviar.
4. Google tarda de días a un par de semanas en mostrar el sitio en las búsquedas.

---

## 🧪 Sitio de prueba (antes de tocar el sitio real)

| | Rama | Dirección |
|---|---|---|
| **Sitio real** (lo que ve la gente) | `main` | https://wildmilu.github.io |
| **Sitio de prueba** | `dev` | https://wildmilu.github.io/lab-t8wjo9y/ |

- El de prueba tiene una franja naranja "SITIO DE PRUEBA", Google no lo indexa
  y no cuenta visitas. La dirección es difícil de adivinar a propósito
  (no la compartas públicamente).
- Su panel (`/lab-t8wjo9y/admin/`) guarda en la rama `dev`: podés probar subir,
  borrar o reordenar sin tocar el sitio real. Usa la misma llave.
- **Cómo se trabaja:** los cambios se hacen en `dev` → se prueban en el sitio de
  prueba → cuando están OK se pasan a `main` (pull request de `dev` a `main`).
- Antes de empezar algo nuevo, conviene traer a `dev` lo último de `main`
  (por ejemplo, las fotos que haya publicado Mili).
- Si el sitio de prueba tiene un error, el real se publica igual.
