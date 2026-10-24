/* =====================================================================
   QUINIELA DE LA PEÑA · app.js
   - Datos de la peña: Supabase (usuarios, quinielas).
   - Partidos, pronóstico, resultados y premios de cada jornada: data/*.json
   ===================================================================== */
"use strict";
const CFG = window.PENA_CONFIG || {};
const TEMP = CFG.temporada || "2026/27";
const COSTE = Number(CFG.coste) || 12;
const NPART = 14;
const SIGNS = ["1", "X", "2"], GOLES = ["0", "1", "2", "M"];
const DEMO = !CFG.supabaseUrl || !CFG.supabaseKey;

/* ---------- utilidades ---------- */
function h(t, a, ...kids) {
  const e = document.createElement(t);
  if (a) for (const k in a) {
    const v = a[k]; if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "value" || k === "checked" || k === "disabled" || k === "selected") e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(9)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const eur = n => (n == null || isNaN(n)) ? "—" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const num1 = n => (n == null || isNaN(n)) ? "—" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fdate = s => { if (!s) return "—"; const [y, m, d] = String(s).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const parseMoney = s => { if (s === "" || s == null) return null; const v = parseFloat(String(s).replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isNaN(v) ? null : Math.round(v * 100) / 100; };
const normSigns = s => SIGNS.filter(x => (s || "").includes(x)).join("");
const clone = o => JSON.parse(JSON.stringify(o));
const round2 = n => Math.round(n * 100) / 100;
function fhora(s) {
  if (!s) return ""; const [d, t] = String(s).replace("T", " ").split(" ");
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }) + (t ? " " + t.slice(0, 5) : "");
}
function toast(msg) {
  const t = h("div", { class: "toast", role: "status" }, msg); document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- reducida de 7 dobles ----------
   Tabla oficial de Loterías (Reducción 2ª, BOE-A-2009-12204, norma 22.ª): 16 apuestas.
   Fila k = k-ésimo doble del boleto, de arriba abajo. "1" = primer signo del doble
   (en el orden 1, X, 2) y "X" = segundo signo. Garantiza 13 si los 14 caen dentro. */
const REDUCIDA_7D = ["11XXXX11XX11XX11", "11XXXX1111XX11XX", "11XX11XXXX1111XX", "11XX11XX11XXXX11",
  "1X1XX1X11X1X1X1X", "1X1X1X1XX1X11X1X", "1X1X1X1X1X1XX1X1"];
function columnas(q) {
  if (!q.partidos) return null;
  const sg = q.partidos.map(p => normSigns(p.signos));
  if (sg.some(s => !s)) return null;
  const dobles = sg.map((s, i) => s.length === 2 ? i : -1).filter(i => i >= 0);
  const triples = sg.filter(s => s.length === 3).length;
  if (triples === 0 && dobles.length === 7)
    return Array.from({ length: 16 }, (_, c) => sg.map((s, i) => { const k = dobles.indexOf(i); return k < 0 ? s : s[REDUCIDA_7D[k][c] === "1" ? 0 : 1]; }));
  let cols = [[]];
  for (const s of sg) { const nx = []; for (const c of cols) for (const ch of s) nx.push([...c, ch]); cols = nx; if (cols.length > 64) return null; }
  return cols;
}
function escrutar(q) {
  const cols = columnas(q); if (!cols) return null;
  const res = q.resultados || [];
  const n = res.filter(Boolean).length;
  const hits = cols.map(c => c.reduce((a, s, i) => a + (res[i] && s === res[i] ? 1 : 0), 0));
  const pl = q.pleno || {}, pr = q.pleno_res || {};
  const plenoOk = !!(pr.l && pr.v && pl.l === pr.l && pl.v === pr.v);
  const best = Math.max(...hits);
  const total = (best === 14 && plenoOk) ? 15 : best;
  const dist = {}; hits.forEach(x => dist[x] = (dist[x] || 0) + 1);
  return { cols, hits, best, total, dist, completo: n === NPART, n, plenoOk };
}
/* premio según el escrutinio oficial: 15 = 14 + pleno; 14, 13, 12, 11, 10 */
function calcPremio(e, premios) {
  if (!e || !premios) return null;
  let t = 0;
  for (const x of e.hits) {
    if (x === 14 && e.plenoOk) t += Number(premios["15"] || 0);
    else if (x >= 10) t += Number(premios[String(x)] || 0);
  }
  return round2(t);
}

/* ---------- capa de datos ---------- */
const toRow = r => ({ ...r, resultados: r.resultados || null, pleno_res: r.pleno_res || null, premio: r.premio == null ? null : Number(r.premio), coste: r.coste == null ? COSTE : Number(r.coste), fecha: r.fecha ? String(r.fecha).slice(0, 10) : "" });
const CAMPOS = ["temporada", "jornada", "fecha", "jugador", "estado", "partidos", "pleno", "resultados", "pleno_res", "aciertos", "premio", "coste", "nota", "cambios"];
const bodyOf = r => { const b = {}; for (const k of CAMPOS) if (k in r) b[k] = r[k] === "" && k === "fecha" ? null : r[k]; return b; };

const Real = {
  sb: null,
  init() { this.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } }); },
  async session() { const { data } = await this.sb.auth.getSession(); return data.session; },
  async login(usuario, pass) {
    const u = usuario.trim().toLowerCase();
    const email = u.includes("@") ? u : `${u}@${CFG.dominio}`;
    const { error } = await this.sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  },
  async logout() { await this.sb.auth.signOut(); },
  async cambiarPass(p) { const { error } = await this.sb.auth.updateUser({ password: p }); if (error) throw error; },
  async cargar() {
    const ses = await this.session();
    const [j, q] = await Promise.all([
      this.sb.from("jugadores").select("nombre,usuario,orden,admin,user_id").order("orden"),
      this.sb.from("quinielas").select("*").eq("temporada", TEMP).order("jornada")
    ]);
    if (j.error) throw j.error; if (q.error) throw q.error;
    const me = j.data.find(x => x.user_id && ses && x.user_id === ses.user.id);
    return {
      jugadores: j.data.map(x => ({ nombre: x.nombre, usuario: x.usuario, orden: x.orden, admin: x.admin, vinculado: !!x.user_id })),
      quinielas: q.data.map(toRow), yo: me ? me.nombre : null
    };
  },
  async guardar(r) {
    const b = bodyOf(r); b.actualizada = new Date().toISOString();
    const res = r.id ? await this.sb.from("quinielas").update(b).eq("id", r.id).select().single()
      : await this.sb.from("quinielas").insert(b).select().single();
    if (res.error) throw res.error;
    return toRow(res.data);
  },
  async borrar(r) { const { error } = await this.sb.from("quinielas").delete().eq("id", r.id); if (error) throw error; },
  suscribir(cb) {
    try { this.sb.channel("quinielas").on("postgres_changes", { event: "*", schema: "public", table: "quinielas" }, cb).subscribe(); } catch (e) { }
  }
};

const Demo = {
  yo: null,
  jug: [{ nombre: "CHONCHA", usuario: "choncha", orden: 1, admin: true, vinculado: true }, { nombre: "FEDE", usuario: "fede", orden: 2, admin: false, vinculado: true }, { nombre: "QUINO", usuario: "quino", orden: 3, admin: false, vinculado: true }],
  q: [[3, "2026-08-30", "CHONCHA", 12, 25.68], [4, "2026-09-06", "FEDE", 9, 0], [5, "2026-09-13", "QUINO", 8, 0], [6, "2026-09-16", "CHONCHA", 7, 0], [7, "2026-09-20", "FEDE", 10, 0], [8, "2026-10-11", "QUINO", 12, 3.91], [9, "2026-10-18", "CHONCHA", 12, 12.79]]
    .map(([j, f, p, a, pr], i) => ({ id: i + 1, temporada: TEMP, jornada: j, fecha: f, jugador: p, estado: "escrutada", aciertos: a, premio: pr, coste: COSTE, cambios: [], partidos: null, pleno: null, resultados: null, pleno_res: null, nota: null })),
  init() { }, async session() { return this.yo ? { demo: true } : null; },
  async login(u) { const n = this.jug.find(x => x.usuario === u.trim().toLowerCase()); if (!n) throw new Error("Invalid login credentials"); this.yo = n.nombre; },
  async logout() { this.yo = null; }, async cambiarPass() { },
  async cargar() { return { jugadores: clone(this.jug), quinielas: clone(this.q), yo: this.yo }; },
  async guardar(r) { const b = bodyOf(r); if (r.id) { const i = this.q.findIndex(x => x.id === r.id); this.q[i] = { ...this.q[i], ...b }; return clone(this.q[i]); } if (this.q.some(x => x.jornada === b.jornada)) throw { code: "23505" }; const n = { ...b, id: Date.now() }; this.q.push(n); return clone(n); },
  async borrar(r) { this.q = this.q.filter(x => x.id !== r.id); }, suscribir() { }
};
const API = DEMO ? Demo : Real;

/* ---------- estado ---------- */
const S = { fase: "carga", yo: null, jugadores: [], rows: [], jornadas: {}, tab: "jornada", newForm: null, msg: null, loginErr: null, busy: false, autoHecho: new Set() };
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });

const P = id => S.jugadores.find(p => p.nombre === id) || { nombre: id, usuario: String(id).toLowerCase(), orden: 9 };
const pname = id => { const u = P(id).usuario || ""; return u.charAt(0).toUpperCase() + u.slice(1); };
const orden = () => S.jugadores.slice().sort((a, b) => a.orden - b.orden).map(p => p.nombre);
const soyAdmin = () => !!(S.yo && P(S.yo).admin);
const puedoEscribir = jug => !!S.yo && (jug === S.yo || (soyAdmin() && !P(jug).vinculado));
const playerDot = (id, label) => h("span", { class: "chip p-" + id }, h("span", { class: "dot" }, pname(id)[0]), label ?? pname(id));

/* Con calendario de la peña (data/calendario.json): cada jornada tiene fecha y jugador fijos.
   La próxima es la primera del calendario sin quiniela cuyo domingo no haya pasado. */
