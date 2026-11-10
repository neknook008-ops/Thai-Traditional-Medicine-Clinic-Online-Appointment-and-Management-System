"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "clinic.json");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;
const scryptAsync = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
});

const initialState = {
  settings: {
    clinicName: "คลินิกการแพทย์แผนไทย",
    organization: "ศูนย์การแพทย์มหาวิทยาลัยวลัยลักษณ์",
    phone: "075-672-000",
    line: "@wuclinic",
    address: "อาคารศูนย์การแพทย์ มหาวิทยาลัยวลัยลักษณ์ จังหวัดนครศรีธรรมราช",
    openDays: [1, 2, 3, 4, 5],
    openTime: "08:30",
    closeTime: "16:30",
    slotsPerDay: 9,
    advanceDays: 60,
    cutoffHours: 24,
    allowCancel: true,
    allowReschedule: true,
    onlineBooking: true,
    requiredName: true,
    requiredPhone: true,
    notifications: { sms: false, line: false, email: false },
    announcement: "เปิดให้บริการวันจันทร์–ศุกร์ เวลา 08:30–16:30 น. ปิดวันหยุดนักขัตฤกษ์",
    faq: "ต้องจองล่วงหน้าหรือไม่?|แนะนำให้นัดหมายล่วงหน้าเพื่อเลือกวันและเวลาที่สะดวก\nสามารถเปลี่ยนหรือยกเลิกนัดได้หรือไม่?|ส่งคำขอผ่านหน้า ตรวจสอบนัดหมาย ก่อนเวลานัดตามเงื่อนไขที่กำหนด",
    heroImage: "",
    holidays: []
  },
  services: [
    { id: "svc-massage", name: "นวดไทยเพื่อสุขภาพ", description: "ผ่อนคลายกล้ามเนื้อ บรรเทาอาการปวดเมื่อยด้วยศาสตร์การนวดไทย", duration: 60, price: 500, icon: "✳", active: true, therapistRequired: true, therapistIds: ["th-nicha", "th-somchai"], order: 1 },
    { id: "svc-compress", name: "ประคบสมุนไพร", description: "ใช้ลูกประคบสมุนไพรอุ่น ช่วยผ่อนคลายและดูแลสุขภาพ", duration: 45, price: 350, icon: "❋", active: true, therapistRequired: false, therapistIds: ["th-nicha", "th-somchai"], order: 2 },
    { id: "svc-foot", name: "นวดฝ่าเท้า", description: "ดูแลฝ่าเท้าด้วยเทคนิคการนวดเพื่อความผ่อนคลาย", duration: 45, price: 400, icon: "◉", active: true, therapistRequired: true, therapistIds: ["th-nicha"], order: 3 },
    { id: "svc-advice", name: "ให้คำปรึกษาสมุนไพร", description: "พูดคุยกับผู้เชี่ยวชาญเรื่องการใช้สมุนไพรอย่างเหมาะสม", duration: 30, price: 200, icon: "❧", active: true, therapistRequired: false, therapistIds: ["th-somchai"], order: 4 }
  ],
  therapists: [
    { id: "th-nicha", name: "แพทย์แผนไทย นิชา", phone: "081-234-5678", active: true, serviceIds: ["svc-massage", "svc-compress", "svc-foot"], days: [1, 2, 3, 4, 5], from: "08:30", to: "16:30", break: "12:00–13:00", leave: [] },
    { id: "th-somchai", name: "แพทย์แผนไทย สมชาย", phone: "089-234-5678", active: true, serviceIds: ["svc-massage", "svc-compress", "svc-advice"], days: [1, 2, 3, 4, 5], from: "08:30", to: "16:30", break: "12:00–13:00", leave: [] }
  ],
  appointments: [],
  customers: [],
  audit: [],
  admins: []
};

const sessions = new Map();
const loginAttempts = new Map();
let database;
let writes = Promise.resolve();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function writeDatabase() {
  const snapshot = JSON.stringify(database, null, 2);
  writes = writes.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temporary = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporary, snapshot, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, DATA_FILE);
  });
  return writes;
}

