// Acceso a la API de iPasen a través del intermediario.
// Es la misma API que usa la app oficial; no es pública ni está documentada,
// así que cualquier cambio de la Junta puede romper algo de aquí.

import { almacen } from "./almacen.js";

export class ErrorPasen extends Error {
  constructor(mensaje, estado = 0) {
    super(mensaje);
    this.estado = estado;
  }
}

export class SesionCaducada extends ErrorPasen {}

export class Pide2FA extends ErrorPasen {
  constructor(enviadoA) {
    super("Séneca pide un código de verificación");
    this.enviadoA = enviadoA;
  }
}

function limpiar(valor) {
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (valor && typeof valor === "object") {
    const fuera = {};
    for (const [k, v] of Object.entries(valor)) {
      if (k === "@class" || v === null || v === "") continue;
      fuera[k] = limpiar(v);
    }
    return fuera;
  }
  return valor;
}

// multipart/form-data montado a mano: así cada parte lleva exactamente
// las cabeceras que espera Séneca, sin el nombre de fichero que añade FormData.
export function multipart(partes) {
  const limite = "----recreo" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  let cuerpo = "";
  for (const [nombre, valor, tipo] of partes) {
    cuerpo += `--${limite}\r\nContent-Disposition: form-data; name="${nombre}"\r\n`;
    if (tipo) cuerpo += `Content-Type: ${tipo}\r\n`;
    cuerpo += `\r\n${valor}\r\n`;
  }
  cuerpo += `--${limite}--\r\n`;
  return { tipo: `multipart/form-data; boundary=${limite}`, cuerpo };
}

// Igual que la app oficial: el texto tal cual, con los saltos de línea como <br/>.
function aHtml(texto) {
  return texto.trim().replace(/\r?\n/g, "<br/>");
}

export class Pasen {
  constructor() {
    this.codigoPendiente = null;
  }

  get base() {
    const url = (almacen.leer("intermediario") || "").trim().replace(/\/+$/, "");
    if (!url) throw new ErrorPasen("Falta la dirección del intermediario. Ponla en Ajustes.");
    return url + "/";
  }

  get token() {
    return almacen.leer("token");
  }

  set token(valor) {
    almacen.guardar("token", valor || null);
  }

  // ── Acceso ────────────────────────────────────────────────────────────────

  async entrar(usuario, clave, codigo = "") {
    const form = new URLSearchParams({
      username: usuario,
      password: clave,
      grant_type: "password",
      scope: "PASENDROID",
      client_id: "ipasen",
    });
    if (codigo) {
      if (!this.codigoPendiente) throw new ErrorPasen("El código ha caducado. Vuelve a entrar.");
      form.set("2FactorAuthToken", this.codigoPendiente);
      form.set("2FactorAuthCode", codigo.trim());
      form.set("trustDevice", "true");
    } else if (almacen.leer("dispositivoDeConfianza")) {
      form.set("2FactorAuthToken", almacen.leer("dispositivoDeConfianza"));
    }

    let r;
    try {
      r = await fetch(this.base + "security/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
    } catch {
      throw new ErrorPasen("No hay conexión con el intermediario. Revisa la dirección en Ajustes o tu conexión.");
    }
    const cuerpo = await r.json().catch(() => ({}));

    if (r.ok && cuerpo.access_token) {
      this.token = cuerpo.access_token;
      if (cuerpo.twoFactorAuthToken) almacen.guardar("dispositivoDeConfianza", cuerpo.twoFactorAuthToken);
      this.codigoPendiente = null;
      return { ok: true };
    }

    const reto = cuerpo.data || {};
    if (reto.twoFactorAuthToken) {
      this.codigoPendiente = reto.twoFactorAuthToken;
      return { ok: false, codigo: true, enviadoA: reto.sendTo || "" };
    }

    const fallo = (cuerpo.errors || [])[0] || {};
    if (r.status === 401 || r.status === 400) {
      throw new ErrorPasen(fallo.detail || "Usuario o contraseña incorrectos.", r.status);
    }
    throw new ErrorPasen(fallo.detail || cuerpo.message || `Séneca no ha dejado entrar (error ${r.status}).`, r.status);
  }

  async reentrar() {
    const cred = almacen.leer("credenciales");
    if (!cred) throw new SesionCaducada("La sesión ha caducado. Vuelve a entrar.");
    const res = await this.entrar(cred.usuario, cred.clave);
    if (!res.ok) throw new Pide2FA(res.enviadoA);
  }

  salir() {
    this.token = null;
    this.codigoPendiente = null;
  }

  // ── Peticiones ────────────────────────────────────────────────────────────

  async pedir(metodo, ruta, { params, json, partes } = {}, reintentar = true) {
    if (!this.token) await this.reentrar();

    const url = new URL(this.base + ruta);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    }
    const cabeceras = { Authorization: `Bearer ${this.token}` };
    let cuerpo;
    if (json !== undefined) {
      cabeceras["Content-Type"] = "application/json";
      cuerpo = JSON.stringify(json);
    } else if (partes) {
      const mp = multipart(partes);
      cabeceras["Content-Type"] = mp.tipo;
      cuerpo = mp.cuerpo;
    }

    let r;
    try {
      r = await fetch(url, { method: metodo, headers: cabeceras, body: cuerpo });
    } catch {
      throw new ErrorPasen("Sin conexión. Comprueba que tienes internet.");
    }

    const renovado = r.headers.get("token-renew");
    if (renovado) this.token = renovado;

    if (r.status === 401 && reintentar) {
      this.token = null;
      await this.reentrar();
      return this.pedir(metodo, ruta, { params, json, partes }, false);
    }
    if (r.status === 401) throw new SesionCaducada("La sesión ha caducado. Vuelve a entrar.", 401);

    const texto = await r.text();
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch {
      if (!r.ok) throw new ErrorPasen(`Séneca ha devuelto un error (${r.status}).`, r.status);
      return texto;
    }
    if (!r.ok || datos.success === false) {
      const fallo = (datos.errors || [])[0] || {};
      throw new ErrorPasen(fallo.detail || datos.message || `Séneca ha devuelto un error (${r.status}).`, r.status);
    }
    return limpiar(datos.data !== undefined ? datos.data : datos);
  }