const isoHoy = (dias = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); return ymd(d).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"); };
const calDe = j => (S.cal || []).find(c => c.jornada === Number(j)) || null;
function turno(rows) {
  if (S.cal && S.cal.length) {
    const jugadas = new Set(rows.map(r => r.jornada)), desde = isoHoy(-1);
    const c = S.cal.find(x => !jugadas.has(x.jornada) && x.fecha >= desde);
    return { cal: true, fin: !c, next: c ? c.jugador : null, jornada: c ? c.jornada : null, fecha: c ? c.fecha : "", abiertas: rows.filter(r => r.estado !== "escrutada"), last: rows[rows.length - 1] };
  }
  const ord = orden();
  const last = rows[rows.length - 1];
  const next = last ? ord[(ord.indexOf(last.jugador) + 1) % ord.length] : ord[0];
  let fecha = "";
  if (last && last.fecha) { const d = new Date(last.fecha + "T12:00:00"); d.setDate(d.getDate() + 7); fecha = d.toISOString().slice(0, 10); }
  return { next, jornada: last ? last.jornada + 1 : 1, fecha, abiertas: rows.filter(r => r.estado !== "escrutada"), last };
}

/* ---------- arranque ---------- */
async function arrancar() {
  try { API.init(); } catch (e) { S.fase = "error"; S.msg = "No se pudo conectar. Revisa config.js."; render(); return; }
  cargarJornadas();
  const ses = await API.session().catch(() => null);
  if (!ses) { S.fase = "login"; render(); return; }
  await entrar();
}
async function entrar() {
  S.fase = "carga"; render();
  try {
    await recargar();
    if (!S.yo && !DEMO) { S.fase = "login"; S.loginErr = "Tu usuario no está asociado a ningún jugador de la peña. Avisa a Choncha."; await API.logout(); render(); return; }
    S.fase = "app"; render();
    API.suscribir(() => programarRecarga());
    iniciarDirecto();
    autoEscrutinio();
  } catch (e) { S.fase = "login"; S.loginErr = "No se pudieron cargar los datos. Comprueba la conexión."; render(); }
}
async function recargar() {
  const d = await API.cargar();
  S.jugadores = d.jugadores; S.rows = d.quinielas.sort((a, b) => a.jornada - b.jornada); S.yo = d.yo;
}
let tRecarga = null;
function programarRecarga() { clearTimeout(tRecarga); tRecarga = setTimeout(async () => { try { await recargar(); render(); autoEscrutinio(); } catch (e) { } }, 400); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.fase === "app") { programarRecarga(); cargarJornadas(); } });

async function cargarJornadas() {
  try {
    const idx = await fetch("data/jornadas.json", { cache: "no-cache" }).then(r => r.json());
    const lista = (idx.jornadas || []).filter(j => j.temporada === TEMP);
    const docs = await Promise.all(lista.map(j => fetch(`data/${j.id}.json`, { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null)));
    const m = {}; docs.filter(Boolean).forEach(d => m[d.jornada] = d);
    S.jornadas = m;
    try { const cal = await fetch("data/calendario.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null); if (cal && cal.temporada === TEMP) S.cal = (cal.jornadas || []).slice().sort((a, b) => a.jornada - b.jornada); } catch (e) { }
    if (S.fase === "app") { render(); autoEscrutinio(); actualizarDirecto(); }
  } catch (e) { }
}

/* Cuando ya hay resultados (y premios) oficiales, la quiniela se escruta sola */
let autoCorriendo = false;
async function autoEscrutinio() {
  if (autoCorriendo || S.fase !== "app") return; autoCorriendo = true;
  try {
    for (const r of S.rows) {
      const J = S.jornadas[r.jornada];
      if (!J || !J.resultados || !r.partidos || !puedoEscribir(r.jugador)) continue;
      if (J.resultados.filter(Boolean).length !== NPART) continue;
      const necesitaRes = JSON.stringify(r.resultados || []) !== JSON.stringify(J.resultados) || (J.plenoRes && JSON.stringify(r.pleno_res || {}) !== JSON.stringify(J.plenoRes));
      const necesitaPremio = r.premio == null && !!J.premios;
      const clave = r.id + ":" + necesitaRes + necesitaPremio;
      if ((!necesitaRes && !necesitaPremio) || S.autoHecho.has(clave)) continue;
      S.autoHecho.add(clave);
      const d = clone(r);
      d.resultados = J.resultados.slice(); if (J.plenoRes) d.pleno_res = { ...J.plenoRes };
      const e = escrutar(d); if (!e) continue;
      const en = new Date().toISOString(); const log = [...(r.cambios || [])];
      if (necesitaRes || r.aciertos == null) { d.aciertos = e.total; log.push({ en, campo: "aciertos", de: r.aciertos ?? null, a: d.aciertos, auto: true }); }
      if (J.premios && r.premio == null) { d.premio = calcPremio(e, J.premios); log.push({ en, campo: "premio", de: null, a: d.premio, auto: true }); }
      d.estado = J.premios ? "escrutada" : (r.estado === "borrador" ? "sellada" : r.estado);
      d.cambios = log.slice(-40);
      try { await API.guardar(d); toast(`Jornada ${r.jornada} escrutada: ${e.total === 15 ? "14 + pleno" : e.total} aciertos`); } catch (err) { }
    }
    await recargar(); render();
  } finally { autoCorriendo = false; }
}

/* ---------- pantallas ---------- */
const TABS = [["jornada", "Jornada"], ["ranking", "Ranking"], ["historico", "Histórico"], ["reparto", "Reparto"]];
function render() {
  const app = document.getElementById("app");
  if (S.fase === "carga") { app.replaceChildren(h("div", { class: "login" }, h("p", { class: "muted" }, "Cargando la peña…"))); return; }
  if (S.fase === "error") { app.replaceChildren(h("div", { class: "login" }, h("div", { class: "card" }, h("h2", null, "Algo no va bien"), h("p", null, S.msg)))); return; }
  if (S.fase === "login") { app.replaceChildren(vistaLogin()); return; }

  const head = h("header", { class: "top" },
    h("div", { class: "brand" }, h("span", { class: "label" }, `${CFG.nombrePena || "La Peña"} · Temporada ${TEMP}`), h("h1", null, "Quiniela de la Peña")),
    h("div", { class: "who" }, S.yo ? playerDot(S.yo) : null, h("button", { class: "menu-btn", onclick: abrirMenu, "aria-label": "Abrir menú" }, "Menú")));
  const tabs = h("nav", { class: "tabs", role: "tablist" }, TABS.map(([k, l]) => h("button", { class: "tab", role: "tab", "aria-selected": S.tab === k ? "true" : "false", onclick: () => { S.tab = k; render(); window.scrollTo(0, 0); } }, l)));
  const parts = [];
  if (DEMO) parts.push(h("div", { class: "note" }, "Modo demostración: los cambios no se guardan. Cuando rellenes config.js con los datos de Supabase, la app funcionará de verdad."));
  if (S.msg) parts.push(h("div", { class: "note row spread" }, h("span", null, S.msg), h("button", { class: "link", onclick: () => { S.msg = null; render(); } }, "Cerrar")));
  const rows = S.rows;
  if (S.tab === "jornada") parts.push(...vistaJornada(rows));
  if (S.tab === "ranking") parts.push(...vistaRanking(rows));
  if (S.tab === "historico") parts.push(...vistaHistorico(rows));
  if (S.tab === "reparto") parts.push(...vistaReparto(rows));
  app.replaceChildren(h("div", { class: "wrap" }, head, tabs, h("main", { class: "stack", style: "gap:16px" }, parts)));
}

function vistaLogin() {
  let u = "", p = "";
  const go = async ev => {
    ev.preventDefault();
    if (!u.trim() || !p && !DEMO) { S.loginErr = "Escribe tu usuario y tu contraseña."; render(); return; }
    S.busy = true; S.loginErr = null; render();
    try { await API.login(u, p); S.busy = false; await entrar(); }
    catch (e) { S.busy = false; S.loginErr = /invalid/i.test(e && e.message || "") ? "Usuario o contraseña incorrectos." : "No se pudo entrar. Comprueba la conexión."; render(); }
  };
  return h("div", { class: "login" }, h("form", { class: "card", onsubmit: go },
    h("div", { class: "slip", "aria-hidden": "true" }, h("span", { class: "on" }, "1"), h("span", null, "X"), h("span", { class: "on" }, "2")),
    h("div", { class: "stack", style: "gap:4px" }, h("span", { class: "label" }, CFG.nombrePena || "La Peña"), h("h1", null, "Quiniela de la Peña")),
    h("p", { class: "muted" }, DEMO ? "Demostración: escribe choncha, fede o quino y cualquier contraseña." : "Entra con tu nombre de usuario (choncha, fede o quino) y tu contraseña."),
    h("label", null, h("span", { class: "label" }, "Usuario"), h("input", { id: "u", autocomplete: "username", autocapitalize: "none", autocorrect: "off", spellcheck: "false", placeholder: "fede", oninput: e => u = e.target.value })),
    h("label", null, h("span", { class: "label" }, "Contraseña"), h("input", { id: "p", type: "password", autocomplete: "current-password", oninput: e => p = e.target.value })),
    S.loginErr ? h("div", { class: "err" }, S.loginErr) : null,
    h("button", { class: "btn go block", type: "submit", disabled: S.busy }, S.busy ? "Entrando…" : "Entrar"),
    h("p", { class: "small muted" }, "¿Has olvidado la contraseña? Pídele a Choncha que te ponga una nueva.")));
}

/* ---------- pestaña Jornada ---------- */
function vistaJornada(rows) {
  const t = turno(rows); const out = [];
  for (const r of t.abiertas) {
    const J = S.jornadas[r.jornada];
    const empezada = J && J.cierre && new Date(J.cierre) < new Date();
    out.push(h("section", { class: "card stack" },
      h("div", { class: "row spread" },
        h("div", { class: "row" }, h("h2", null, `Jornada ${r.jornada}`), h("span", { class: "pill st-" + r.estado }, r.estado)),
        h("div", { class: "row" }, playerDot(r.jugador), h("span", { class: "muted small" }, fdate(r.fecha)))),
      r.estado === "borrador" && empezada ? h("div", { class: "note" }, "La jornada ya ha empezado y este boleto sigue en borrador. Si ya lo sellaste, márcalo como sellado.") : null,
      r.estado === "sellada" && !(J && J.resultados) ? h("p", { class: "muted small" }, "Cuando estén los resultados oficiales, la app la escruta sola y apunta el premio.") : null,
      r.partidos ? boletoVista(r) : h("p", { class: "muted" }, "Todavía sin partidos."),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => abrirQuiniela(r) }, puedoEscribir(r.jugador) ? (r.estado === "borrador" ? "Seguir rellenando" : "Ver o corregir") : "Ver detalle"))));
  }
  // próxima quiniela
  if (t.cal) { out.push(...proximaCalendario(t)); return out.concat(pronosticoActual(t)); }
  const libre = !P(t.next).vinculado;
  const opciones = orden().filter(n => n === S.yo || (soyAdmin() && !P(n).vinculado));
  const key = t.jornada + t.next;
  if (!S.newForm || S.newForm._k !== key) {
    const J = S.jornadas[t.jornada];
    S.newForm = { _k: key, jornada: t.jornada, fecha: (J && J.fecha) || t.fecha, jugador: opciones.includes(t.next) ? t.next : (opciones[0] || t.next) };
  }
  const nf = S.newForm;
  const meToca = t.next === S.yo || (soyAdmin() && libre);
  out.push(h("section", { class: "card stack p-" + t.next },
    h("div", { class: "turn" }, h("div", { class: "big" }, pname(t.next)[0]),
      h("div", null, h("div", { class: "label" }, "Próxima quiniela"), h("h2", null, t.next === S.yo ? "Te toca a ti" : `Le toca a ${pname(t.next)}`),
        h("div", { class: "muted small" }, t.last ? `La última fue la jornada ${t.last.jornada} (${pname(t.last.jugador)}).` : "Primera quiniela de la temporada."))),
    meToca ? h("div", { class: "stack" },
      h("div", { class: "fields" },
        h("label", null, h("span", { class: "label" }, "Jornada"), h("input", { id: "nf-j", type: "number", inputmode: "numeric", min: "1", max: "80", value: nf.jornada, oninput: e => nf.jornada = parseInt(e.target.value) || "" })),
        h("label", null, h("span", { class: "label" }, "Fecha"), h("input", { id: "nf-f", type: "date", value: nf.fecha, oninput: e => nf.fecha = e.target.value })),
        opciones.length > 1 ? h("label", null, h("span", { class: "label" }, "Jugador"), h("select", { id: "nf-p", onchange: e => nf.jugador = e.target.value }, opciones.map(n => h("option", { value: n, selected: nf.jugador === n }, pname(n))))) : null),
      h("p", { class: "muted small" }, S.jornadas[nf.jornada] ? "El boleto empieza con el pronóstico ya marcado; cambia lo que quieras." : "Si una jornada no la jugáis, cambia el número: el turno sigue igual."),
      h("div", { class: "row" }, h("button", { class: "btn go", onclick: crearQuiniela }, "Empezar quiniela")))
      : h("p", { class: "muted" }, `Cuando ${pname(t.next)} la rellene, la verás aquí. Mientras tanto puedes mirar el pronóstico.`)));
  return out.concat(pronosticoActual(t));
}
/* El boleto que propuso la app para una jornada, escrutado con los resultados oficiales o, si aún no hay, con los del directo */
function escrutinioApp(J) {
  if (!J || !J.partidos) return null;
  const L = J.resultados ? null : S.live[J.jornada];
  const resultados = J.resultados || (L ? L.items.map(x => (x && x.signo) || "") : null);
  if (!resultados || !resultados.some(Boolean)) return null;
  const q = { partidos: J.partidos.map(p => ({ signos: p.sugerido })), pleno: J.pleno, resultados, pleno_res: J.plenoRes || (L && L.pleno && L.pleno.goles) || {} };
  const e = escrutar(q); if (!e) return null;
  return { e, oficial: !!J.resultados, premio: J.resultados && J.premios && e.completo ? calcPremio(e, J.premios) : null };
}
function lineaApp(J) {
  const a = escrutinioApp(J); if (!a) return null;
  const ac = a.e.total === 15 ? "14 + pleno" : a.e.best;
  return h("div", { class: "note" + (a.oficial ? " good" : "") + " small" }, h("b", null, "Boleto de la app: "),
    a.oficial ? `${ac} aciertos` + (a.premio != null ? ` · habría cobrado ${eur(a.premio)}` : "") : `si acabara ahora, ${ac} aciertos (${a.e.n}/14 con marcador)`);
}
function pronosticoActual(t) {
  const jn = (t.abiertas[0] || {}).jornada;
  const J = S.jornadas[jn] || S.jornadas[t.jornada] || S.jornadas[Math.max(0, ...Object.keys(S.jornadas).map(Number))];
  return J ? [tarjetaPronostico(J)] : [];
}
function proximaCalendario(t) {
  if (t.fin) return [h("section", { class: "card stack" }, h("h2", null, "Temporada terminada"), h("p", { class: "muted" }, "No quedan jornadas en el calendario de la peña."))];
  const key = "cal" + t.jornada;
  if (!S.newForm || S.newForm._k !== key) S.newForm = { _k: key, jornada: t.jornada, fecha: t.fecha, jugador: t.next };
  const nf = S.newForm;
  const meToca = puedoEscribir(t.next);
  const sig = S.cal.filter(c => c.jornada > t.jornada).slice(0, 3);
  return [h("section", { class: "card stack p-" + t.next },
    h("div", { class: "turn" }, h("div", { class: "big" }, pname(t.next)[0]),
      h("div", null, h("div", { class: "label" }, `Próxima quiniela · Jornada ${t.jornada} · ${fdate(t.fecha)}`), h("h2", null, t.next === S.yo ? "Te toca a ti" : `Le toca a ${pname(t.next)}`),
        h("div", { class: "muted small" }, "Turnos según el calendario de la peña. ", sig.length ? "Después: " + sig.map(c => `J${c.jornada} ${pname(c.jugador)}`).join(" · ") + "." : ""))),
    meToca ? h("div", { class: "stack" },
      h("p", { class: "muted small" }, S.jornadas[t.jornada] ? "El boleto empieza con el pronóstico ya marcado; cambia lo que quieras." : "El pronóstico de esta jornada aún no está cargado; puedes empezar el boleto a mano o esperar a que salga."),
      h("div", { class: "row" }, h("button", { class: "btn go", onclick: crearQuiniela }, "Empezar quiniela")))
      : h("p", { class: "muted" }, `Cuando ${pname(t.next)} la rellene, la verás aquí. Mientras tanto puedes mirar el pronóstico.`))];
}

