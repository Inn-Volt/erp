// Cliente de la prueba completa (ops/oracle/prueba/e2e.sh): hace lo mismo que el navegador y la ERP
// con @supabase/supabase-js. Variables: URL, ANON, SERVICE (las del servidor al que se habla).
//
//   node cliente.mjs sembrar     → en el «Supabase de origen»: cuentas, logo, archivo, aviso
//   node cliente.mjs verificar   → en el servidor nuevo: login, datos, logo, archivo, campanita, app
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const { URL: URL_BASE, ANON, SERVICE } = process.env;
if (!URL_BASE || !ANON || !SERVICE) throw new Error('Faltan URL, ANON o SERVICE');
const ESTADO = new URL('./estado.json', import.meta.url);
const CLAVE = 'Prueba-Clave-2026';
const CUENTAS = [
  { email: 'cesar@prueba.cl', nombre: 'César' },     // la primera cuenta queda de Administrador
  { email: 'tecnico@prueba.cl', nombre: 'Técnico' },
];
// Un PNG de 1×1 (el «logo»): se compara byte a byte al final.
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ARCHIVO = 'cccccccc-0000-0000-0000-000000000001/condiciones.txt';
const TEXTO = 'Archivo privado de la cotización de prueba — ñandú';

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_BASE, SERVICE, opciones);
let fallas = 0;
const ok = (cond, que, detalle = '') => {
  console.log(`${cond ? 'OK   ' : 'FALLA'} ${que}${!cond && detalle ? ` → ${detalle}` : ''}`);
  if (!cond) fallas++;
};
const exigir = (r, que) => { if (r.error) throw new Error(`${que}: ${r.error.message}`); return r.data; };

async function sembrar() {
  const ids = {};
  for (const c of CUENTAS) {
    const d = exigir(await admin.auth.admin.createUser({ email: c.email, password: CLAVE, email_confirm: true, user_metadata: { nombre: c.nombre } }), `crear ${c.email}`);
    ids[c.email] = d.user.id;
  }
  exigir(await admin.storage.from('logos').upload('logo_prueba.png', LOGO, { contentType: 'image/png', upsert: true }), 'subir logo');
  const logoUrl = admin.storage.from('logos').getPublicUrl('logo_prueba.png').data.publicUrl;
  exigir(await admin.from('empresas').insert({ nombre: 'Empresa de prueba', logo_url: logoUrl }), 'empresa con logo');
  exigir(await admin.storage.from('cotizaciones').upload(ARCHIVO, Buffer.from(TEXTO), { contentType: 'text/plain', upsert: true }), 'subir archivo privado');
  exigir(await admin.from('notificaciones').insert({ usuario_id: ids['cesar@prueba.cl'], tipo: 'prueba', titulo: 'Aviso de antes de migrar' }), 'aviso');
  writeFileSync(ESTADO, JSON.stringify({ ids, logoUrl }, null, 2));
  console.log(`Sembrado: ${CUENTAS.length} cuentas, logo en ${logoUrl}, archivo ${ARCHIVO}`);
}