  get(ruta, params) {
    return this.pedir("GET", ruta, { params });
  }

  // ── Datos ─────────────────────────────────────────────────────────────────

  async hijos() {
    const sesion = await this.get("generales/info-session");
    return (sesion.sons || []).map((h) => ({
      matricula: String(h.enrollment),
      nombre: h.simpleName || h.fullname,
      completo: h.fullname || h.simpleName,
      curso: h.course || "",
      grupo: h.unity || "",
      tutor: h.tutor || "",
      centro: h.description || "",
      codigoCentro: h.centerCode || "",
    }));
  }

  async mensajes(matricula, pagina = 1) {
    const lista = await this.get("mensajeria/get-comunicaciones", { page: pagina, enrollments: matricula });
    return (Array.isArray(lista) ? lista : []).filter((m) => !matricula || String(m.enrollment) === String(matricula));
  }

  async noLeidosPorHijo() {
    const lista = await this.get("mensajeria/get-comunicaciones", { page: 1 });
    const cuenta = {};
    for (const m of Array.isArray(lista) ? lista : []) {
      if (!m.isread) cuenta[String(m.enrollment)] = (cuenta[String(m.enrollment)] || 0) + 1;
    }
    return cuenta;
  }

  // Devuelve la conversación completa con ese remitente, la más antigua primero.
  async conversacion(id) {
    const todos = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
      const res = await this.get("mensajeria/get-conversaciones", { id, page: pagina });
      const lote = (res && res.messages) || [];
      if (!lote.length) break;
      todos.push(...lote);
      if (lote.length < 10) break;
    }
    return todos;
  }

  marcarLeido(copia) {
    return this.pedir("POST", "mensajeria/gestion-mensajeria", {
      json: { id: copia.id, id_message: copia.id_message, notread: false },
    });
  }

  async destinatarios(matricula) {
    const grupos = await this.get("mensajeria/get-colectivos", { enrollment: matricula });
    return (Array.isArray(grupos) ? grupos : []).map((g) => ({
      grupo: g.name || "",
      personas: (g.users || []).map((u) => ({ id: String(u.id_user), nombre: u.name || "", codigo: u.data_code })),
    }));
  }

  enviarNuevo({ asunto, texto, para }) {
    const destinatarios = para.map((p) => ({ data_code: p.codigo, id_user: String(p.id) }));
    return this.pedir("POST", "mensajeria/enviar-nuevo-mensaje", {
      partes: [
        ["subject", asunto.trim(), "text/plain"],
        ["message", aHtml(texto), "text/plain"],
        ["recipient", JSON.stringify(destinatarios), "application/json"],
        ["allowResponse", "true", null],
      ],
    });
  }

  responder(copia, texto) {
    return this.pedir("POST", "mensajeria/responder-mensaje", {
      partes: [
        ["id", String(copia.id), "text/plain"],
        ["id_message", String(copia.id_message), "text/plain"],
        ["body_message", aHtml(texto), "text/plain"],
        ["allowResponse", "true", "text/plain"],
      ],
    });
  }

  async enviados(pagina = 1) {
    const lista = await this.get("mensajeria/get-mensajes-salida", { page: pagina });
    return Array.isArray(lista) ? lista : [];
  }

  async horario(matricula) {
    const lista = await this.get("horarios/get-horario", { enrollment: matricula });
    return Array.isArray(lista) ? lista : [];
  }

  tutoria(matricula) {
    return this.get("horarios/tutoria", { enrollment: matricula });
  }

  async faltas(matricula) {
    const lista = await this.get("faltas/get-faltas", { enrollment: matricula });
    return Array.isArray(lista) ? lista : [];
  }

  async agenda(desde, hasta) {
    const lista = await this.get("generales/get-agenda", { initdate: desde, enddate: hasta });
    return Array.isArray(lista) ? lista : [];
  }
}