function tarjetaPronostico(J) {
  const conf = { alta: "fijo seguro", media: "favorito", baja: "abierto" };
  const res = J.resultados || [];
  const L = J.resultados ? null : S.live[J.jornada];
  const lines = J.partidos.map((p, i) => h("div", { class: "pr" },
    h("div", { class: "n" }, i + 1),
    h("div", { class: "m" },
      h("div", null, h("b", null, p.local), " – ", h("b", null, p.visitante), h("span", { class: "muted small" }, "  " + fhora(p.hora))),
      chipDirecto(L && L.items[i]),
      h("div", { class: "bar", "aria-hidden": "true" }, h("i", { class: "b1", style: `width:${p.p1}%` }), h("i", { class: "bx", style: `width:${p.pX}%` }), h("i", { class: "b2", style: `width:${p.p2}%` })),
      h("div", { class: "pct" }, h("span", null, "1 ", h("b", null, p.p1 + "%")), h("span", null, "X ", h("b", null, p.pX + "%")), h("span", null, "2 ", h("b", null, p.p2 + "%")))),
    h("div", { class: "stack", style: "gap:4px;align-items:flex-end" },
      h("div", { class: "signs-mini" }, SIGNS.map(x => h("span", { class: "box" + (p.sugerido.includes(x) ? " on" : "") + (res[i] === x && p.sugerido.includes(x) ? " hit" : "") }, x)),
        res[i] ? [h("span", { class: "sep" }), h("span", { class: "box res on", title: "Resultado" }, res[i])]
          : (L && L.items[i] && L.items[i].signo) ? [h("span", { class: "sep" }), h("span", { class: "box res live " + (p.sugerido.includes(L.items[i].signo) ? "ok" : "ko"), title: "Resultado provisional" }, L.items[i].signo)] : null),
      h("span", { class: "pill cf-" + p.confianza }, conf[p.confianza] || p.confianza)),
    h("div", { class: "sub" }, p.nota, p.publico ? " Apuestas de la gente: " + p.publico + "." : "")));
  const pl = J.pleno, plr = J.plenoRes;
  lines.push(h("div", { class: "pr p15" },
    h("div", { class: "n" }, "15"),
    h("div", { class: "m" }, h("div", null, h("b", null, pl.local), " – ", h("b", null, pl.visitante), h("span", { class: "muted small" }, "  " + fhora(pl.hora))), chipDirecto(L && L.pleno), h("span", { class: "label" }, "Pleno al 15")),
    h("div", { class: "signs-mini" }, h("span", { class: "box on" }, pl.l), h("span", { class: "box on" }, pl.v), plr ? [h("span", { class: "sep" }), h("span", { class: "box res on" }, plr.l), h("span", { class: "box res on" }, plr.v)] : null),
    h("div", { class: "sub" }, pl.nota)));
  return h("section", { class: "card stack" },
    h("div", { class: "stack", style: "gap:2px" },
      h("span", { class: "label" }, `Jornada ${J.jornada}` + (J.jornadaOficial ? ` · nº ${J.jornadaOficial} de Loterías` : "") + (J.cierre ? ` · cierra ${fhora(J.cierre)}` : "")),
      h("h2", null, J.resultados ? "Partidos, pronóstico y resultados" : "Partidos y pronóstico")),
    h("p", { class: "small" }, J.resumen),
    h("p", { class: "small muted" }, "Cada barra reparte la probabilidad del 1 (verde), la X (gris) y el 2 (azul). Las casillas negras son el boleto propuesto."),
    J.premios ? h("div", { class: "note good small" }, "Premios oficiales por columna: ", ["15", "14", "13", "12", "11", "10"].filter(k => J.premios[k] != null).map(k => `${k === "15" ? "14+P" : k}: ${eur(J.premios[k])}`).join(" · ")) : null,
    L ? avisoDirecto(L) : null,
    lineaApp(J),
    h("div", null, lines),
    J.fuentes ? h("div", { class: "small muted" }, "Datos: ", J.fuentes.map((u, i) => [i ? " · " : "", h("a", { href: u, target: "_blank", rel: "noopener", style: "color:inherit" }, new URL(u).hostname.replace("www.", ""))])) : null);
}

