// Recreo · intermediario para la API de iPasen (Cloudflare Worker)
//
// 1. Reenvía las peticiones de la app a Séneca. Solo deja pasar las rutas que la app usa
//    y no guarda nada de ese tráfico.
// 2. Avisos (opcional): si conectas un espacio KV llamado RECREO y un disparador cada 15 minutos,
//    mira Séneca por su cuenta y manda una notificación al iPhone cuando hay un mensaje,
//    una nota, una autorización o un documento nuevo. Para eso guarda en ese KV, dentro de tu cuenta de
//    Cloudflare, el usuario y la contraseña de iPasen de quien active los avisos.
//
// Si publicas la app en otra dirección, añádela a ORIGENES_PERMITIDOS.

const SENECA = "https://seneca.juntadeandalucia.es/api/public/";

const ORIGENES_PERMITIDOS = [
  "https://rayayrodriguez.github.io",
];

// Identifica las notificaciones ante Apple. Es la dirección de la app.
const CONTACTO = "https://rayayrodriguez.github.io/recreo/";

// La API comprueba que quien llama es la app de iPasen.
const AGENTE = "iPasen/12.10.1(Google Pixel 7;ANDROID 14;Scale/2.625)";

// Sin avisos de 22:00 a 7:30 (hora de Madrid). Lo que llegue de noche se avisa a las 7:30.
const SILENCIO = { desde: 22 * 60, hasta: 7 * 60 + 30 };

const MAX_CUENTAS = 4;

const RUTAS = new Set([
  "security/oauth/token",
  "generales/info-session",
  "generales/get-agenda",
  "horarios/get-horario",
  "horarios/tutoria",
  "faltas/get-faltas",
  "faltas/get-notificaciones",
  "faltas/nueva-falta",
  "faltas/borrar-notificacion",
  "mensajeria/get-comunicaciones",
  "mensajeria/get-conversaciones",
  "mensajeria/get-mensajes-salida",
  "mensajeria/get-colectivos",
  "mensajeria/gestion-mensajeria",
  "mensajeria/enviar-nuevo-mensaje",
  "mensajeria/responder-mensaje",
  "seguimiento/get-aut-act",
  "seguimiento/get-actividades-evaluables-criterios",
  "seguimiento/get-det-aut-act",
  "seguimiento/set-aut-act-tut",
  "firma/ipasen/bandeja-firma",
]);

// ── Utilidades ──────────────────────────────────────────────────────────────

const texto = new TextEncoder();