async function loadDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const stored = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    database = {
      setupComplete: Boolean(stored.setupComplete),
      state: {
        ...clone(initialState),
        ...stored.state,
        settings: { ...clone(initialState.settings), ...stored.state?.settings, notifications: { ...initialState.settings.notifications, ...stored.state?.settings?.notifications } },
        services: Array.isArray(stored.state?.services) ? stored.state.services : clone(initialState.services),
        therapists: Array.isArray(stored.state?.therapists) ? stored.state.therapists : clone(initialState.therapists),
        appointments: Array.isArray(stored.state?.appointments) ? stored.state.appointments : [],
        customers: Array.isArray(stored.state?.customers) ? stored.state.customers : [],
        audit: Array.isArray(stored.state?.audit) ? stored.state.audit : [],
        admins: Array.isArray(stored.state?.admins) ? stored.state.admins : []
      },
      authAdmins: Array.isArray(stored.authAdmins) ? stored.authAdmins : []
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    database = { setupComplete: false, state: clone(initialState), authAdmins: [] };
    await writeDatabase();
  }
}

function jsonResponse(res, status, payload, headers = {}) {
  const content = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(content),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(content);
}

function cookieMap(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map(item => {
    const separator = item.indexOf("=");
    return separator < 0 ? ["", ""] : [item.slice(0, separator).trim(), item.slice(separator + 1).trim()];
  }).filter(([key]) => key));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON request body");
  }
}

function secureEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function currentAdmin(req) {
  const token = cookieMap(req).clinic_session;
  if (!token) return null;
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  const session = sessions.get(digest);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(digest);
    return null;
  }
  const admin = database.authAdmins.find(item => item.id === session.adminId && item.active);
  if (!admin) {
    sessions.delete(digest);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return admin;
}

async function requireAdmin(req) {
  const admin = await currentAdmin(req);
  if (!admin) throw new HttpError(401, "กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อน");
  return admin;
}

function publicState() {
  const settings = { ...database.state.settings };
  return {
    settings,
    services: database.state.services.filter(item => item.active).map(item => ({ ...item })),
    therapists: database.state.therapists.filter(item => item.active).map(({ phone, leave, ...person }) => person)
  };
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function dateValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && localDateKey(date) === value;
}

function timeValid(value) {
  return /^\d{2}:\d{2}$/.test(String(value)) && Number(value.slice(0, 2)) < 24 && Number(value.slice(3, 5)) < 60;
}

function timeMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getService(id) {
  return database.state.services.find(item => item.id === id && item.active);
}

function activeAppointments(date, exceptId = "") {
  return database.state.appointments.filter(item => item.id !== exceptId && (!date || item.date === date) && !["Cancelled", "Completed", "No-show"].includes(item.status));
}

function holidayFor(date) {
  return database.state.settings.holidays.some(item => (typeof item === "string" ? item : item.date) === date);
}

function bookingWindowClosed(date) {
  const today = new Date();
  const latest = new Date(today);
  latest.setDate(latest.getDate() + Number(database.state.settings.advanceDays || 60));
  return date < localDateKey(today) || date > localDateKey(latest);
}

function candidatesFor(service, date, therapistId) {
  const weekday = new Date(`${date}T00:00:00`).getDay();
  return database.state.therapists.filter(person =>
    person.active
    && service.therapistIds.includes(person.id)
    && person.serviceIds.includes(service.id)
    && person.days.includes(weekday)
    && !person.leave.includes(date)
    && (!therapistId || therapistId === person.id)
  );
}

function overlaps(date, time, duration, therapistId, onlyUnassigned = false, exceptId = "") {
  const start = timeMinutes(time);
  const end = start + duration;
  return activeAppointments(date, exceptId).some(item => {
    if (onlyUnassigned && item.therapistId) return false;
    if (therapistId && item.therapistId && item.therapistId !== therapistId) return false;
    const existingService = database.state.services.find(service => service.id === item.serviceId);
    const existingEnd = timeMinutes(item.time) + Number(existingService?.duration || 60);
    return start < existingEnd && end > timeMinutes(item.time);
  });
}