function crearQuiniela() {
  const nf = S.newForm; const j = parseInt(nf.jornada);
  if (!j || j < 1) { S.msg = "Pon un número de jornada válido."; render(); return; }
  if (S.rows.some(r => r.jornada === j)) { S.msg = `La jornada ${j} ya tiene quiniela.`; render(); return; }
  const J = S.jornadas[j];
  const row = {
    temporada: TEMP, jornada: j, fecha: nf.fecha || (J && J.fecha) || "", jugador: nf.jugador, coste: COSTE, estado: "borrador",
    partidos: J ? J.partidos.map(p => ({ local: p.local, visitante: p.visitante, signos: p.sugerido })) : Array.from({ length: NPART }, () => ({ local: "", visitante: "", signos: "" })),
    pleno: J ? { local: J.pleno.local, visitante: J.pleno.visitante, l: J.pleno.l, v: J.pleno.v } : { local: "", visitante: "", l: "", v: "" },
    resultados: Array(NPART).fill(""), pleno_res: { l: "", v: "" }, aciertos: null, premio: null, cambios: [], nota: null
  };
  abrirQuiniela(row, true);
}

function conDirecto(r0) {
  const L = S.live[r0.jornada];
  const oficial = (r0.resultados || []).some(Boolean);
  const r = (!oficial && L && r0.partidos) ? { ...r0, resultados: L.items.map(x => (x && x.signo) || ""), pleno_res: L.pleno && L.pleno.goles ? L.pleno.goles : (r0.pleno_res || {}) } : r0;
  return { r, L, enDirecto: r !== r0 };
}
/* Partidos acertados dentro del boleto (aunque la combinación no esté entre las 16 columnas) */
function partidosDentro(r) {
  const res = r.resultados || [];
  return r.partidos.reduce((a, p, i) => a + (res[i] && normSigns(p.signos).includes(res[i]) ? 1 : 0), 0);
}
function resumenEscrutinio(r, e, enDirecto) {
  const dentro = partidosDentro(r);
  const out = [h("div", { class: "counter" },
    enDirecto ? h("span", { class: "pill live-pill" }, "En directo") : null,
    h("span", null, "Con resultado ", h("b", null, `${e.n}/14`)),
    h("span", null, "Partidos acertados ", h("b", null, dentro)),
    h("span", null, enDirecto ? "Cuenta ahora (mejor columna) " : "Cuenta (mejor columna) ", h("b", { class: "ok" }, e.total === 15 ? "14 + pleno" : e.best)))];
  if (dentro > e.best) out.push(h("p", { class: "small muted" }, `Has acertado ${dentro} partidos, pero en la reducida solo cuenta la mejor de las 16 columnas: ${e.best}. Con 7 dobles no se juegan las 128 combinaciones, así que a veces la combinación de dobles que ha salido no está en ninguna columna.`));
  return out;
}
function boletoVista(r0) {
  const { r, L, enDirecto } = conDirecto(r0);
  const res = r.resultados || [];
  const g = h("div", { class: "boleto" });
  r.partidos.forEach((p, i) => {
    const s = normSigns(p.signos);
    g.append(h("div", { class: "b-row" + (s.length === 2 ? " dbl" : "") },
      h("div", { class: "b-n" }, i + 1),
      h("div", { class: "b-teams" }, h("span", null, p.local || "—"), h("span", null, p.visitante || "—"), enDirecto ? estadoMini(L.items[i]) : null),
      h("div", { class: "b-signs" }, SIGNS.map(x => h("span", { class: "box" + (s.includes(x) ? " on" : "") + (res[i] === x && s.includes(x) ? " hit" : "") }, x)),
        h("span", { class: "sep" }), h("span", { class: "box res" + (res[i] ? (enDirecto ? (s.includes(res[i]) ? " live ok" : " live ko") : " on") : ""), title: enDirecto ? "Resultado provisional" : "Resultado" }, res[i] || "·"))));
  });
  const pl = r.pleno || {}, pr = r.pleno_res || {};
  g.append(h("div", { class: "b-row p15" }, h("div", { class: "b-n" }, "15"),
    h("div", { class: "b-teams" }, h("span", null, pl.local || "—"), h("span", null, pl.visitante || "—"), enDirecto ? estadoMini(L.pleno) : null),
    h("div", { class: "b-signs" }, h("span", { class: "box on" }, pl.l || "·"), h("span", { class: "box on" }, pl.v || "·"), h("span", { class: "sep" }),
      h("span", { class: "box res" + (pr.l ? (enDirecto ? (pr.l === pl.l ? " live ok" : " live ko") : " on") : "") }, pr.l || "·"), h("span", { class: "box res" + (pr.v ? (enDirecto ? (pr.v === pl.v ? " live ok" : " live ko") : " on") : "") }, pr.v || "·"))));
  const e = escrutar(r);
  const ap = escrutinioApp(S.jornadas[r0.jornada]);
  if (!e || !e.n) return h("div", { class: "stack" }, g);
  S.colsOpen = S.colsOpen || {};
  const k = r0.id || r0.jornada, abierto = !!S.colsOpen[k];
  return h("div", { class: "stack" }, g, ...resumenEscrutinio(r, e, enDirecto),
    h("div", { class: "row spread" },
      ap ? h("span", { class: "small muted" }, "El boleto de la app llevaría ", h("b", null, ap.e.total === 15 ? "14 + pleno" : ap.e.best)) : h("span"),
      h("button", { class: "link", onclick: () => { S.colsOpen[k] = !abierto; render(); } }, abierto ? "Ocultar columnas" : "Ver las 16 columnas")),
    abierto ? tablaColumnas(r, e) : null);
}

