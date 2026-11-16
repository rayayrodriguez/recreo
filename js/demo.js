// Datos inventados para ver la app sin conectarse a Séneca.
// Imita la forma de las respuestas reales.

const D1 = "900001", D2 = "900002";

const pad = (n) => String(n).padStart(2, "0");
const fecha = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const haceDias = (n, h = "10:00") => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${fecha(d)} ${h}`;
};
const dentroDe = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return fecha(d);
};
const espera = (ms = 350) => new Promise((r) => setTimeout(r, ms));

const HIJOS = [
  { enrollment: D1, simpleName: "Daniel", fullname: "Daniel Ejemplo Prueba", course: "5º de Educación Primaria", unity: "5ºA",
    tutor: "Martínez Ruiz, Carmen", description: "CEIP Ejemplo", centerCode: "23000000" },
  { enrollment: D2, simpleName: "Mario", fullname: "Mario Ejemplo Prueba", course: "2º de Educación Primaria", unity: "2ºB",
    tutor: "López Garrido, Elena", description: "CEIP Ejemplo", centerCode: "23000000" },
];

let mensajes = [
  { id: 501, id_message: 9501, enrollment: D1, isread: false, sender: "Martínez Ruiz, Carmen", subject: "Excursión al Castillo de Santa Catalina",
    body_message: "<p>Buenos días, familias:</p><p>El jueves que viene subimos al Castillo de Santa Catalina. Salimos a las 9:15 y volvemos para el comedor.</p><p>Que traigan desayuno, agua y calzado cómodo. La autorización está en el apartado de autorizaciones.</p><p>Un saludo,<br/>Carmen</p>",
    date: haceDias(0, "09:42"), has_adj: false },
  { id: 502, id_message: 9502, enrollment: D1, isread: false, sender: "Cobo Lara, Andrés", subject: "Material de Plástica",
    body_message: "Para la semana que viene necesitan una caja de zapatos vacía y témperas. Gracias.",
    date: haceDias(1, "17:05"), has_adj: true },
  { id: 503, id_message: 9503, enrollment: D1, isread: true, sender: "Martínez Ruiz, Carmen", subject: "Re: Tutoría del martes",
    body_message: "Perfecto, nos vemos el martes a las 18:00 en el aula de 5ºA.",
    date: haceDias(4, "12:30"), has_adj: false },
  { id: 504, id_message: 9504, enrollment: D1, isread: true, sender: "Dirección del centro", subject: "Calendario de evaluaciones",
    body_message: "Os recordamos que la primera evaluación termina el 19 de diciembre. Los boletines estarán disponibles en Pasen el día 22.",
    date: haceDias(9, "08:15"), has_adj: true },
  { id: 504, id_message: 9604, enrollment: D2, isread: false, sender: "Dirección del centro", subject: "Calendario de evaluaciones",
    body_message: "Os recordamos que la primera evaluación termina el 19 de diciembre. Los boletines estarán disponibles en Pasen el día 22.",
    date: haceDias(9, "08:15"), has_adj: true },
  { id: 601, id_message: 9701, enrollment: D2, isread: false, sender: "López Garrido, Elena", subject: "Lectura en casa",
    body_message: "Hola. Esta semana Mario ha leído muy bien en clase. Os pido que sigáis con los 15 minutos de lectura diaria en casa.\n\nGracias, Elena",
    date: haceDias(2, "13:50"), has_adj: false },
];

const conversaciones = {
  503: [
    { id: 503, subject: "Tutoría del martes", body_message: "Buenas tardes, Carmen. ¿Podríamos vernos el martes por la tarde para hablar de cómo va Daniel?",
      sender: "Tú", date: haceDias(5, "19:12"), enrollment: D1 },
    { id: 503, subject: "Re: Tutoría del martes", body_message: "Perfecto, nos vemos el martes a las 18:00 en el aula de 5ºA.",
      sender: "Martínez Ruiz, Carmen", date: haceDias(4, "12:30"), enrollment: D1 },
  ],
};

const enviados = [];
const avisosFalta = [];
const autorizaciones = [
  { aluatprotut: "AUT-D1", aluatpro: "P-1", enrollment: D1, motive: "Excursión al Castillo de Santa Catalina", signature: false,
    signaturePeriod: `${haceDias(2).slice(0, 10)} - ${dentroDe(2)}`, hasAmount: true },
];

const HORARIO = {
  [D1]: [
    ["Lengua", "Martínez Ruiz, Carmen"], ["Matemáticas", "Martínez Ruiz, Carmen"], ["Inglés", "Moreno Díaz, Laura"],
    ["Recreo", ""], ["Ciencias Naturales", "Martínez Ruiz, Carmen"], ["Educación Física", "Ortega Gil, Javier"],
  ],
  [D2]: [
    ["Lengua", "López Garrido, Elena"], ["Matemáticas", "López Garrido, Elena"], ["Música", "Serrano Peña, Isabel"],
    ["Recreo", ""], ["Inglés", "Moreno Díaz, Laura"], ["Plástica", "Cobo Lara, Andrés"],
  ],
};
const TRAMOS = ["9:00 - 9:45", "9:45 - 10:30", "10:30 - 11:15", "11:15 - 11:45", "11:45 - 12:45", "12:45 - 14:00"];
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function horarioDe(matricula) {
  const materias = HORARIO[matricula].filter(([m]) => m !== "Recreo");
  const filas = [];
  DIAS.forEach((dia, d) => {
    let i = d;
    TRAMOS.forEach((tramo, t) => {
      const [materia, prof] = t === 3 ? ["Recreo", ""] : materias[i++ % materias.length];
      filas.push({ day: dia, section: t + 1, hoursection: tramo, subject: materia, prof });
    });
  });
  return filas;
}

export class PasenDemo {
  constructor() {
    this.demo = true;
  }
  async entrar() {
    await espera();
    return { ok: true };
  }
  salir() {}
  async hijos() {
    await espera(200);
    return HIJOS.map((h) => ({
      matricula: h.enrollment, nombre: h.simpleName, completo: h.fullname, curso: h.course,
      grupo: h.unity, tutor: h.tutor, centro: h.description, codigoCentro: h.centerCode,
    }));
  }
  async mensajes(matricula, pagina = 1) {
    await espera();
    if (pagina > 1) return [];
    return mensajes.filter((m) => m.enrollment === matricula).map((m) => ({ ...m }));
  }
  async noLeidosPorHijo() {
    const c = {};
    for (const m of mensajes) if (!m.isread) c[m.enrollment] = (c[m.enrollment] || 0) + 1;
    return c;
  }
  async conversacion(id) {
    await espera(250);
    return conversaciones[id] || mensajes.filter((m) => m.id === id);
  }
  async marcarLeido(copia) {
    const m = mensajes.find((x) => x.id_message === copia.id_message);
    if (m) m.isread = true;
  }
  async destinatarios(matricula) {
    await espera(200);
    const h = HIJOS.find((x) => x.enrollment === matricula);
    return [
      { grupo: "Tutores/as de unidad", personas: [{ id: "1", nombre: `${h.tutor} (${h.unity})`, codigo: "T" }] },
      { grupo: "Equipo docente", personas: [
        { id: "2", nombre: "Moreno Díaz, Laura", codigo: "E" },
        { id: "3", nombre: "Ortega Gil, Javier", codigo: "E" },
        { id: "4", nombre: "Cobo Lara, Andrés", codigo: "E" },
      ] },
    ];
  }
  async enviarNuevo({ asunto, texto, para }) {
    await espera(600);
    enviados.unshift({ subject: asunto, body_message: texto, receiver: para.map((p) => p.nombre).join(", "), date: haceDias(0, new Date().toTimeString().slice(0, 5)) });
  }
  async responder(copia, texto) {
    await espera(600);
    const original = mensajes.find((m) => m.id_message === copia.id_message);
    enviados.unshift({ subject: `Re: ${original ? original.subject : ""}`, body_message: texto, receiver: original ? original.sender : "", date: haceDias(0, new Date().toTimeString().slice(0, 5)) });
    const conv = conversaciones[copia.id] || (conversaciones[copia.id] = mensajes.filter((m) => m.id === copia.id && m.enrollment === copia.enrollment).map((m) => ({ ...m })));
    conv.push({ id: copia.id, subject: "Respuesta", body_message: texto, sender: "Tú", date: haceDias(0, new Date().toTimeString().slice(0, 5)), enrollment: copia.enrollment });
  }
  async enviados() {
    await espera(250);
    return enviados.map((e) => ({ ...e }));
  }
  async horario(matricula) {
    await espera();
    return horarioDe(matricula);
  }
  async tutoria(matricula) {
    await espera(250);
    const h = HIJOS.find((x) => x.enrollment === matricula);
    return {
      tutorName: h.tutor, unity: h.unity,
      activitys: [{ day: "Martes", time_started: "18:00", time_end: "19:00", activity: "Atención a familias" }],
      teachingTeam: [
        { description: "Lengua, Matemáticas y Ciencias", teachers: h.tutor },
        { description: "Inglés", teachers: "Moreno Díaz, Laura" },
        { description: "Educación Física", teachers: "Ortega Gil, Javier" },
      ],
    };
  }
  async faltas(matricula) {
    await espera(250);
    if (matricula === D2) return [];
    return [{ section: "Noviembre", items: [
      { codeabsence: "A1", dateabsence: haceDias(6).slice(0, 10), section: "9:00 - 9:45", subject: "Lengua", codejustification: "J1", motive: "Enfermedad" },
      { codeabsence: "A2", dateabsence: haceDias(6).slice(0, 10), section: "9:45 - 10:30", subject: "Matemáticas", codejustification: "J1", motive: "Enfermedad" },
    ] }];
  }
  async tramosDia(matricula, dia) {
    await espera(250);
    const [d, m, a] = dia.split("/").map(Number);
    const semana = new Date(a, m - 1, d).getDay();
    if (semana === 0 || semana === 6) return [];
    return horarioDe(matricula).filter((t) => t.day === DIAS[semana - 1]).map((t) => ({ ...t, codesection: `${matricula}-${t.section}` }));
  }
  async avisarFalta({ matricula, desde, hasta, secciones, motivo }) {
    await espera(500);
    avisosFalta.unshift({ codenotification: Date.now(), enrollment: matricula, send_date: fecha(new Date()), start_date: desde, end_date: hasta || desde,
      observation: motivo, sections: (secciones || []).map((c) => ({ description: TRAMOS[+String(c).split("-")[1] - 1] })) });
  }
  async avisosFalta(matricula) {
    await espera(200);
    return avisosFalta.filter((a) => a.enrollment === matricula);
  }
  async retirarAvisoFalta(codigo) {
    await espera(300);
    const i = avisosFalta.findIndex((a) => a.codenotification === codigo);
    if (i >= 0) avisosFalta.splice(i, 1);
  }
  async autorizaciones(matricula) {
    await espera(200);
    return autorizaciones.filter((a) => a.enrollment === matricula);
  }
  async detalleAutorizacion(id) {
    await espera(250);
    const a = autorizaciones.find((x) => x.aluatprotut === id);
    return { motive: a.motive, description: "Salida a pie desde el colegio a las 9:15. Vuelta antes del comedor.", amount: a.hasAmount ? 3.5 : 0 };
  }
  async responderAutorizacion(a, autoriza) {
    await espera(500);
    const x = autorizaciones.find((y) => y.aluatprotut === a.aluatprotut);
    x.signature = true;
    x.answer = autoriza;
  }
  async documentosPendientes() {
    await espera(200);
    return [{ id: 42, description: "Autorización de uso de imágenes del alumnado", sendBy: "Dirección del centro", date: haceDias(3).slice(0, 10) }];
  }
  async notas(matricula) {
    await espera(250);
    const n = (materia, actividad, dias, nota, tipo = "Examen") => ({ materia, actividad, tipo, fecha: haceDias(dias).slice(0, 10), nota });
    if (matricula === D1) return [
      n("Matemáticas", "Examen tema 3: fracciones", 2, 8.5), n("Lengua", "Dictado", 6, 7), n("Inglés", "Unit 2 test", 13, 9.25),
      n("Ciencias Naturales", "Examen de las plantas", 20, 4.5), n("Matemáticas", "Examen tema 2", 34, 6),
    ];
    return [n("Lengua", "Lectura en voz alta", 4, "Sobresaliente", "Observación"), n("Matemáticas", "Sumas con llevadas", 15, 9)];
  }
  async avisos() {
    throw new Error("Los avisos no funcionan con los datos de ejemplo.");
  }
  async agenda() {
    await espera(250);
    return [
      { initdate: dentroDe(3), endDate: dentroDe(3), title: "Excursión al Castillo de Santa Catalina (5º)", category: "Actividad" },
      { initdate: dentroDe(12), endDate: dentroDe(12), title: "Día no lectivo", category: "Festivo" },
      { initdate: dentroDe(30), endDate: dentroDe(30), title: "Fin de la primera evaluación", category: "Evaluación" },
    ];
  }
}