function cabecerasCors(origen) {
  return {
    "Access-Control-Allow-Origin": origen,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Expose-Headers": "token-renew",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(datos, estado = 200, cors = {}) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const error = (estado, detalle, cors = {}) => json({ success: false, errors: [{ status: estado, detail: detalle }] }, estado, cors);

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function desdeB64url(cadena) {
  let s = String(cadena).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function unir(...partes) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const fuera = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    fuera.set(p, i);
    i += p.length;
  }
  return fuera;
}

function iguales(a, b) {
  const x = texto.encode(String(a || "")), y = texto.encode(String(b || ""));
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

function buscarClave(obj, patron, nivel = 0) {
  if (obj === null || obj === undefined || nivel > 6) return null;
  if (typeof obj === "string") {
    if (!/^\s*[{[]/.test(obj)) return null;
    try {
      return buscarClave(JSON.parse(obj), patron, nivel + 1);
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj)) {
    if (patron.test(k) && (typeof v === "string" || typeof v === "number") && String(v) !== "") return String(v);
  }
  for (const v of Object.values(obj)) {
    const r = buscarClave(v, patron, nivel + 1);
    if (r) return r;
  }
  return null;
}

function nombrePersona(t) {
  const m = String(t || "").trim().match(/^([^,(]+),\s*([^(]+?)\s*(\(.*\))?$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : String(t || "").trim();
}

function enSilencio() {
  const partes = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = +partes.find((p) => p.type === "hour").value % 24;
  const m = +partes.find((p) => p.type === "minute").value;
  const t = h * 60 + m;
  return t >= SILENCIO.desde || t < SILENCIO.hasta;
}

// ── Reenvío a Séneca ────────────────────────────────────────────────────────

async function reenviar(request, ruta, url, cors) {
  const cabeceras = new Headers({ "User-Agent": AGENTE, "Accept": "application/json", "Accept-Charset": "utf-8" });
  for (const nombre of ["Authorization", "Content-Type"]) {
    const valor = request.headers.get(nombre);
    if (valor) cabeceras.set(nombre, valor);
  }
  let respuesta;
  try {
    respuesta = await fetch(SENECA + ruta + url.search, {
      method: request.method,
      headers: cabeceras,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch {
    return error(502, "Séneca no responde", cors);
  }
  const salida = new Headers(cors);
  salida.set("Content-Type", respuesta.headers.get("Content-Type") || "application/json; charset=utf-8");
  salida.set("Cache-Control", "no-store");
  const renovado = respuesta.headers.get("token-renew");
  if (renovado) salida.set("token-renew", renovado);
  return new Response(respuesta.body, { status: respuesta.status, headers: salida });
}

// ── Séneca desde el propio intermediario (para los avisos) ──────────────────

class FalloAcceso extends Error {
  constructor(resultado) {
    super("acceso");
    this.resultado = resultado;
  }
}

async function entrar(cuenta, codigo = "") {
  const form = new URLSearchParams({
    username: cuenta.usuario, password: cuenta.clave, grant_type: "password", scope: "PASENDROID", client_id: "ipasen",
  });
  if (codigo) {
    if (cuenta.reto) form.set("2FactorAuthToken", cuenta.reto);
    form.set("2FactorAuthCode", String(codigo).trim());
    form.set("trustDevice", "true");
  } else if (cuenta.confiable) {
    form.set("2FactorAuthToken", cuenta.confiable);
  }
  const r = await fetch(SENECA + "security/oauth/token", {
    method: "POST",
    headers: { "User-Agent": AGENTE, "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (r.ok && cuerpo.access_token) {
    cuenta.token = cuerpo.access_token;
    if (cuerpo.twoFactorAuthToken) cuenta.confiable = cuerpo.twoFactorAuthToken;
    cuenta.reto = null;
    return { ok: true };
  }
  const fallo = (cuerpo.errors || [])[0] || {};
  const reto = buscarClave(cuerpo, /(two|2).?factor.*token/i);
  if (!codigo && (reto || /doble factor|segundo factor|two.?factor|2fa|verificaci/i.test(fallo.detail || cuerpo.message || ""))) {
    if (reto) cuenta.reto = reto;
    return { ok: false, codigo: true, enviadoA: buscarClave(cuerpo, /send.?to|sent.?to|destino/i) || "" };
  }
  return { ok: false, clave: r.status === 400 || r.status === 401, mensaje: fallo.detail || cuerpo.message || `Séneca ha respondido ${r.status}` };
}

async function pedirSeneca(cuenta, ruta, params = {}, reintentar = true) {
  if (!cuenta.token) {
    const res = await entrar(cuenta);
    if (!res.ok) throw new FalloAcceso(res);
  }
  const url = new URL(SENECA + ruta);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { "User-Agent": AGENTE, "Accept": "application/json", "Authorization": `Bearer ${cuenta.token}` } });
  const renovado = r.headers.get("token-renew");
  if (renovado) cuenta.token = renovado;
  if (r.status === 401 && reintentar) {
    cuenta.token = null;
    return pedirSeneca(cuenta, ruta, params, false);
  }
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok || !cuerpo || cuerpo.success === false) throw new Error(`${ruta}: ${r.status}`);
  return cuerpo.data !== undefined ? cuerpo.data : cuerpo;
}

// Las notas que ya tienen calificación (misma lógica que la app).
function notasDe(periodos) {
  const filas = [];
  for (const p of Array.isArray(periodos) ? periodos : []) {
    for (const s of p.subjects || []) {
      for (const a of s.activities || []) {
        const entregas = a.diary_score || [];
        const general = entregas.map((d) => d.note).filter((n) => n !== undefined && n !== null && n !== "");
        const criterios = [...entregas.flatMap((d) => d.note_array || []), ...(a.note_array || [])]
          .map((n) => n.note).filter((n) => n !== undefined && n !== null && n !== "");
        let nota = general.length ? general[0] : null;
        if (nota === null && criterios.length) {
          const numeros = criterios.map((n) => Number(String(n).replace(",", ".")));
          nota = numeros.every((n) => !Number.isNaN(n)) ? Math.round((numeros.reduce((x, y) => x + y, 0) / numeros.length) * 10) / 10 : criterios.join(", ");
        }
        if (nota === null) continue;
        filas.push({ materia: String(s.name || "").trim(), actividad: String(a.description_activity || "").trim(), fecha: a.start_date || "", nota });
      }
    }
  }
  return filas;
}

// Lo nuevo desde la última vez. Con soloMarcar, apunta lo que hay sin avisar (al activar).
async function novedades(cuenta, soloMarcar = false) {
  const vistos = cuenta.vistos || (cuenta.vistos = { mensajes: [], aut: [], docs: [] });
  if (!vistos.notas) vistos.notas = [];
  const hijos = cuenta.hijos || {};
  const avisos = [];

  const mensajes = await pedirSeneca(cuenta, "mensajeria/get-comunicaciones", { page: 1 });
  const nuevos = new Map();
  for (const m of Array.isArray(mensajes) ? mensajes : []) {
    const clave = String(m.id_message ?? `${m.id}-${m.enrollment}`);
    if (vistos.mensajes.includes(clave)) continue;
    vistos.mensajes.push(clave);
    if (m.isread) continue;
    const grupo = nuevos.get(m.id) || { m, hijos: [], matricula: String(m.enrollment || "") };
    const nombre = hijos[String(m.enrollment)];
    if (nombre && !grupo.hijos.includes(nombre)) grupo.hijos.push(nombre);
    nuevos.set(m.id, grupo);
  }
  for (const { m, hijos: quienes, matricula } of nuevos.values()) {
    avisos.push({
      titulo: quienes.length ? `Mensaje sobre ${quienes.join(" y ")}` : "Mensaje nuevo",
      cuerpo: `${nombrePersona(m.sender) || "El colegio"}: ${m.subject || "sin asunto"}`,
      matricula, etiqueta: `m${m.id}`,
    });
  }

  for (const [matricula, nombre] of Object.entries(hijos)) {
    try {
      const lista = await pedirSeneca(cuenta, "seguimiento/get-aut-act", { enrollment: matricula });
      for (const a of Array.isArray(lista) ? lista : []) {
        const id = String(a.aluatprotut);
        if (a.signature || vistos.aut.includes(id)) continue;
        vistos.aut.push(id);
        avisos.push({ titulo: `Autorización para ${nombre}`, cuerpo: a.motive || "Hay una autorización pendiente", matricula, etiqueta: `a${id}` });
      }
    } catch (e) {
      if (e instanceof FalloAcceso) throw e;
    }
  }

  for (const [matricula, nombre] of Object.entries(hijos)) {
    try {
      const periodos = await pedirSeneca(cuenta, "seguimiento/get-actividades-evaluables-criterios", { enrollment: matricula });
      for (const n of notasDe(periodos)) {
        const id = `${matricula}|${n.materia}|${n.actividad}|${n.fecha}|${n.nota}`;
        if (vistos.notas.includes(id)) continue;
        vistos.notas.push(id);
        avisos.push({ titulo: `Nota nueva de ${nombre}`, cuerpo: `${n.materia}${n.actividad ? `, ${n.actividad}` : ""}: ${String(n.nota).replace(".", ",")}`, matricula, etiqueta: `n${vistos.notas.length}` });
      }
    } catch (e) {
      if (e instanceof FalloAcceso) throw e;
    }
  }

  try {
    const secciones = await pedirSeneca(cuenta, "firma/ipasen/bandeja-firma", { typeState: "P", page: 1 });
    for (const s of Array.isArray(secciones) ? secciones : []) {
      for (const d of s.documents || []) {
        const id = String(d.id);
        if (vistos.docs.includes(id)) continue;
        vistos.docs.push(id);
        avisos.push({ titulo: "Documento para firmar", cuerpo: d.description || "El colegio ha enviado un documento", etiqueta: `d${id}` });
      }
    }
  } catch (e) {
    if (e instanceof FalloAcceso) throw e;
  }

  for (const k of Object.keys(vistos)) vistos[k] = vistos[k].slice(-300);
  if (soloMarcar) return [];
  if (avisos.length > 4) {
    return [{ titulo: "Novedades del cole", cuerpo: `Tienes ${avisos.length} novedades nuevas en Recreo.`, etiqueta: "resumen" }];
  }
  return avisos;
}

// ── Notificaciones (Web Push con VAPID, RFC 8291 y 8292) ────────────────────

async function clavesVapid(kv) {
  const guardadas = await kv.get("vapid", "json");
  if (guardadas) return guardadas;
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const claves = {
    publica: b64url(await crypto.subtle.exportKey("raw", par.publicKey)),
    privada: await crypto.subtle.exportKey("jwk", par.privateKey),
  };
  await kv.put("vapid", JSON.stringify(claves));
  return claves;
}

async function firmaVapid(destino, vapid) {
  const cabecera = b64url(texto.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const datos = b64url(texto.encode(JSON.stringify({ aud: new URL(destino).origin, exp: Math.floor(Date.now() / 1000) + 3600, sub: CONTACTO })));
  const clave = await crypto.subtle.importKey("jwk", vapid.privada, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clave, texto.encode(`${cabecera}.${datos}`));
  return `${cabecera}.${datos}.${b64url(firma)}`;
}

async function hkdf(sal, ikm, info, bytes) {
  const clave = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sal, info }, clave, bytes * 8));
}

async function cifrar(suscripcion, mensaje) {
  const publicaMovil = desdeB64url(suscripcion.keys.p256dh);
  const secreto = desdeB64url(suscripcion.keys.auth);
  const efimera = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicaPropia = new Uint8Array(await crypto.subtle.exportKey("raw", efimera.publicKey));
  const claveMovil = await crypto.subtle.importKey("raw", publicaMovil, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: claveMovil }, efimera.privateKey, 256));
  const ikm = await hkdf(secreto, compartido, unir(texto.encode("WebPush: info\0"), publicaMovil, publicaPropia), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, texto.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, texto.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, unir(texto.encode(mensaje), new Uint8Array([2]))));
  return unir(sal, new Uint8Array([0, 0, 16, 0]), new Uint8Array([publicaPropia.length]), publicaPropia, cifrado);
}

async function notificar(suscripcion, aviso, vapid) {
  const cuerpo = await cifrar(suscripcion, JSON.stringify(aviso));
  const r = await fetch(suscripcion.endpoint, {
    method: "POST",
    headers: {
      "TTL": "86400",
      "Urgency": "normal",
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Authorization": `vapid t=${await firmaVapid(suscripcion.endpoint, vapid)}, k=${vapid.publica}`,
    },
    body: cuerpo,
  });
  return r.status;
}

// Manda el aviso a todos los iPhone de la cuenta y quita los que ya no existen.
async function notificarCuenta(cuenta, aviso, vapid) {
  const quedan = [];
  for (const s of cuenta.suscripciones || []) {
    let estado = 0;
    try {
      estado = await notificar(s, aviso, vapid);
    } catch {
      estado = 0;
    }
    if (estado !== 404 && estado !== 410) quedan.push(s);
  }
  cuenta.suscripciones = quedan;
}

async function revisar(env) {
  const kv = env.RECREO;
  if (!env.SIN_SILENCIO && enSilencio()) return;
  const vapid = await clavesVapid(kv);
  const { keys } = await kv.list({ prefix: "cuenta:" });
  for (const { name } of keys) {
    const cuenta = await kv.get(name, "json");
    if (!cuenta || cuenta.estado !== "ok" || !(cuenta.suscripciones || []).length) continue;
    const antes = JSON.stringify(cuenta);
    try {
      for (const aviso of await novedades(cuenta)) await notificarCuenta(cuenta, aviso, vapid);
    } catch (e) {
      if (e instanceof FalloAcceso && e.resultado.codigo) {
        cuenta.estado = "codigo";
        await notificarCuenta(cuenta, { titulo: "Los avisos están en pausa", cuerpo: "Séneca pide un código para seguir. Abre Recreo, ve a Ajustes y pulsa Reactivar avisos.", etiqueta: "acceso" }, vapid);
      } else if (e instanceof FalloAcceso && e.resultado.clave) {
        cuenta.estado = "clave";
        await notificarCuenta(cuenta, { titulo: "Los avisos están en pausa", cuerpo: "La contraseña de iPasen ha cambiado. Abre Recreo, ve a Ajustes y pulsa Reactivar avisos.", etiqueta: "acceso" }, vapid);
      }
      // Si Séneca falla por otra cosa, se reintenta en la próxima vuelta.
    }
    if (!cuenta.suscripciones.length) await kv.delete(name);
    else if (JSON.stringify(cuenta) !== antes) await kv.put(name, JSON.stringify(cuenta));
  }
}

// ── Alta, baja y estado de los avisos ───────────────────────────────────────

const nombreCuenta = (usuario) => "cuenta:" + String(usuario || "").trim().toLowerCase();

async function cuentaConClave(kv, d) {
  const cuenta = await kv.get(nombreCuenta(d.usuario), "json");
  if (!cuenta || !iguales(cuenta.clave, d.clave)) return null;
  return cuenta;
}

async function avisos(ruta, request, env, cors) {
  const kv = env.RECREO;
  if (!kv) return error(501, "Los avisos no están configurados: falta conectar el espacio KV «RECREO» al worker.", cors);

  if (ruta === "avisos/clave" && request.method === "GET") {
    return json({ publica: (await clavesVapid(kv)).publica }, 200, cors);
  }
  if (request.method !== "POST") return error(405, "Método no permitido", cors);
  const d = await request.json().catch(() => ({}));
  if (!d.usuario || !d.clave) return error(400, "Faltan el usuario o la contraseña", cors);

  if (ruta === "avisos/alta") {
    const s = d.suscripcion || {};
    if (!/^https:\/\//.test(s.endpoint || "") || !s.keys || !s.keys.p256dh || !s.keys.auth) return error(400, "Suscripción no válida", cors);
    const nombre = nombreCuenta(d.usuario);
    let cuenta = await kv.get(nombre, "json");
    if (!cuenta) {
      const { keys } = await kv.list({ prefix: "cuenta:" });
      if (keys.length >= MAX_CUENTAS) return error(403, "Ya hay demasiadas cuentas con avisos en este intermediario", cors);
      cuenta = { usuario: d.usuario.trim(), suscripciones: [], vistos: { mensajes: [], aut: [], docs: [] } };
    }
    if (!d.codigo) {
      cuenta.clave = d.clave;
      if (d.confiable) cuenta.confiable = d.confiable;
    } else if (!iguales(cuenta.clave, d.clave)) {
      return error(403, "La contraseña no coincide", cors);
    }
    cuenta.token = null;
    const acceso = await entrar(cuenta, d.codigo || "");
    if (!acceso.ok) {
      if (acceso.codigo) {
        cuenta.estado = "codigo";
        await kv.put(nombre, JSON.stringify(cuenta));
        return json({ codigo: true, enviadoA: acceso.enviadoA }, 200, cors);
      }
      return error(401, acceso.mensaje || "Usuario o contraseña incorrectos", cors);
    }
    try {
      const sesion = await pedirSeneca(cuenta, "generales/info-session");
      cuenta.hijos = Object.fromEntries((sesion.sons || []).map((h) => [String(h.enrollment), h.simpleName || h.fullname || ""]));
      await novedades(cuenta, true);
    } catch {
      return error(502, "Séneca no ha respondido. Prueba otra vez en un rato.", cors);
    }
    cuenta.suscripciones = (cuenta.suscripciones || []).filter((x) => x.endpoint !== s.endpoint);
    cuenta.suscripciones.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
    cuenta.estado = "ok";
    await kv.put(nombre, JSON.stringify(cuenta));
    return json({ ok: true }, 200, cors);
  }

  const cuenta = await cuentaConClave(kv, d);

  if (ruta === "avisos/estado") {
    const activo = !!cuenta && (cuenta.suscripciones || []).some((x) => x.endpoint === d.endpoint);
    return json({ activo, estado: cuenta ? cuenta.estado : null }, 200, cors);
  }
  if (!cuenta) return error(404, "No hay avisos activados con ese usuario y contraseña", cors);

  if (ruta === "avisos/baja") {
    cuenta.suscripciones = (cuenta.suscripciones || []).filter((x) => x.endpoint !== d.endpoint);
    if (cuenta.suscripciones.length) await kv.put(nombreCuenta(d.usuario), JSON.stringify(cuenta));
    else await kv.delete(nombreCuenta(d.usuario));
    return json({ ok: true }, 200, cors);
  }

  if (ruta === "avisos/prueba") {
    const s = (cuenta.suscripciones || []).find((x) => x.endpoint === d.endpoint);
    if (!s) return error(404, "Este iPhone no tiene los avisos activados", cors);
    const estado = await notificar(s, { titulo: "Avisos activados", cuerpo: "Así te llegarán los mensajes, notas, autorizaciones y documentos nuevos del cole.", etiqueta: "prueba" }, await clavesVapid(kv));
    if (estado >= 300) return error(502, `El servicio de avisos ha respondido ${estado}`, cors);
    return json({ ok: true }, 200, cors);
  }

  return error(404, "Ruta no permitida", cors);
}

// ── Entrada ─────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origen = request.headers.get("Origin") || "";
    if (!ORIGENES_PERMITIDOS.includes(origen)) return error(403, "Origen no permitido");
    const cors = cabecerasCors(origen);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET" && request.method !== "POST") return error(405, "Método no permitido", cors);

    const url = new URL(request.url);
    const ruta = url.pathname.replace(/^\/+/, "");
    if (ruta.startsWith("avisos/")) return avisos(ruta, request, env || {}, cors);
    if (!RUTAS.has(ruta)) return error(404, "Ruta no permitida", cors);
    return reenviar(request, ruta, url, cors);
  },

  async scheduled(evento, env, ctx) {
    if (env && env.RECREO) ctx.waitUntil(revisar(env));
  },
};