/* ---------- ventana de una quiniela ---------- */
let M = null;
function abrirQuiniela(row, nueva) { M = { row, draft: clone(row), nueva: !!nueva, showCols: false, confirmDel: false, err: null, busy: false, paste: "" }; pintarModal(); }
function cerrarModal() { M = null; document.getElementById("modalRoot").replaceChildren(); document.body.style.overflow = ""; }
function pintarModal() {
  const root = document.getElementById("modalRoot");
  if (!M) { root.replaceChildren(); return; }
  const prevScroll = root.querySelector(".ov")?.scrollTop || 0;
  const d = M.draft; const ed = puedoEscribir(d.jugador);
  const J = S.jornadas[d.jornada];
  const editBoleto = ed && d.estado === "borrador" && !!d.partidos;
  const vista = d.partidos && d.estado !== "borrador" ? conDirecto(d) : { r: d, enDirecto: false };
  // Los resultados solo se tocan a mano si no hay datos oficiales ni marcadores en directo
  const editRes = ed && d.estado !== "borrador" && !!d.partidos && !(J && J.resultados) && !vista.enDirecto;
  const sg = d.partidos ? d.partidos.map(p => normSigns(p.signos)) : [];
  const nD = sg.filter(s => s.length === 2).length, nT = sg.filter(s => s.length === 3).length, nVac = sg.filter(s => !s).length;
  const e = d.partidos ? escrutar(vista.r) : null;
  if (!d.resultados) d.resultados = Array(NPART).fill("");
  if (!d.pleno_res) d.pleno_res = { l: "", v: "" };

  const body = h("div", { class: "m-body" });
  if (d.nota) body.append(h("div", { class: "note" }, d.nota));
  if (!ed) body.append(h("p", { class: "muted small" }, `Solo ${pname(d.jugador)} puede modificar esta quiniela.`));
  else if (d.partidos && d.estado !== "borrador") body.append(h("p", { class: "muted small" }, "Boleto sellado: los signos ya no se pueden cambiar ni se puede borrar la quiniela."));

  if (d.partidos) {
    if (editBoleto) {
      body.append(h("div", { class: "counter" },
        h("span", { class: nD === 7 ? "ok" : "bad" }, "Dobles ", h("b", null, `${nD}/7`)),
        nT ? h("span", { class: "bad" }, "Triples ", h("b", null, nT)) : null,
        nVac ? h("span", { class: "bad" }, "Sin marcar ", h("b", null, nVac)) : null,
        h("span", { class: "muted" }, `16 apuestas · ${eur(COSTE)}`)));
      body.append(h("p", { class: "small muted" }, "Toca 1, X o 2 para marcar o desmarcar. Tiene que haber 7 partidos con doble y 7 con un solo signo."));
      const extra = h("div", { class: "row" });
      if (J) extra.append(h("button", { class: "btn alt", onclick: () => { d.partidos.forEach((p, i) => p.signos = J.partidos[i].sugerido); d.pleno.l = J.pleno.l; d.pleno.v = J.pleno.v; pintarModal(); } }, "Volver al pronóstico"));
      extra.append(h("details", { style: "flex:1;min-width:220px" }, h("summary", { class: "small", style: "cursor:pointer" }, "Pegar los 15 partidos de golpe"),
        h("div", { class: "stack", style: "margin-top:8px" },
          h("textarea", { id: "paste", rows: "6", placeholder: "Un partido por línea, por ejemplo:\nReal Madrid - Getafe\nBetis - Sevilla", oninput: ev => M.paste = ev.target.value }, M.paste),
          h("div", null, h("button", { class: "btn alt", onclick: pegarPartidos }, "Rellenar partidos")))));
      body.append(extra);
    }
    const g = h("div", { class: "boleto" });
    d.partidos.forEach((p, i) => {
      const s = normSigns(p.signos); const r = (vista.r.resultados || [])[i]; const jp = J && J.partidos[i];
      g.append(h("div", { class: "b-row" + (s.length === 2 ? " dbl" : "") },
        h("div", { class: "b-n" }, i + 1),
        h("div", { class: "b-teams" }, editBoleto && !J ? h("div", { class: "teams-in" },
          h("input", { id: `l${i}`, placeholder: "Local", value: p.local, "aria-label": `Local partido ${i + 1}`, oninput: ev => p.local = ev.target.value }),
          h("input", { id: `v${i}`, placeholder: "Visitante", value: p.visitante, "aria-label": `Visitante partido ${i + 1}`, oninput: ev => p.visitante = ev.target.value }))
          : [h("span", null, p.local || "—"), h("span", null, p.visitante || "—")],
          editBoleto && jp ? h("span", { class: "ai" }, `Pronóstico ${jp.sugerido} · ${jp.p1}/${jp.pX}/${jp.p2}`) : null),
        h("div", { class: "b-signs" },
          SIGNS.map(x => h("button", {
            class: "box" + (s.includes(x) ? " on" : "") + (r === x && s.includes(x) ? " hit" : ""), disabled: !editBoleto, "aria-pressed": s.includes(x) ? "true" : "false", "aria-label": `Signo ${x} partido ${i + 1}`,
            onclick: () => { p.signos = s.includes(x) ? s.replace(x, "") : normSigns(s + x); pintarModal(); }
          }, x)),
          d.estado !== "borrador" ? [h("span", { class: "sep" }),
          h("button", {
            class: "box res" + (r ? (vista.enDirecto ? (s.includes(r) ? " live ok" : " live ko") : " on") : ""), disabled: !editRes, title: vista.enDirecto ? "Resultado provisional" : "Resultado", "aria-label": `Resultado partido ${i + 1}`,
            onclick: () => { const cyc = ["", "1", "X", "2"]; d.resultados[i] = cyc[(cyc.indexOf(r || "") + 1) % 4]; autoAciertos(); pintarModal(); }
          }, r || "·")] : null)));
    });
    const pl = d.pleno, pr = d.pleno_res;
    const golSel = (obj, k, dis, lab) => h("select", { "aria-label": lab, disabled: dis, onchange: ev => { obj[k] = ev.target.value; autoAciertos(); pintarModal(); } },
      h("option", { value: "" }, "·"), GOLES.map(x => h("option", { value: x, selected: obj[k] === x }, x)));
    g.append(h("div", { class: "b-row p15" }, h("div", { class: "b-n" }, "15"),
      h("div", { class: "b-teams" }, editBoleto && !J ? h("div", { class: "teams-in" },
        h("input", { id: "pl-l", placeholder: "Pleno: local", value: pl.local, oninput: ev => pl.local = ev.target.value }),
        h("input", { id: "pl-v", placeholder: "Pleno: visitante", value: pl.visitante, oninput: ev => pl.visitante = ev.target.value }))
        : [h("span", null, pl.local || "—"), h("span", null, pl.visitante || "—")]),
      h("div", { class: "b-signs" }, golSel(pl, "l", !editBoleto, "Goles local pleno"), golSel(pl, "v", !editBoleto, "Goles visitante pleno"),
        d.estado !== "borrador" ? [h("span", { class: "sep" }), golSel(pr, "l", !editRes, "Resultado goles local"), golSel(pr, "v", !editRes, "Resultado goles visitante")] : null)));
    body.append(g);
    if (editRes) body.append(h("p", { class: "muted small" }, "La casilla de la derecha es el resultado real. Se rellena sola cuando salen los resultados oficiales; mientras no los haya, puedes tocarla para ir cambiando entre 1, X y 2."));
    if (e && e.n) {
      body.append(...resumenEscrutinio(vista.r, e, vista.enDirecto));
      body.append(h("div", null, h("button", { class: "link", onclick: () => { M.showCols = !M.showCols; pintarModal(); } }, M.showCols ? "Ocultar columnas" : `Ver las ${e.cols.length} columnas`)));
      if (M.showCols) body.append(tablaColumnas(vista.r, e));
      if (J && J.premios && e.completo) body.append(h("p", { class: "small" }, `Según los premios oficiales, este boleto cobra ${eur(calcPremio(e, J.premios))}.`));
    }
  } else {
    body.append(h("p", { class: "muted" }, "Quiniela importada del Excel: solo hay aciertos y premio, sin boleto."));
  }

  body.append(h("div", { class: "fields" },
    h("label", null, h("span", { class: "label" }, "Fecha"), h("input", { id: "m-f", type: "date", value: d.fecha || "", disabled: !ed, oninput: ev => d.fecha = ev.target.value })),
    h("label", null, h("span", { class: "label" }, "Aciertos"), h("input", { id: "m-a", type: "number", inputmode: "numeric", min: "0", max: "15", value: d.aciertos ?? "", disabled: !ed || !!d.partidos, oninput: ev => d.aciertos = ev.target.value === "" ? null : Math.max(0, Math.min(15, parseInt(ev.target.value))) })),
    h("label", null, h("span", { class: "label" }, "Premio cobrado (€)"), h("input", { id: "m-p", inputmode: "decimal", value: d.premio == null ? "" : String(d.premio).replace(".", ","), disabled: !ed || !!(d.partidos && J && J.premios), placeholder: "0,00", oninput: ev => d.premio = parseMoney(ev.target.value) }))));

  if (d.cambios && d.cambios.length) {
    body.append(h("details", null, h("summary", { class: "small muted", style: "cursor:pointer" }, `Cambios registrados (${d.cambios.length})`),
      h("div", { class: "log", style: "margin-top:6px" }, d.cambios.slice().reverse().map(c => h("div", null,
        `${new Date(c.en).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} · ${c.campo}: ${fmtVal(c.campo, c.de)} → ${fmtVal(c.campo, c.a)}${c.auto ? " (automático)" : ""}`)))));
  }
  if (M.err) body.append(h("div", { class: "err" }, M.err));

  const foot = h("div", { class: "m-foot" });
  if (ed && !M.nueva && (d.estado === "borrador" || !d.partidos)) foot.append(M.confirmDel ? h("button", { class: "btn danger", onclick: borrar }, "Sí, eliminarla") : h("button", { class: "btn danger", onclick: () => { M.confirmDel = true; pintarModal(); } }, "Eliminar"));
  foot.append(h("span", { style: "flex:1" }));
  foot.append(h("button", { class: "btn alt", onclick: cerrarModal }, ed ? "Cancelar" : "Cerrar"));
  if (ed) {
    if (d.estado === "borrador" && d.partidos) {
      foot.append(h("button", { class: "btn alt", disabled: M.busy, onclick: () => guardar() }, "Guardar borrador"));
      foot.append(h("button", { class: "btn go", disabled: M.busy, onclick: sellar }, "Ya la he sellado"));
    }
    if (d.estado !== "borrador" || !d.partidos) foot.append(h("button", { class: "btn go", disabled: M.busy, onclick: () => guardar() }, "Guardar"));
  }
  const modal = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": `Jornada ${d.jornada}` },
    h("div", { class: "m-head" },
      h("div", { class: "stack", style: "gap:4px" }, h("div", { class: "label" }, M.nueva ? "Nueva quiniela" : "Quiniela"), h("h2", null, `Jornada ${d.jornada}`)),
      h("div", { class: "row" }, playerDot(d.jugador), h("span", { class: "pill st-" + d.estado }, d.estado))),
    body, foot);
  const ov = h("div", { class: "ov", onclick: ev => { if (ev.target === ov) cerrarModal(); } }, modal);
  root.replaceChildren(ov); ov.scrollTop = prevScroll; document.body.style.overflow = "hidden";
}
function fmtVal(c, v) { if (v == null || v === "") return "—"; if (c === "premio") return eur(v); if (c === "fecha") return fdate(v); return v; }
function tablaColumnas(d, e) {
  const res = d.resultados || [];
  // Columnas ordenadas de más a menos aciertos (a igualdad, por su número); arriba, su número original
  const orden = e.cols.map((_, k) => k).sort((x, y) => e.hits[y] - e.hits[x] || x - y);
  const t = h("table", { class: "cols" });
  t.append(h("tr", null, h("th", null, "Col."), orden.map(k => h("th", null, k + 1))));
  t.append(h("tr", { class: "tot" }, h("th", null, "Ac."), orden.map(k => h("td", { class: "tot-c" + (e.hits[k] === e.best ? " best" : "") }, e.hits[k]))));
  for (let i = 0; i < NPART; i++) t.append(h("tr", null, h("th", null, i + 1), orden.map(k => { const s = e.cols[k][i]; const cls = res[i] ? (s === res[i] ? " hit" : " miss") : ""; return h("td", { class: "c" + cls }, s); })));
  return h("div", { class: "stack", style: "gap:6px" }, h("p", { class: "small muted" }, "Columnas ordenadas de más a menos aciertos; encima, el número de cada columna en el boleto. Verde: acierto; rojo: fallo; gris: partido sin resultado todavía."), h("div", { class: "tw" }, t));
}
function autoAciertos() { const d = M.draft; const e = escrutar(d); if (e && e.n) d.aciertos = e.total; }
function pegarPartidos() {
  const lines = (M.paste || "").split(/\n+/).map(l => l.replace(/^\s*\d+[\.\)\-\s]+/, "").trim()).filter(Boolean);
  lines.slice(0, 15).forEach((l, i) => {
    const m = l.split(/\s+[-–—]\s+|\s+vs\.?\s+|\s*-\s*/i);
    const loc = (m[0] || "").trim(), vis = (m.slice(1).join(" ") || "").trim();
    if (i < NPART) { M.draft.partidos[i].local = loc; M.draft.partidos[i].visitante = vis; } else { M.draft.pleno.local = loc; M.draft.pleno.visitante = vis; }
  });
  M.paste = ""; pintarModal();
}
function validarBoleto(d) {
  const sg = d.partidos.map(p => normSigns(p.signos));
  if (d.partidos.some(p => !String(p.local).trim() || !String(p.visitante).trim())) return "Faltan equipos por rellenar.";
  if (sg.some(s => !s)) return "Hay partidos sin signo.";
  if (sg.some(s => s.length === 3)) return "La reducida de 7 dobles no admite triples.";
  const n = sg.filter(s => s.length === 2).length; if (n !== 7) return `Tienes ${n} dobles; la reducida necesita exactamente 7.`;
  if (!d.pleno.l || !d.pleno.v) return "Falta marcar el Pleno al 15.";
  return null;
}
function sellar() { const err = validarBoleto(M.draft); if (err) { M.err = err; pintarModal(); return; } M.draft.estado = "sellada"; guardar(); }
async function guardar(seguirAbierta) {
  const d = M.draft, o = M.row; M.busy = true; M.err = null; pintarModal();
  try {
    if (d.partidos && d.estado !== "borrador") {
      const e = escrutar(d); const plenoListo = d.pleno_res && d.pleno_res.l && d.pleno_res.v;
      d.estado = (e && e.completo && plenoListo) ? "escrutada" : "sellada";
    }
    if (!d.partidos && d.aciertos != null) d.estado = "escrutada";
    const log = [...(o.cambios || [])];
    if (!M.nueva) {
      const en = new Date().toISOString();
      for (const f of ["fecha", "aciertos", "premio", "estado"]) if ((o[f] ?? null) !== (d[f] ?? null)) log.push({ en, campo: f, de: o[f] ?? null, a: d[f] ?? null });
    }
    d.cambios = log.slice(-40);
    await API.guardar(d);
    toast(M.nueva ? "Quiniela creada" : "Guardado");
    if (seguirAbierta) { M.row = clone(d); M.busy = false; pintarModal(); } else cerrarModal();
    await recargar(); render(); if (seguirAbierta && M) { const nr = S.rows.find(r => r.jornada === d.jornada); if (nr) { M.row = nr; M.draft = clone(nr); M.nueva = false; pintarModal(); } }
  } catch (e) {
    M.busy = false;
    M.err = e && e.code === "23505" ? "Esa jornada ya tiene quiniela." : (e && /row-level|permission/i.test(e.message || "")) ? "No tienes permiso para modificar esta quiniela." : "No se pudo guardar. Comprueba la conexión e inténtalo otra vez.";
    pintarModal();
  }
}
async function borrar() {
  try { await API.borrar(M.row); cerrarModal(); toast("Quiniela eliminada"); await recargar(); render(); }
  catch (e) { M.err = "No se pudo eliminar."; pintarModal(); }
}

