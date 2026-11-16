// Recreo · intermediario para la API de iPasen (Cloudflare Worker)
//
// Solo reenvía las peticiones de la app a Séneca. No guarda nada, no registra
// contraseñas ni mensajes y solo deja pasar las rutas que la app necesita.
//
// Si publicas la app en otra dirección, añádela a ORIGENES_PERMITIDOS.

const SENECA = "https://seneca.juntadeandalucia.es/api/public/";

const ORIGENES_PERMITIDOS = [
  "https://rayayrodriguez.github.io",
];

// La API comprueba que quien llama es la app de iPasen.
const AGENTE = "iPasen/12.10.1(Google Pixel 7;ANDROID 14;Scale/2.625)";

const RUTAS = new Set([
  "security/oauth/token",
  "generales/info-session",
  "generales/get-agenda",
  "horarios/get-horario",
  "horarios/tutoria",
  "faltas/get-faltas",
  "mensajeria/get-comunicaciones",
  "mensajeria/get-conversaciones",
  "mensajeria/get-mensajes-salida",
  "mensajeria/get-colectivos",
  "mensajeria/gestion-mensajeria",
  "mensajeria/enviar-nuevo-mensaje",
  "mensajeria/responder-mensaje",
]);

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

function error(estado, texto, cors = {}) {
  return new Response(JSON.stringify({ success: false, errors: [{ status: estado, detail: texto }] }), {
    status: estado,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request) {
    const origen = request.headers.get("Origin") || "";
    if (!ORIGENES_PERMITIDOS.includes(origen)) {
      return error(403, "Origen no permitido");
    }
    const cors = cabecerasCors(origen);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "GET" && request.method !== "POST") {
      return error(405, "Método no permitido", cors);
    }

    const url = new URL(request.url);
    const ruta = url.pathname.replace(/^\/+/, "");
    if (!RUTAS.has(ruta)) {
      return error(404, "Ruta no permitida", cors);
    }

    const cabeceras = new Headers({
      "User-Agent": AGENTE,
      "Accept": "application/json",
      "Accept-Charset": "utf-8",
    });
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
    } catch (e) {
      return error(502, "Séneca no responde", cors);
    }

    const salida = new Headers(cors);
    salida.set("Content-Type", respuesta.headers.get("Content-Type") || "application/json; charset=utf-8");
    salida.set("Cache-Control", "no-store");
    const renovado = respuesta.headers.get("token-renew");
    if (renovado) salida.set("token-renew", renovado);

    return new Response(respuesta.body, { status: respuesta.status, headers: salida });
  },
};