function timeFitsBreak(person, start, end) {
  const match = String(person.break || "").match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return true;
  const breakStart = Number(match[1]) * 60 + Number(match[2]);
  const breakEnd = Number(match[3]) * 60 + Number(match[4]);
  return end <= breakStart || start >= breakEnd;
}

function providerCanTakeSlot(person, date, minute, duration, exceptId = "") {
  const end = minute + duration;
  return minute >= timeMinutes(person.from || database.state.settings.openTime)
    && end <= timeMinutes(person.to || database.state.settings.closeTime)
    && timeFitsBreak(person, minute, end)
    && !overlaps(date, `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`, duration, person.id, false, exceptId);
}

function availableTimes(date, service, therapistId, exceptId = "") {
  const settings = database.state.settings;
  if (!dateValid(date) || !service || !settings.openDays.includes(new Date(`${date}T00:00:00`).getDay()) || holidayFor(date) || bookingWindowClosed(date)) return [];
  if (activeAppointments(date, exceptId).length >= Number(settings.slotsPerDay || 9)) return [];
  const candidates = candidatesFor(service, date, therapistId);
  if (therapistId && !candidates.length) return [];
  if (service.therapistRequired && !candidates.length) return [];
  const start = timeMinutes(settings.openTime);
  const end = timeMinutes(settings.closeTime);
  const duration = Number(service.duration);
  const slots = [];
  for (let minute = start; minute + duration <= end; minute += 30) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    if (date === localDateKey(new Date()) && minute < timeMinutes(new Date().toTimeString().slice(0, 5)) + Number(settings.cutoffHours || 0) * 60) continue;
    const availableProvider = candidates.some(person => providerCanTakeSlot(person, date, minute, duration, exceptId));
    const unassignedBooking = !candidates.length && !service.therapistRequired
      && !overlaps(date, time, duration, "", true, exceptId);
    if (availableProvider || unassignedBooking) slots.push(time);
  }
  return slots;
}

function makeBookingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "WU";
    for (let index = 0; index < 6; index += 1) code += alphabet[crypto.randomInt(alphabet.length)];
  } while (database.state.appointments.some(item => item.code === code));
  return code;
}

function audit(admin, action, detail) {
  database.state.audit.unshift({ id: crypto.randomUUID(), action, detail, at: new Date().toISOString(), actor: admin?.name || "ผู้รับบริการ" });
  database.state.audit = database.state.audit.slice(0, 500);
}