/* ---------- Ranking ---------- */
function stats(rows) {
  return orden().map(id => {
    const mine = rows.filter(r => r.jugador === id && r.estado !== "borrador");
    const esc = mine.filter(r => r.aciertos != null);
    const tot = esc.reduce((a, r) => a + r.aciertos, 0);
    const cobrado = mine.reduce((a, r) => a + (r.premio || 0), 0);
    const invertido = mine.reduce((a, r) => a + (r.coste ?? COSTE), 0);
    return {
      id, jugadas: mine.length, esc: esc.length, tot, media: esc.length ? tot / esc.length : null,
      mejor: esc.length ? Math.max(...esc.map(r => r.aciertos)) : null, peor: esc.length ? Math.min(...esc.map(r => r.aciertos)) : null,
      premiadas: mine.filter(r => (r.premio || 0) > 0).length, cobrado: round2(cobrado), invertido, balance: round2(cobrado - invertido)
    };
  });
}
function kpi(l, v, sub) { return h("div", { class: "card kpi stack", style: "gap:4px" }, h("span", { class: "label" }, l), h("span", { class: "v" }, v), h("span", { class: "muted small" }, sub || "")); }
function vistaRanking(rows) {
  const st = stats(rows).sort((a, b) => (b.media ?? -1) - (a.media ?? -1) || b.cobrado - a.cobrado);
  const totP = st.reduce((a, s) => a + s.cobrado, 0), totI = st.reduce((a, s) => a + s.invertido, 0);
  const esc = rows.filter(r => r.aciertos != null);
  const mediaP = esc.length ? esc.reduce((a, r) => a + r.aciertos, 0) / esc.length : null;
  const maxP = [...st].sort((a, b) => b.cobrado - a.cobrado)[0];
  const kp = h("div", { class: "kpis" },
    kpi("Líder por media", st[0] && st[0].media != null ? h("span", { class: "pc p-" + st[0].id }, pname(st[0].id)) : "—", st[0] && st[0].media != null ? `${num1(st[0].media)} aciertos de media` : ""),
    kpi("Más premios", maxP && maxP.cobrado > 0 ? h("span", { class: "pc p-" + maxP.id }, pname(maxP.id)) : "—", maxP ? eur(maxP.cobrado) : ""),
    kpi("Premios de la peña", eur(totP), `${esc.length} jornadas escrutadas`),
    kpi("Balance de la peña", h("span", { class: totP - totI >= 0 ? "ok" : "bad" }, eur(totP - totI)), `Invertido ${eur(totI)}`));
  const tbl = h("table", null, h("thead", null, h("tr", null,
    h("th", null, "#"), h("th", null, "Jugador"), h("th", { class: "num" }, "Jugadas"), h("th", { class: "num" }, "Media"), h("th", { class: "num" }, "Aciertos"),
    h("th", { class: "num" }, "Mejor"), h("th", { class: "num" }, "Peor"), h("th", { class: "num" }, "Con premio"), h("th", { class: "num" }, "Invertido"), h("th", { class: "num" }, "Cobrado"), h("th", { class: "num" }, "Balance"))),
    h("tbody", null, st.map((s, i) => h("tr", null,
      h("td", { class: "rank" }, i + 1), h("td", null, playerDot(s.id)), h("td", { class: "num" }, s.jugadas), h("td", { class: "num" }, h("b", null, num1(s.media))),
      h("td", { class: "num" }, s.tot), h("td", { class: "num" }, s.mejor ?? "—"), h("td", { class: "num" }, s.peor ?? "—"), h("td", { class: "num" }, s.premiadas),
      h("td", { class: "num" }, eur(s.invertido)), h("td", { class: "num" }, eur(s.cobrado)), h("td", { class: "num " + (s.balance >= 0 ? "ok" : "bad") }, eur(s.balance))))));
  return [kp,
    h("section", { class: "card stack" }, h("h2", null, "Clasificación"), h("p", { class: "muted small" }, "Ordenada por media de aciertos, que es justa aunque no todos hayáis jugado las mismas jornadas."), h("div", { class: "tw" }, tbl)),
    contraLaApp(rows),
    h("section", { class: "card stack" }, h("div", { class: "row spread" }, h("h2", null, "Aciertos por jornada"), h("div", { class: "row" }, orden().map(id => playerDot(id)))), grafico(esc),
      mediaP != null ? h("span", { class: "muted small" }, `Media de la peña: ${num1(mediaP)} aciertos`) : null)];
}
function contraLaApp(rows) {
  const filas = rows.filter(r => r.aciertos != null && S.jornadas[r.jornada] && S.jornadas[r.jornada].resultados).map(r => {
    const a = escrutinioApp(S.jornadas[r.jornada]);
    return a ? { r, app: a.e.total, appPremio: a.premio } : null;
  }).filter(Boolean);
  if (!filas.length) return h("section", { class: "card stack" }, h("h2", null, "Vosotros contra la app"),
    h("p", { class: "muted small" }, "Aquí se comparará cada quiniela con el boleto que propuso la app, en cuanto haya jornadas con pronóstico y resultados oficiales."));
  const vos = filas.reduce((a, f) => a + f.r.aciertos, 0), app = filas.reduce((a, f) => a + f.app, 0);
  const pv = filas.reduce((a, f) => a + (f.r.premio || 0), 0), pa = filas.reduce((a, f) => a + (f.appPremio || 0), 0);
  const gana = (x, y) => x > y ? "ok" : x < y ? "bad" : "";
  return h("section", { class: "card stack" }, h("h2", null, "Vosotros contra la app"),
    h("p", { class: "muted small" }, `En ${filas.length} jornada${filas.length > 1 ? "s" : ""}: vosotros ${num1(vos / filas.length)} aciertos de media y ${eur(pv)} cobrados; la app habría hecho ${num1(app / filas.length)} y ${eur(pa)}.`),
    h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Jornada"), h("th", null, "Jugador"), h("th", { class: "num" }, "Aciertos"), h("th", { class: "num" }, "La app"), h("th", { class: "num" }, "Premio"), h("th", { class: "num" }, "Premio app"))),
      h("tbody", null, filas.slice().reverse().map(f => h("tr", null, h("td", { class: "rank" }, f.r.jornada), h("td", null, playerDot(f.r.jugador)),
        h("td", { class: "num " + gana(f.r.aciertos, f.app) }, h("b", null, f.r.aciertos)), h("td", { class: "num " + gana(f.app, f.r.aciertos) }, f.app),
        h("td", { class: "num" }, eur(f.r.premio || 0)), h("td", { class: "num" }, f.appPremio == null ? "—" : eur(f.appPremio))))))));
}
function grafico(rows) {
  if (!rows.length) return h("div", { class: "empty" }, "Aún no hay jornadas escrutadas.");
  const W = 640, H = 260, L = 40, R = 12, T = 26, B = 38, y0 = 5, y1 = 15;
  const step = (W - L - R) / Math.max(rows.length, 1);
  const y = v => T + (H - T - B) * (1 - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0));
  const col = { CHONCHA: "var(--ch)", FEDE: "var(--fe)", QUINO: "var(--qu)" };
  const NS = "http://www.w3.org/2000/svg";
  const el = (t, a, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
  const svg = el("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Aciertos por jornada" });
  const g = el("g", { class: "grid" }); svg.append(g);
  for (let v = 6; v <= 14; v += 2) { g.append(el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v) })); g.append(el("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, v)); }
  rows.forEach((r, i) => {
    const cx = L + step * (i + .5), bw = Math.min(26, step * .55);
    const rect = el("rect", { x: cx - bw / 2, y: y(r.aciertos), width: bw, height: Math.max(0, y(y0) - y(r.aciertos)), rx: 3, fill: col[r.jugador] || "var(--muted)" });
    rect.append(el("title", {}, `J${r.jornada} · ${pname(r.jugador)}: ${r.aciertos}`)); svg.append(rect);
    svg.append(el("text", { x: cx, y: y(r.aciertos) - 5, "text-anchor": "middle", style: "fill:var(--ink);font-weight:600" }, r.aciertos === 15 ? "15" : r.aciertos));
    svg.append(el("text", { x: cx, y: H - 10, "text-anchor": "middle" }, "J" + r.jornada));
  });
  return h("div", { class: "tw" }, svg);
}

/* ---------- Histórico ---------- */
/* Apuntar a mano una jornada jugada fuera de la app (solo aciertos y premio) */
function tarjetaAnadir(rows) {
  const opciones = orden().filter(n => n === S.yo || (soyAdmin() && !P(n).vinculado));
  if (!opciones.length) return null;
  if (!S.addForm) S.addForm = { abierto: false, jornada: "", fecha: "", jugador: opciones[0], aciertos: "", premio: "", err: null, busy: false };
  const f = S.addForm;
  if (!f.abierto) return h("section", { class: "card row spread" },
    h("div", { class: "stack", style: "gap:2px" }, h("h3", null, "¿Jugaste una jornada fuera de la app?"), h("span", { class: "muted small" }, "Apúntala aquí con tus aciertos y tu premio para que cuente en el ranking.")),
    h("button", { class: "btn", onclick: () => { f.abierto = true; render(); } }, "Añadir jornada jugada"));
  const guardarManual = async () => {
    const j = parseInt(f.jornada), a = f.aciertos === "" ? NaN : parseInt(f.aciertos);
    f.err = !j || j < 1 ? "Pon el número de jornada." : rows.some(r => r.jornada === j) ? `La jornada ${j} ya está apuntada; ábrela en la lista para corregirla.` : isNaN(a) || a < 0 || a > 15 ? "Pon los aciertos (de 0 a 15; 15 = 14 más el pleno)." : null;
    if (f.err) { render(); return; }
    f.busy = true; render();
    try {
      await API.guardar({ temporada: TEMP, jornada: j, fecha: f.fecha || "", jugador: f.jugador, estado: "escrutada", partidos: null, pleno: null, resultados: null, pleno_res: null, aciertos: a, premio: parseMoney(f.premio) ?? 0, coste: COSTE, nota: "Apuntada a mano: se jugó fuera de la app.", cambios: [{ en: new Date().toISOString(), campo: "alta manual", de: null, a: `${a} aciertos` }] });
      S.addForm = null; toast(`Jornada ${j} apuntada`); await recargar(); render();
    } catch (e) { f.busy = false; f.err = e && e.code === "23505" ? "Esa jornada ya está apuntada." : "No se pudo guardar. Comprueba la conexión."; render(); }
  };
  return h("section", { class: "card stack" },
    h("h3", null, "Añadir una jornada jugada fuera de la app"),
    h("div", { class: "fields" },
      h("label", null, h("span", { class: "label" }, "Jornada"), h("input", { id: "ad-j", type: "number", inputmode: "numeric", min: "1", max: "80", value: f.jornada, oninput: e => f.jornada = e.target.value, onchange: e => { const c = calDe(e.target.value); if (c) { f.fecha = c.fecha; if (opciones.includes(c.jugador)) f.jugador = c.jugador; render(); } } })),
      h("label", null, h("span", { class: "label" }, "Fecha"), h("input", { id: "ad-f", type: "date", value: f.fecha, oninput: e => f.fecha = e.target.value })),
      opciones.length > 1 ? h("label", null, h("span", { class: "label" }, "Jugador"), h("select", { id: "ad-p", onchange: e => f.jugador = e.target.value }, opciones.map(n => h("option", { value: n, selected: f.jugador === n }, pname(n))))) : null,
      h("label", null, h("span", { class: "label" }, "Aciertos"), h("input", { id: "ad-a", type: "number", inputmode: "numeric", min: "0", max: "15", value: f.aciertos, oninput: e => f.aciertos = e.target.value })),
      h("label", null, h("span", { class: "label" }, "Premio cobrado (€)"), h("input", { id: "ad-pr", inputmode: "decimal", placeholder: "0,00", value: f.premio, oninput: e => f.premio = e.target.value }))),
    h("p", { class: "muted small" }, `Cuenta como una quiniela de ${eur(COSTE)}. Los aciertos son los de tu mejor columna.`),
    f.err ? h("div", { class: "err" }, f.err) : null,
    h("div", { class: "row" }, h("button", { class: "btn go", disabled: f.busy, onclick: guardarManual }, "Guardar jornada"), h("button", { class: "btn alt", onclick: () => { S.addForm = null; render(); } }, "Cancelar")));
}
function vistaHistorico(rows) {
  const add = tarjetaAnadir(rows);
  if (!rows.length) return [add, h("div", { class: "card empty" }, "Todavía no hay quinielas esta temporada.")];
  const tbl = h("table", null, h("thead", null, h("tr", null, h("th", null, "Jornada"), h("th", null, "Fecha"), h("th", null, "Jugador"), h("th", { class: "num" }, "Aciertos"), h("th", { class: "num" }, "Premio"), h("th", null, "Estado"), h("th", null, ""))),
    h("tbody", null, rows.slice().reverse().map(r => h("tr", { class: "click", tabindex: "0", onclick: () => abrirQuiniela(r), onkeydown: e => { if (e.key === "Enter") abrirQuiniela(r); } },
      h("td", { class: "rank" }, r.jornada), h("td", null, fdate(r.fecha)), h("td", null, playerDot(r.jugador)),
      h("td", { class: "num" }, h("b", null, r.aciertos == null ? "—" : (r.aciertos === 15 ? "14+P" : r.aciertos))),
      h("td", { class: "num" + ((r.premio || 0) > 0 ? " ok" : "") }, r.premio == null ? "—" : eur(r.premio)),
      h("td", null, h("span", { class: "pill st-" + r.estado }, r.estado)),
      h("td", { class: "muted small" }, puedoEscribir(r.jugador) ? "Editar" : "Ver")))));
  return [add, h("section", { class: "card stack" }, h("h2", null, "Todas las jornadas"), h("p", { class: "muted small" }, "Toca una fila para ver el boleto o corregir aciertos, premio o fecha. Cada cambio queda registrado."), h("div", { class: "tw" }, tbl))];
}

/* ---------- Reparto ---------- */
function vistaReparto(rows) {
  const st = stats(rows); const total = round2(st.reduce((a, s) => a + s.cobrado, 0)); const n = st.length || 1; const cuota = total / n;
  const pay = st.map(s => ({ id: s.id, d: round2(s.cobrado - cuota) })).filter(b => b.d > 0);
  const rec = st.map(s => ({ id: s.id, d: round2(cuota - s.cobrado) })).filter(b => b.d > 0);
  const moves = [];
  for (const p of pay) for (const r of rec) { if (p.d <= 0.004) break; if (r.d <= 0.004) continue; const x = round2(Math.min(p.d, r.d)); moves.push({ de: p.id, a: r.id, x }); p.d -= x; r.d -= x; }
  return [h("section", { class: "card stack" },
    h("h2", null, "Reparto de fin de temporada"),
    h("p", { class: "muted small" }, "Cada uno se queda sus premios durante la temporada y al final se reparte el total a partes iguales."),
    h("div", { class: "kpis" }, kpi("Premios acumulados", eur(total), "Toda la peña"), kpi("Le toca a cada uno", eur(cuota), `Total entre ${n}`)),
    h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Jugador"), h("th", { class: "num" }, "Tiene cobrado"), h("th", { class: "num" }, "Le corresponde"), h("th", { class: "num" }, "Diferencia"), h("th", { class: "num" }, "Ha invertido"))),
      h("tbody", null, st.map(s => {
        const df = s.cobrado - cuota; return h("tr", null, h("td", null, playerDot(s.id)), h("td", { class: "num" }, eur(s.cobrado)), h("td", { class: "num" }, eur(cuota)),
          h("td", { class: "num " + (df > 0.004 ? "bad" : df < -0.004 ? "ok" : "") }, (df > 0.004 ? "debe dar " : df < -0.004 ? "recibe " : "") + eur(Math.abs(df))), h("td", { class: "num" }, eur(s.invertido)));
      })))),
    h("div", { class: "stack", style: "gap:6px" }, h("span", { class: "label" }, "Si la temporada acabara hoy"),
      moves.length ? moves.map(m => h("div", { class: "row" }, playerDot(m.de), h("span", null, "le da"), h("b", null, eur(m.x)), h("span", null, "a"), playerDot(m.a))) : h("span", { class: "muted" }, "Nadie debe nada a nadie.")))];
}