async function verificar() {
  const { ids } = JSON.parse(readFileSync(ESTADO, 'utf8'));
  const cesar = ids['cesar@prueba.cl'];
  const sb = createClient(URL_BASE, ANON, opciones);

  const login = await sb.auth.signInWithPassword({ email: 'cesar@prueba.cl', password: CLAVE });
  ok(!login.error && login.data.user?.id === cesar, 'login con la misma contraseña y el mismo id', login.error?.message);
  if (login.error) return;
  const token = login.data.session.access_token;
  const login2 = await sb.auth.signInWithPassword({ email: 'cesar@prueba.cl', password: 'otra-clave' });
  ok(!!login2.error, 'una contraseña equivocada no entra');
  await sb.auth.signInWithPassword({ email: 'cesar@prueba.cl', password: CLAVE });

  const cot = await sb.from('cotizaciones').select('id, total').order('total');
  ok(!cot.error && cot.data?.length === 2 && Number(cot.data[0].total) === 500000, 'las 2 cotizaciones (con permisos de la cuenta)', cot.error?.message ?? JSON.stringify(cot.data));
  const anon = await createClient(URL_BASE, ANON, opciones).from('cotizaciones').select('id');
  ok(!anon.error && anon.data?.length === 0, 'sin sesión no se ve ninguna cotización', anon.error?.message ?? `${anon.data?.length} filas`);

  const emp = await sb.from('empresas').select('logo_url').eq('nombre', 'Empresa de prueba').single();
  const logoUrl = emp.data?.logo_url ?? '';
  ok(logoUrl.startsWith(`${URL_BASE}/storage/v1/object/public/logos/`), 'el logo apunta al servidor nuevo', logoUrl);
  const r = await fetch(logoUrl).catch(e => ({ ok: false, status: String(e) }));
  const bytes = r.ok ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
  ok(r.ok && bytes.equals(LOGO), 'el logo se descarga igual (bucket público)', `HTTP ${r.status}`);

  const arch = await sb.storage.from('cotizaciones').download(ARCHIVO);
  ok(!arch.error && (await arch.data.text()) === TEXTO, 'archivo privado: se descarga con sesión y está igual', arch.error?.message);
  const archAnon = await createClient(URL_BASE, ANON, opciones).storage.from('cotizaciones').download(ARCHIVO);
  ok(!!archAnon.error, 'archivo privado: sin sesión no se descarga');

  const avisos = await sb.from('notificaciones').select('titulo');
  ok(avisos.data?.some(a => a.titulo === 'Aviso de antes de migrar'), 'el aviso de antes de migrar está');

  // La campanita en vivo: lo mismo que hooks/useAvisos.ts.
  const llego = await new Promise(resolve => {
    const t = setTimeout(() => resolve(false), 20000);
    const canal = sb.channel(`avisos-${cesar}-prueba`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${cesar}` }, p => {
        if (p.new?.titulo === 'Aviso en vivo') { clearTimeout(t); sb.removeChannel(canal); resolve(true); }
      })
      .subscribe(async estado => {
        if (estado === 'SUBSCRIBED') {
          const ins = await admin.from('notificaciones').insert({ usuario_id: cesar, tipo: 'prueba', titulo: 'Aviso en vivo' });
          if (ins.error) { console.log(`  (no se pudo crear el aviso: ${ins.error.message})`); clearTimeout(t); resolve(false); }
        } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') { clearTimeout(t); resolve(false); }
      });
  });
  ok(llego, 'la campanita recibe el aviso en vivo (realtime)');

  // La app: la página de entrada y una ruta que valida la sesión en el servidor (llama al login
  // por la dirección pública, que dentro del servidor llega directo a Caddy) y revisa permisos.
  const pag = await fetch(`${URL_BASE}/login`).catch(e => ({ ok: false, status: String(e) }));
  ok(pag.ok, 'la app responde (/login)', `HTTP ${pag.status}`);
  const api = await fetch(`${URL_BASE}/api/ia-estado`, { headers: { Authorization: `Bearer ${token}` } }).catch(e => ({ ok: false, status: String(e) }));
  const cuerpo = api.ok ? await api.json() : {};
  ok(api.ok && Array.isArray(cuerpo.orden), 'la app valida la sesión y los permisos en el servidor (/api/ia-estado)', `HTTP ${api.status}`);
  const api401 = await fetch(`${URL_BASE}/api/ia-estado`).catch(() => ({ status: 0 }));
  ok(api401.status === 401, 'sin sesión, la API responde 401', `HTTP ${api401.status}`);
}

const modo = process.argv[2];
if (modo === 'sembrar') await sembrar();
else if (modo === 'verificar') await verificar();
else throw new Error('Uso: node cliente.mjs sembrar|verificar');
console.log(fallas ? `${fallas} fallas` : 'Todo OK');
process.exit(fallas ? 1 : 0);
