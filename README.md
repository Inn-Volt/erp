# InnVolt ERP — Cotizador

Sistema de cotizaciones profesional para proyectos eléctricos.  
Stack: **Next.js 15** · **TypeScript** · **TailwindCSS** · **Supabase** · **Netlify**

---

## Características

- ✅ Autenticación con Supabase Auth
- ✅ Dashboard con KPIs en tiempo real
- ✅ CRUD completo de clientes
- ✅ Cotizador con ítems dinámicos (material, mano de obra, servicio)
- ✅ Cálculo automático de IVA, márgenes y utilidad
- ✅ Generación de PDF (cliente + listado interno)
- ✅ Exportar/importar Excel (.xlsx)
- ✅ Historial filtrable y ordenable
- ✅ Cambio de estado por cotización
- ✅ Clonar cotizaciones
- ✅ Configuración de empresa editable
- ✅ Diseño oscuro profesional (InnVolt branding)
- ✅ Responsive (móvil, tablet, escritorio)

---

## Instalación paso a paso

### 1. Clonar o descomprimir el proyecto

```bash
# Si usas Git:
git clone https://github.com/tu-usuario/innvolt-cotizador.git
cd innvolt-cotizador

# O descomprime el ZIP y entra a la carpeta:
cd cotizador-iv
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar Supabase

#### 3.1 Crear proyecto en Supabase

1. Ve a [https://supabase.com](https://supabase.com) y crea una cuenta si no tienes.
2. Crea un nuevo proyecto. Anota la **URL** y la **anon key** (en Settings → API).

#### 3.2 Ejecutar el esquema SQL

1. En el panel de Supabase, ve a **SQL Editor**.
2. Copia y pega el contenido de `supabase_schema.sql`.
3. Ejecuta el script completo.

#### 3.3 Crear usuario administrador

1. Ve a **Authentication → Users → Add user**.
2. Crea tu usuario con email y contraseña.
3. (Opcional) Agrega en **User Metadata**: `{ "nombre": "Admin InnVolt" }`

### 4. Variables de entorno

Crea el archivo `.env.local` en la raíz del proyecto:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Reemplaza con tus valores reales de Supabase.

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Deploy en Netlify

### Opción A: Desde GitHub (recomendado)

1. Sube el proyecto a GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/tu-usuario/innvolt-cotizador.git
   git push -u origin main
   ```

2. Ve a [https://netlify.com](https://netlify.com) → **Add new site → Import from Git**.

3. Conecta tu repositorio GitHub.

4. En **Build settings**:
   - Build command: `npm run build`
   - Publish directory: `.next`

5. En **Environment variables**, agrega:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = tu_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY = tu_anon_key
   ```

6. Haz clic en **Deploy site**.

7. Instala el plugin de Next.js para Netlify (se detecta automáticamente por `netlify.toml`).

### Opción B: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set NEXT_PUBLIC_SUPABASE_URL "tu_url"
netlify env:set NEXT_PUBLIC_SUPABASE_ANON_KEY "tu_key"
netlify deploy --prod
```

---

## Estructura del proyecto

```
cotizador-iv/
├── app/
│   ├── (auth)/
│   │   └── page.tsx              # Login
│   ├── (dashboard)/
│   │   ├── layout.tsx            # Layout con sidebar
│   │   ├── page.tsx              # Redirect → /dashboard
│   │   ├── dashboard/page.tsx    # Dashboard KPIs
│   │   ├── clientes/page.tsx     # CRUD clientes
│   │   ├── cotizador/
│   │   │   ├── page.tsx          # Cotizador principal
│   │   │   └── historial/page.tsx
│   │   └── configuracion/page.tsx
│   ├── globals.css               # Design system
│   └── layout.tsx
├── components/
│   ├── ToastContainer.tsx
│   └── pdf/
│       ├── PresupuestoPDF.tsx    # PDF cliente
│       └── ListadoInternoPDF.tsx # PDF interno
├── hooks/
│   ├── useAuth.ts
│   └── useToast.ts
├── lib/
│   └── supabase.ts
├── services/
│   ├── clientes.ts
│   └── cotizaciones.ts
├── types/
│   └── index.ts
├── utils/
│   └── index.ts
├── supabase_schema.sql
├── netlify.toml
├── package.json
└── .env.local.example
```

---

## Uso del cotizador

### Crear cotización

1. Ve a **Cotizador** en el sidebar.
2. Selecciona un cliente (busca por nombre, empresa o RUT).
3. Agrega ítems: **Material**, **Mano de Obra** o **Servicio**.
4. Para cada ítem: ingresa descripción, cantidad, costo interno y margen → el precio de venta se calcula solo.
5. Ajusta el descuento sobre mano de obra si corresponde.
6. Haz clic en **Guardar**.

### Generar PDF

1. Después de guardar, aparece el botón **PDF** en la barra superior.
2. Elige entre:
   - **PDF Cliente**: incluye todos los ítems, IVA y condiciones comerciales.
   - **Listado interno**: solo materiales con costos internos (confidencial).

### Importar Excel

- El archivo debe tener columnas: `Descripcion`, `Cantidad`, `Unidad`, `Costo unitario`, `Margen (%)`, `Precio venta`, `Categoria`.
- Haz clic en **Excel** en la barra superior para subir el archivo.

### Historial

- Filtra por estado, busca por folio o cliente.
- Cambia el estado directamente desde la tabla.
- Descarga el PDF desde el historial.
- Clona una cotización existente.

---

## Personalización

### Cambiar datos de empresa

Ve a **Configuración** en el sidebar → edita todos los datos → **Guardar cambios**.

O bien edita directamente en `types/index.ts` el objeto `INNVOLT_INFO` para cambiar los valores por defecto en PDF.

### Cambiar colores del diseño

En `app/globals.css`, edita las variables CSS:

```css
:root {
  --y:     #ffc600;   /* Amarillo InnVolt — color principal */
  --black: #000000;   /* Fondo */
  --bg:    #080808;   /* Fondo secundario */
  /* ... */
}
```

---

## Solución de problemas

| Problema | Solución |
|---|---|
| Error "Faltan variables de entorno" | Verifica que `.env.local` esté en la raíz con las claves correctas |
| No se puede iniciar sesión | Verifica que el usuario esté creado en Supabase Auth |
| Error al guardar cotización | Verifica que el SQL se ejecutó correctamente en Supabase |
| PDF no se descarga | Instala `@react-pdf/renderer` y `file-saver` (`npm install`) |
| Error de CORS en Supabase | Agrega tu dominio en Supabase > Settings > API > Allowed origins |

---

## Scripts disponibles

```bash
npm run dev     # Servidor de desarrollo
npm run build   # Build de producción
npm run start   # Inicia el build de producción localmente
npm run lint    # ESLint
```

---

## Tecnologías utilizadas

| Librería | Versión | Uso |
|---|---|---|
| Next.js | 15 | Framework principal |
| TypeScript | 5 | Tipado |
| TailwindCSS | 4 | Estilos |
| Supabase JS | 2 | Auth + DB |
| @react-pdf/renderer | 4 | Generación PDF |
| xlsx | 0.18 | Excel |
| file-saver | 2 | Descarga archivos |
| lucide-react | 0.475 | Iconos |
| zustand | 5 | Estado global (disponible) |
| recharts | 2 | Gráficos (disponible) |

---

## Licencia

Uso interno — InnVolt SpA © 2025. Todos los derechos reservados.