/* ---------- menú: contraseña, instalar, ayuda, salir ---------- */
function hoja(titulo, contenido, pie) {
  const ov = h("div", { class: "ov", onclick: ev => { if (ev.target === ov) cerrarModal(); } },
    h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": titulo },
      h("div", { class: "m-head" }, h("h2", null, titulo), h("button", { class: "btn alt", onclick: cerrarModal }, "Cerrar")),
      h("div", { class: "m-body" }, contenido), pie ? h("div", { class: "m-foot" }, pie) : null));
  document.getElementById("modalRoot").replaceChildren(ov); document.body.style.overflow = "hidden";
}
function abrirMenu() {
  const item = (t, sub, fn) => h("button", { class: "card", style: "text-align:left;display:flex;flex-direction:column;gap:2px;width:100%", onclick: fn }, h("b", null, t), h("span", { class: "muted small" }, sub));
  hoja("Menú", h("div", { class: "stack" },
    item("Cómo funciona", "Explicado paso a paso, sin tecnicismos", abrirAyuda),
    item("Instalar en el móvil", "Para tenerla como una app más en la pantalla", abrirInstalar),
    DEMO ? null : item("Cambiar mi contraseña", "Pon una que te acuerdes", abrirPass),
    item("Salir", S.yo ? `Cerrar la sesión de ${pname(S.yo)}` : "Cerrar sesión", async () => { cerrarModal(); await API.logout(); S.yo = null; S.fase = "login"; render(); })));
}
function abrirPass() {
  let p1 = "", p2 = ""; let err = null;
  const pintar = () => hoja("Cambiar contraseña", h("div", { class: "stack" },
    h("label", { class: "stack", style: "gap:4px" }, h("span", { class: "label" }, "Nueva contraseña"), h("input", { id: "np1", type: "password", autocomplete: "new-password", oninput: e => p1 = e.target.value })),
    h("label", { class: "stack", style: "gap:4px" }, h("span", { class: "label" }, "Repítela"), h("input", { id: "np2", type: "password", autocomplete: "new-password", oninput: e => p2 = e.target.value })),
    h("p", { class: "small muted" }, "Mínimo 6 caracteres."), err ? h("div", { class: "err" }, err) : null),
    h("button", {
      class: "btn go", onclick: async () => {
        if (p1.length < 6) { err = "La contraseña debe tener al menos 6 caracteres."; pintar(); return; }
        if (p1 !== p2) { err = "Las dos contraseñas no coinciden."; pintar(); return; }
        try { await API.cambiarPass(p1); cerrarModal(); toast("Contraseña cambiada"); } catch (e) { err = "No se pudo cambiar. Inténtalo otra vez."; pintar(); }
      }
    }, "Guardar contraseña"));
  pintar();
}
function abrirInstalar() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  hoja("Instalar en el móvil", h("div", { class: "stack" },
    installEvt ? h("button", { class: "btn go", onclick: async () => { installEvt.prompt(); installEvt = null; cerrarModal(); } }, "Instalar ahora") : null,
    h("h3", null, "En iPhone"),
    h("ol", { class: "steps" }, h("li", null, "Abre esta página en Safari."), h("li", null, "Toca el botón Compartir (el cuadrado con la flecha hacia arriba)."), h("li", null, "Elige «Añadir a pantalla de inicio» y pulsa «Añadir».")),
    h("h3", null, "En Android"),
    h("ol", { class: "steps" }, h("li", null, "Abre esta página en Chrome."), h("li", null, "Toca los tres puntos de arriba a la derecha."), h("li", null, "Elige «Instalar aplicación» o «Añadir a pantalla de inicio».")),
    h("p", { class: "muted small" }, ios ? "Estás en iPhone: sigue los pasos de arriba." : "Una vez instalada se abre como cualquier otra app y no hace falta volver a escribir la contraseña.")));
}
function abrirAyuda() {
  const sec = (t, ...ps) => h("div", { class: "stack", style: "gap:6px" }, h("h3", null, t), ps.map(p => h("p", null, p)));
  hoja("Cómo funciona", h("div", { class: "stack", style: "gap:16px" },
    sec("1. Cada semana, el pronóstico",
      "En la pestaña Jornada aparecen los 15 partidos de la quiniela con lo que es más probable que pase. Cada barra muestra las posibilidades del 1, la X y el 2, y debajo hay una frase explicando el partido: rachas, lesiones, quién llega mejor.",
      "Ese pronóstico lo prepara un asistente que repasa clasificaciones, resultados recientes y lo que apuesta la gente. Es una ayuda, no una garantía."),
    sec("2. Le toca a quien le toca",
      "Los turnos van Choncha, Fede, Quino y vuelta a empezar. Si una semana no se juega, se pone el número de la jornada siguiente y el turno sigue igual.",
      "El que tiene el turno pulsa «Empezar quiniela». El boleto ya viene marcado con el pronóstico. Toca 1, X o 2 para cambiar lo que quieras: tiene que haber 7 dobles y 7 fijos, como la reducida que jugáis (16 apuestas, 12 €)."),
    sec("3. Sellar",
      "Con el boleto en la mano, se sella en la administración como siempre. Después, en la app, pulsa «Ya la he sellado». A partir de ahí ya no se pueden cambiar los signos."),
    sec("4. Resultados y premio",
      "Cuando terminan los partidos, la app pone sola los resultados, cuenta los aciertos de las 16 columnas y, cuando Loterías publica los premios, calcula lo que has cobrado. Si algo no cuadra, puedes corregirlo a mano y queda apuntado quién cambió qué."),
    sec("5. Ranking y reparto",
      "En Ranking se ve quién va mejor por media de aciertos. En Reparto, cuánto lleva cobrado cada uno y quién le tiene que dar cuánto a quién al final de la temporada."),
    sec("Lo que nadie puede hacer",
      "Todos veis todas las quinielas, pero cada uno solo puede modificar las suyas.")));
}