function validateSettings(settings) {
  if (!settings || typeof settings !== "object") throw new HttpError(400, "ข้อมูลการตั้งค่าไม่ถูกต้อง");
  if (!timeValid(settings.openTime) || !timeValid(settings.closeTime) || settings.openTime >= settings.closeTime) throw new HttpError(400, "ช่วงเวลาเปิดคลินิกไม่ถูกต้อง");
  if (!Array.isArray(settings.openDays) || !settings.openDays.length || settings.openDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new HttpError(400, "วันเปิดคลินิกไม่ถูกต้อง");
  if (!Number.isInteger(Number(settings.slotsPerDay)) || Number(settings.slotsPerDay) < 1 || Number(settings.slotsPerDay) > 100) throw new HttpError(400, "จำนวนคิวต่อวันไม่ถูกต้อง");
  if (!Number.isInteger(Number(settings.advanceDays)) || Number(settings.advanceDays) < 1 || Number(settings.advanceDays) > 365) throw new HttpError(400, "จำนวนวันจองล่วงหน้าไม่ถูกต้อง");
  if (!Number.isInteger(Number(settings.cutoffHours)) || Number(settings.cutoffHours) < 0 || Number(settings.cutoffHours) > 720) throw new HttpError(400, "เงื่อนไขยกเลิกนัดไม่ถูกต้อง");
  if (String(settings.announcement || "").length > 1000 || String(settings.faq || "").length > 10000) throw new HttpError(400, "เนื้อหาประกาศหรือคำถามยาวเกินกำหนด");
  if (String(settings.heroImage || "").length > 500000) throw new HttpError(413, "รูปหน้าแรกใหญ่เกินกำหนด");
}

function sanitizeState(input, actingAdmin) {
  if (!input || typeof input !== "object" || !Array.isArray(input.services) || !Array.isArray(input.therapists) || !Array.isArray(input.appointments) || !Array.isArray(input.customers) || !Array.isArray(input.admins)) {
    throw new HttpError(400, "รูปแบบข้อมูลหลังบ้านไม่ถูกต้อง");
  }
  const next = {
    ...database.state,
    ...input,
    settings: { ...database.state.settings, ...input.settings, notifications: { ...database.state.settings.notifications, ...input.settings?.notifications } },
    audit: Array.isArray(input.audit) ? input.audit.slice(0, 500) : database.state.audit
  };
  validateSettings(next.settings);
  if (next.services.some(item => !item.id || !String(item.name || "").trim() || !Number.isFinite(Number(item.price)) || Number(item.price) < 0 || !Number.isFinite(Number(item.duration)) || Number(item.duration) < 15 || Number(item.duration) > 360)) {
    throw new HttpError(400, "ข้อมูลบริการไม่ถูกต้อง");
  }
  if (next.therapists.some(item => !item.id || !String(item.name || "").trim() || !timeValid(item.from) || !timeValid(item.to) || item.from >= item.to)) {
    throw new HttpError(400, "ข้อมูลแพทย์แผนไทยไม่ถูกต้อง");
  }
  for (const appointment of next.appointments) {
    if (!appointment.id || !appointment.code || !dateValid(appointment.date) || !timeValid(appointment.time) || !next.services.some(item => item.id === appointment.serviceId) || !["Pending", "Confirmed", "Completed", "Cancelled", "No-show"].includes(appointment.status)) {
      throw new HttpError(400, "ข้อมูลนัดหมายไม่ถูกต้อง");
    }
  }
  for (const appointment of next.appointments) {
    appointment.history = Array.isArray(appointment.history) ? appointment.history.slice(-100) : [];
  }
  next.customers = next.customers.map(person => ({ ...person }));
  next.admins = next.admins.map(item => {
    const auth = database.authAdmins.find(admin => admin.id === item.id);
    if (!auth) return null;
    const role = String(item.role || auth.role).slice(0, 80);
    const permissions = Array.isArray(item.permissions) ? item.permissions.map(String).filter(value => ["appointments", "customers", "staff", "settings", "reports"].includes(value)).slice(0, 20) : [];
    if ((role !== auth.role || JSON.stringify(permissions) !== JSON.stringify(auth.permissions)) && actingAdmin.role !== "ผู้ดูแลระบบ") {
      throw new HttpError(403, "เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนบทบาทและสิทธิ์ได้");
    }
    if (auth.role === "ผู้ดูแลระบบ" && actingAdmin.role !== "ผู้ดูแลระบบ" && (!item.active || String(item.name || auth.name) !== auth.name)) {
      throw new HttpError(403, "ไม่มีสิทธิ์แก้ไขบัญชีผู้ดูแลระบบ");
    }
    return { id: auth.id, name: String(item.name || auth.name).slice(0, 100), email: auth.email, role, permissions, active: Boolean(item.active) };
  }).filter(Boolean);
  for (const auth of database.authAdmins) {
    if (!next.admins.some(item => item.id === auth.id)) next.admins.push({ id: auth.id, name: auth.name, email: auth.email, role: auth.role, permissions: [...auth.permissions], active: auth.active });
  }
  const activeAuthCount = database.authAdmins.filter(auth => auth.active && next.admins.some(item => item.id === auth.id && item.active)).length;
  if (!activeAuthCount) throw new HttpError(400, "ต้องมีบัญชีเจ้าหน้าที่ที่เปิดใช้งานอย่างน้อยหนึ่งบัญชี");
  return next;
}

function requirePermission(admin, key) {
  if (admin.role !== "ผู้ดูแลระบบ" && !admin.permissions.includes(key)) throw new HttpError(403, "บัญชีนี้ไม่มีสิทธิ์ดำเนินการดังกล่าว");
}

async function createSession(res, admin) {
  const token = crypto.randomBytes(32).toString("base64url");
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  sessions.set(digest, { adminId: admin.id, expiresAt: Date.now() + SESSION_TTL_MS });
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `clinic_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
}

function clearSession(req, res) {
  const token = cookieMap(req).clinic_session;
  if (token) sessions.delete(crypto.createHash("sha256").update(token).digest("hex"));
  res.setHeader("Set-Cookie", "clinic_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers.host;
  if (!host || new URL(origin).host !== host) throw new HttpError(403, "คำขอจากแหล่งที่มาไม่ถูกต้อง");
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method;

  if (pathname === "/api/health" && method === "GET") {
    return jsonResponse(res, 200, { ok: true, setupComplete: database.setupComplete });
  }

  if (pathname === "/api/auth/session" && method === "GET") {
    const admin = await currentAdmin(req);
    return jsonResponse(res, 200, {
      setupRequired: !database.setupComplete,
      admin: admin ? { id: admin.id, name: admin.name, email: admin.email, role: admin.role, permissions: admin.permissions } : null
    });
  }

  if (pathname === "/api/auth/setup" && method === "POST") {
    checkOrigin(req);
    if (database.setupComplete) throw new HttpError(409, "ตั้งค่าบัญชีผู้ดูแลระบบแล้ว");
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "กรุณากรอกชื่อและอีเมลที่ถูกต้อง");
    if (password.length < 12 || password.length > 256) throw new HttpError(400, "รหัสผ่านต้องมีความยาว 12–256 ตัวอักษร");
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = (await scryptAsync(password, salt)).toString("hex");
    const admin = { id: crypto.randomUUID(), name, email, role: "ผู้ดูแลระบบ", permissions: ["appointments", "customers", "staff", "settings", "reports"], active: true, salt, passwordHash };
    database.authAdmins = [admin];
    database.state.admins = [{ id: admin.id, name, email, role: admin.role, permissions: admin.permissions, active: true }];
    database.setupComplete = true;
    await writeDatabase();
    await createSession(res, admin);
    return jsonResponse(res, 201, { admin: { id: admin.id, name, email, role: admin.role, permissions: admin.permissions } });
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    checkOrigin(req);
    const body = await readJson(req);
    const address = req.socket.remoteAddress || "unknown";
    const attempt = loginAttempts.get(address) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    if (attempt.resetAt < Date.now()) { attempt.count = 0; attempt.resetAt = Date.now() + 15 * 60 * 1000; }
    if (attempt.count >= 10) throw new HttpError(429, "พยายามเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาที");
    const email = String(body.email || "").trim().toLowerCase();
    const admin = database.authAdmins.find(item => item.email === email && item.active);
    const salt = admin?.salt || "clinic-invalid-user-salt";
    const hash = (await scryptAsync(String(body.password || ""), salt)).toString("hex");
    if (!admin || !secureEqual(hash, admin.passwordHash)) {
      attempt.count += 1;
      loginAttempts.set(address, attempt);
      throw new HttpError(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }
    loginAttempts.delete(address);
    await createSession(res, admin);
    return jsonResponse(res, 200, { admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, permissions: admin.permissions } });
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    checkOrigin(req);
    clearSession(req, res);
    return jsonResponse(res, 200, { ok: true });
  }

  if (pathname === "/api/public/state" && method === "GET") return jsonResponse(res, 200, publicState());

  if (pathname === "/api/public/calendar" && method === "GET") {
    const month = url.searchParams.get("month");
    if (!/^\d{4}-\d{2}$/.test(month || "")) throw new HttpError(400, "เดือนที่เลือกไม่ถูกต้อง");
    const serviceId = url.searchParams.get("serviceId") || "";
    const therapistId = url.searchParams.get("therapistId") || "";
    const service = getService(serviceId);
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    if (monthNumber < 1 || monthNumber > 12) throw new HttpError(400, "เดือนที่เลือกไม่ถูกต้อง");
    const count = new Date(year, monthNumber, 0).getDate();
    const days = {};
    for (let day = 1; day <= count; day += 1) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const times = service ? availableTimes(date, service, therapistId) : [];
      const closed = bookingWindowClosed(date) || !database.state.settings.openDays.includes(new Date(`${date}T00:00:00`).getDay()) || holidayFor(date);
      const full = activeAppointments(date).length >= Number(database.state.settings.slotsPerDay || 9);
      days[date] = { status: closed ? "closed" : !service ? (full ? "full" : "available") : times.length ? "available" : "full", times: service ? times : [] };
    }
    return jsonResponse(res, 200, { days });
  }

  if (pathname === "/api/public/bookings" && method === "POST") {
    checkOrigin(req);
    const body = await readJson(req);
    const service = getService(String(body.serviceId || ""));
    const date = String(body.date || "");
    const time = String(body.time || "");
    const therapistId = String(body.therapistId || "");
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    if (!database.state.settings.onlineBooking) throw new HttpError(403, "ขณะนี้ปิดรับนัดหมายออนไลน์");
    if (!service || !dateValid(date) || !timeValid(time) || String(body.note || "").length > 500) throw new HttpError(400, "กรุณาตรวจสอบข้อมูลการนัดหมาย");
    if (database.state.settings.requiredName && (name.length < 2 || name.length > 100)) throw new HttpError(400, "กรุณากรอกชื่อผู้รับบริการ");
    if (database.state.settings.requiredPhone && !/^[0-9+()\- ]{8,20}$/.test(phone)) throw new HttpError(400, "กรุณากรอกเบอร์โทรศัพท์ที่ถูกต้อง");
    if (name.length > 100 || phone.length > 20) throw new HttpError(400, "ข้อมูลผู้รับบริการยาวเกินกำหนด");
    if (phone && database.state.customers.some(item => normalizePhone(item.phone) === normalizePhone(phone) && !item.active)) throw new HttpError(403, "บัญชีผู้รับบริการนี้ถูกปิดใช้งาน กรุณาติดต่อคลินิก");
    if (service.therapistRequired && !therapistId) throw new HttpError(400, "บริการนี้ต้องเลือกแพทย์แผนไทย");
    const times = availableTimes(date, service, therapistId);
    if (!times.includes(time)) throw new HttpError(409, "ช่วงเวลานี้ไม่ว่าง กรุณาเลือกวันหรือเวลาใหม่");
    const startMinute = timeMinutes(time);
    const providerId = therapistId || candidatesFor(service, date, "").find(person => providerCanTakeSlot(person, date, startMinute, Number(service.duration)))?.id || "";
    let customer = phone ? database.state.customers.find(item => normalizePhone(item.phone) === normalizePhone(phone)) : null;
    if (!customer) {
      customer = { id: crypto.randomUUID(), name, phone, active: true, createdAt: new Date().toISOString(), notes: "" };
      database.state.customers.push(customer);
    } else if (name) customer.name = name;
    const appointment = {
      id: crypto.randomUUID(), code: makeBookingCode(), customerId: customer.id,
      serviceId: service.id, therapistId: providerId, date, time, note: String(body.note || "").trim(),
      status: "Pending", createdAt: new Date().toISOString(),
      history: [{ status: "Pending", at: new Date().toISOString(), by: "ผู้รับบริการ" }]
    };
    database.state.appointments.push(appointment);
    audit(null, "สร้างนัดหมาย", `${appointment.code} · ${service.name}`);
    await writeDatabase();
    return jsonResponse(res, 201, { appointment: { code: appointment.code, status: appointment.status, date, time, serviceId: service.id, therapistId: providerId } });
  }

  if (pathname === "/api/public/lookup" && method === "POST") {
    checkOrigin(req);
    const body = await readJson(req);
    const code = String(body.code || "").trim().toUpperCase();
    const phone = normalizePhone(body.phone);
    const appointment = database.state.appointments.find(item => item.code === code && secureEqual(normalizePhone(database.state.customers.find(person => person.id === item.customerId)?.phone), phone));
    if (!appointment) throw new HttpError(404, "ไม่พบนัดหมายที่ตรงกับข้อมูล");
    const customer = database.state.customers.find(item => item.id === appointment.customerId);
    const service = database.state.services.find(item => item.id === appointment.serviceId);
    const therapist = database.state.therapists.find(item => item.id === appointment.therapistId);
    return jsonResponse(res, 200, { appointment: { ...appointment, customer: customer ? { name: customer.name } : null, service: service ? { id: service.id, name: service.name, price: service.price, duration: service.duration } : null, therapist: therapist ? { name: therapist.name } : null } });
  }

  if (pathname === "/api/public/cancel" && method === "POST") {
    checkOrigin(req);
    const body = await readJson(req);
    const appointment = database.state.appointments.find(item => item.code === String(body.code || "").trim().toUpperCase());
    const phone = normalizePhone(database.state.customers.find(person => person.id === appointment?.customerId)?.phone);
    if (!appointment || !secureEqual(phone, normalizePhone(body.phone))) throw new HttpError(404, "ไม่พบนัดหมายที่ตรงกับข้อมูล");
    if (!database.state.settings.allowCancel || !["Pending", "Confirmed"].includes(appointment.status) || new Date(`${appointment.date}T${appointment.time}:00`).getTime() - Date.now() < Number(database.state.settings.cutoffHours) * 3600000) throw new HttpError(403, "ไม่สามารถยกเลิกนัดนี้ได้ตามเงื่อนไขที่กำหนด");
    appointment.status = "Cancelled";
    appointment.history.push({ status: "Cancelled", at: new Date().toISOString(), by: "ผู้รับบริการ" });
    audit(null, "ยกเลิกนัดหมายโดยผู้รับบริการ", appointment.code);
    await writeDatabase();
    return jsonResponse(res, 200, { ok: true });
  }

  if (pathname === "/api/public/reschedule" && method === "POST") {
    checkOrigin(req);
    const body = await readJson(req);
    const appointment = database.state.appointments.find(item => item.code === String(body.code || "").trim().toUpperCase());
    const phone = normalizePhone(database.state.customers.find(person => person.id === appointment?.customerId)?.phone);
    if (!appointment || !secureEqual(phone, normalizePhone(body.phone))) throw new HttpError(404, "ไม่พบนัดหมายที่ตรงกับข้อมูล");
    if (!database.state.settings.allowReschedule || !["Pending", "Confirmed"].includes(appointment.status) || new Date(`${appointment.date}T${appointment.time}:00`).getTime() - Date.now() < Number(database.state.settings.cutoffHours) * 3600000) throw new HttpError(403, "ไม่สามารถเปลี่ยนวันนัดนี้ได้ตามเงื่อนไขที่กำหนด");
    const date = String(body.date || "");
    const time = String(body.time || "");
    const service = getService(appointment.serviceId);
    if (!availableTimes(date, service, appointment.therapistId, appointment.id).includes(time)) throw new HttpError(409, "เวลาที่เลือกไม่ว่าง กรุณาเลือกช่วงเวลาอื่น");
    const previous = `${appointment.date} ${appointment.time}`;
    appointment.date = date;
    appointment.time = time;
    appointment.status = "Pending";
    appointment.history.push({ status: "Pending", at: new Date().toISOString(), by: `ผู้รับบริการ ขอเปลี่ยนจาก ${previous}` });
    audit(null, "ขอเปลี่ยนวันนัด", appointment.code);
    await writeDatabase();
    return jsonResponse(res, 200, { ok: true });
  }

  if (pathname === "/api/admin/state" && method === "GET") {
    await requireAdmin(req);
    return jsonResponse(res, 200, { state: database.state });
  }

  if (pathname === "/api/admin/state" && method === "PUT") {
    checkOrigin(req);
    const admin = await requireAdmin(req);
    const input = await readJson(req);
    const current = database.state;
    if (JSON.stringify(input.settings) !== JSON.stringify(current.settings)) requirePermission(admin, "settings");
    if (JSON.stringify(input.services) !== JSON.stringify(current.services) || JSON.stringify(input.therapists) !== JSON.stringify(current.therapists)) requirePermission(admin, "staff");
    if (JSON.stringify(input.appointments) !== JSON.stringify(current.appointments)) requirePermission(admin, "appointments");
    if (JSON.stringify(input.customers) !== JSON.stringify(current.customers)) requirePermission(admin, "customers");
    if (JSON.stringify(input.admins) !== JSON.stringify(current.admins)) requirePermission(admin, "staff");
    database.state = sanitizeState(input, admin);
    for (const auth of database.authAdmins) {
      const record = database.state.admins.find(item => item.id === auth.id);
      if (record) {
        auth.name = record.name;
        auth.role = record.role;
        auth.permissions = [...record.permissions];
        auth.active = record.active;
      }
    }
    audit(admin, "บันทึกข้อมูลหลังบ้าน", "ข้อมูลคลินิก");
    await writeDatabase();
    return jsonResponse(res, 200, { ok: true });
  }

  if (pathname === "/api/admin/users" && method === "POST") {
    checkOrigin(req);
    const admin = await requireAdmin(req);
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "เจ้าหน้าที่").trim();
    if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "กรุณากรอกชื่อและอีเมลที่ถูกต้อง");
    if (password.length < 12 || password.length > 256) throw new HttpError(400, "รหัสผ่านต้องมีความยาว 12–256 ตัวอักษร");
    if (database.authAdmins.some(item => item.email === email)) throw new HttpError(409, "อีเมลนี้มีบัญชีอยู่แล้ว");
    const allowed = ["ผู้ดูแลระบบ", "เจ้าหน้าที่", "ผู้รายงาน"];
    if (!allowed.includes(role)) throw new HttpError(400, "บทบาทไม่ถูกต้อง");
    if (!admin.permissions.includes("staff") && admin.role !== "ผู้ดูแลระบบ") throw new HttpError(403, "ไม่มีสิทธิ์จัดการบัญชีเจ้าหน้าที่");
    if (admin.role !== "ผู้ดูแลระบบ" && role === "ผู้ดูแลระบบ") throw new HttpError(403, "เฉพาะผู้ดูแลระบบเท่านั้นที่สร้างบัญชีผู้ดูแลได้");
    const permissions = Array.isArray(body.permissions) ? body.permissions.filter(value => ["appointments", "customers", "staff", "settings", "reports"].includes(value)) : [];
    if (admin.role !== "ผู้ดูแลระบบ" && permissions.some(permission => !admin.permissions.includes(permission))) throw new HttpError(403, "ไม่สามารถมอบสิทธิ์ที่บัญชีของคุณไม่มีได้");
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = (await scryptAsync(password, salt)).toString("hex");
    const record = { id: crypto.randomUUID(), name, email, role, permissions, active: true, salt, passwordHash };
    database.authAdmins.push(record);
    database.state.admins.push({ id: record.id, name, email, role, permissions, active: true });
    audit(admin, "เพิ่มบัญชีเจ้าหน้าที่", email);
    await writeDatabase();
    return jsonResponse(res, 201, { admin: { id: record.id, name, email, role, permissions, active: true } });
  }

  if (pathname.startsWith("/api/")) throw new HttpError(404, "ไม่พบ API");
  return false;
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const allowed = new Set(["/index.html", "/styles.css", "/app.js"]);
  if (!allowed.has(pathname)) {
    jsonResponse(res, 404, { error: "Not found" });
    return;
  }
  const content = await fs.readFile(path.join(ROOT, pathname.slice(1)));
  res.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(pathname)] || "application/octet-stream",
    "Content-Length": content.length,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res, url);
    } else {
      throw new HttpError(405, "Method not allowed");
    }
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error("Request failed:", error);
    jsonResponse(res, status, { error: status === 500 ? "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" : error.message });
  }
});

loadDatabase().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`Thai clinic server listening on http://${HOST}:${PORT}`);
    console.log(`Persistent clinic data: ${DATA_FILE}`);
    if (!database.setupComplete) console.log("Set up the first administrator from the staff login page.");
  });
}).catch(error => {
  console.error("Could not start the clinic server:", error);
  process.exitCode = 1;
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
