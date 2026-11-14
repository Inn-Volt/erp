// Copia los archivos (Storage) de un Supabase a otro, carpeta por carpeta, con la API de Storage y
// sin dependencias (Node 22). Se puede repetir: lo que ya está se reemplaza por lo mismo.
//   ORIGEN_URL=https://xxxx.supabase.co ORIGEN_CLAVE=<service_role> DESTINO_URL=http://storage:5000 DESTINO_CLAVE=<service_role> node copiar-archivos.mjs
const origen = { base: `${process.env.ORIGEN_URL.replace(/\/$/, '')}/storage/v1`, clave: process.env.ORIGEN_CLAVE };
const destino = { base: (process.env.DESTINO_URL || '').replace(/\/$/, ''), clave: process.env.DESTINO_CLAVE };
const cab = (lado, extra = {}) => ({ Authorization: `Bearer ${lado.clave}`, apikey: lado.clave, ...extra });
const ruta = p => p.split('/').map(encodeURIComponent).join('/');

async function api(lado, metodo, camino, cuerpo) {
  const r = await fetch(`${lado.base}${camino}`, {
    method: metodo, headers: cab(lado, cuerpo ? { 'Content-Type': 'application/json' } : {}), body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok) throw new Error(`${metodo} ${camino}: ${r.status} ${await r.text()}`);
  return r.json();
}

/** Todos los archivos de un bucket (las carpetas vienen sin id y se recorren). */
async function listar(bucket, prefijo = '') {
  const salida = [];
  for (let offset = 0; ; offset += 1000) {
    const items = await api(origen, 'POST', `/object/list/${bucket}`, { prefix: prefijo, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    for (const it of items) {
      const nombre = prefijo ? `${prefijo}/${it.name}` : it.name;
      if (it.id === null) salida.push(...await listar(bucket, nombre));
      else salida.push({ nombre, tipo: it.metadata?.mimetype || 'application/octet-stream' });
    }
    if (items.length < 1000) break;
  }
  return salida;
}

const buckets = await api(origen, 'GET', '/bucket');
const existentes = new Set((await api(destino, 'GET', '/bucket')).map(b => b.id));
let total = 0, fallos = 0;
for (const b of buckets) {
  if (!existentes.has(b.id)) {
    await api(destino, 'POST', '/bucket', { id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types });
    console.log(`Bucket creado: ${b.id}`);
  }
  const archivos = await listar(b.id);
  console.log(`${b.id}: ${archivos.length} archivos`);
  for (const a of archivos) {
    try {
      const r = await fetch(`${origen.base}/object/authenticated/${b.id}/${ruta(a.nombre)}`, { headers: cab(origen) });
      if (!r.ok) throw new Error(`bajar: ${r.status}`);
      const cuerpo = Buffer.from(await r.arrayBuffer());
      const s = await fetch(`${destino.base}/object/${b.id}/${ruta(a.nombre)}`, {
        method: 'POST', headers: cab(destino, { 'Content-Type': a.tipo, 'x-upsert': 'true' }), body: cuerpo,
      });
      if (!s.ok) throw new Error(`subir: ${s.status} ${await s.text()}`);
      total++;
      if (total % 50 === 0) console.log(`  … ${total} copiados`);
    } catch (e) {
      fallos++;
      console.log(`  No se copió ${b.id}/${a.nombre}: ${e.message}`);
    }
  }
}
console.log(`Archivos copiados: ${total}${fallos ? ` · con problemas: ${fallos} (vuelve a correrlo: lo que ya está se reemplaza)` : ''}`);
process.exit(fallos ? 1 : 0);