/* ---------- marcadores en directo (ESPN, sin clave) ----------
   Durante la jornada, cada minuto se piden los marcadores de LaLiga, Segunda y Liga F.
   Son provisionales: el escrutinio y el premio siguen saliendo de los resultados oficiales. */
S.live = {}; S.liveErr = null;
const LIGAS_H = ["esp.1", "esp.2", "esp.copa_del_rey"], LIGAS_F = ["esp.w.1", "esp.copa_de_la_reina"];
const STOP = new Set(["fc", "cf", "cd", "ud", "sd", "rcd", "rc", "sad", "club", "de", "del", "la", "el", "the", "f", "femenino", "women", "fem", "w"]);
const ALIAS = { "at": "atletico", "atl": "atletico", "atletico": "atletico", "athletic": "athletic bilbao", "r": "", "celta": "celta vigo", "betis": "real betis", "sociedad": "real sociedad", "oviedo": "real oviedo", "espanyol": "espanyol", "alaves": "alaves", "coruna": "deportivo", "lacoruna": "deportivo" };
function tokens(s) {
  const t = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\(f\)/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of t) { if (STOP.has(w)) continue; const a = ALIAS[w]; if (a === "") continue; (a || w).split(" ").forEach(x => out.push(x)); }
  return new Set(out);
}
function parecido(a, b) {
  const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
  return inter / Math.min(A.size, B.size) * 0.7 + inter / new Set([...A, ...B]).size * 0.3;
}
const esFem = p => /\(F\)/i.test(p.local + p.visitante);
const ymd = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
const horaDe = s => s ? new Date(String(s).replace(" ", "T") + ":00") : null;
function ventanaDirecto(J) {
  const hs = [...J.partidos.map(p => p.hora), J.pleno && J.pleno.hora].map(horaDe).filter(d => d && !isNaN(d));
  if (!hs.length) return null;
  return { desde: new Date(Math.min(...hs) - 15 * 60e3), hasta: new Date(Math.max(...hs) + 150 * 60e3), dias: [...new Set(hs.map(ymd))] };
}
function leerEvento(ev) {
  const c = (ev.competitions || [])[0] || {}; const cs = c.competitors || [];
  const home = cs.find(x => x.homeAway === "home") || cs[0], away = cs.find(x => x.homeAway === "away") || cs[1];
  if (!home || !away) return null;
  const st = (ev.status || c.status || {}); const ty = st.type || {};
  const nombre = t => [t.displayName, t.shortDisplayName, t.name, t.location].filter(Boolean).join(" ");
  return { id: String(ev.id), home: nombre(home.team || {}), away: nombre(away.team || {}), gh: parseInt(home.score), ga: parseInt(away.score),
    estado: ty.state || "pre", detalle: ty.shortDetail || ty.detail || st.displayClock || "", fecha: ev.date };
}
function itemDe(ev) {
  if (!ev) return null;
  const jugando = ev.estado === "in" || ev.estado === "post";
  const ok = jugando && !isNaN(ev.gh) && !isNaN(ev.ga);
  const g = n => n >= 3 ? "M" : String(n);
  return { estado: ev.estado, detalle: ev.detalle, marcador: ok ? `${ev.gh}-${ev.ga}` : "", signo: ok ? (ev.gh > ev.ga ? "1" : ev.gh === ev.ga ? "X" : "2") : "", goles: ok ? { l: g(ev.gh), v: g(ev.ga) } : null };
}
async function pedirLiga(liga, dia) {
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard?dates=${dia}`, { cache: "no-store" });
  if (!r.ok) throw new Error("http " + r.status);
  const d = await r.json(); return (d.events || []).map(leerEvento).filter(Boolean);
}
function emparejar(p, eventos) {
  if (p.espn) return eventos.find(e => e.id === String(p.espn)) || null;
  let best = null, bs = 0;
  for (const e of eventos) {
    const a = parecido(p.local, e.home), b = parecido(p.visitante, e.away);
    if (a < 0.45 || b < 0.45) continue;
    if (a + b > bs) { bs = a + b; best = e; }
  }
  return best;
}
let tDirecto = null, pidiendo = false;
async function actualizarDirecto() {
  if (pidiendo || S.fase !== "app" || document.visibilityState !== "visible") return;
  const ahora = new Date();
  const activas = Object.values(S.jornadas).filter(J => !J.resultados && J.partidos).map(J => ({ J, v: ventanaDirecto(J) })).filter(x => x.v && ahora >= x.v.desde && ahora <= x.v.hasta);
  if (!activas.length) return;
  pidiendo = true;
  try {
    for (const { J, v } of activas) {
      const todos = [...J.partidos, J.pleno];
      const ligas = new Set(); todos.forEach(p => (esFem(p) ? LIGAS_F : LIGAS_H).forEach(l => ligas.add(l)));
      const pet = []; ligas.forEach(l => v.dias.forEach(d => pet.push(pedirLiga(l, d).catch(() => null))));
      const resps = await Promise.all(pet);
      if (resps.every(x => x === null)) throw new Error("sin respuesta");
      const evs = resps.flat().filter(Boolean);
      const items = J.partidos.map(p => itemDe(emparejar(p, evs)));
      S.live[J.jornada] = { items, pleno: itemDe(emparejar(J.pleno, evs)), at: new Date(), encontrados: items.filter(Boolean).length };
    }
    S.liveErr = null;
  } catch (e) { S.liveErr = new Date(); }
  finally { pidiendo = false; renderSuave(); }
}
function renderSuave() {
  const a = document.activeElement;
  if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && document.getElementById("app").contains(a)) { a.addEventListener("blur", () => render(), { once: true }); return; }
  if (S.fase === "app") render();
}
function estadoMini(it) {
  if (!it || it.estado === "pre") return null;
  const fin = it.estado === "post";
  return h("span", { class: "estado-mini " + (fin ? "fin" : "vivo") }, fin ? `Final ${it.marcador}` : `En directo ${it.marcador}${it.detalle ? " · " + it.detalle : ""}`);
}
function chipDirecto(it) {
  if (!it || it.estado === "pre") return null;
  const fin = it.estado === "post";
  return h("div", { class: "row", style: "gap:6px" }, h("span", { class: "pill " + (fin ? "st-sellada" : "live-pill") }, fin ? "Final" : "En directo"),
    h("b", { class: "marcador" }, it.marcador), fin ? null : h("span", { class: "muted small" }, it.detalle));
}
function avisoDirecto(L) {
  const hh = L.at.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return h("p", { class: "small muted" }, `Marcadores en directo actualizados a las ${hh}. Son provisionales; el escrutinio se hace con los resultados oficiales.`,
    L.encontrados < NPART ? ` (${NPART - L.encontrados} partidos sin marcador todavía).` : "");
}
function iniciarDirecto() { clearInterval(tDirecto); tDirecto = setInterval(actualizarDirecto, 60e3); actualizarDirecto(); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") actualizarDirecto(); });

/* ---------- inicio ---------- */
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
arrancar();
