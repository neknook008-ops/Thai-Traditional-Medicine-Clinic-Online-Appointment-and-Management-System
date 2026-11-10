const STORAGE_KEY = "walailuk-thai-clinic-v1";

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
  admins: [
    { id: "admin-1", name: "ผู้ดูแลระบบ", email: "admin@clinic.local", role: "ผู้ดูแลระบบ", permissions: ["appointments", "customers", "staff", "settings", "reports"], active: true },
    { id: "admin-2", name: "เจ้าหน้าที่นัดหมาย", email: "staff@clinic.local", role: "เจ้าหน้าที่", permissions: ["appointments", "customers"], active: true }
  ]
};

let state = loadState();
let activeAdminTab = "dashboard";
let bookingDraft = { serviceId: "", therapistId: "", date: "", time: "" };
let bookingCalendarMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
let lookupResult = null;
let lookupPhone = "";
let backendOnline = false;
let backendError = "";
let adminSession = null;
let authInfo = { setupRequired: false };
let calendarData = {};
let loadedCalendarKey = "";
let adminSaveQueue = Promise.resolve();
let toastTimer;

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(initialState);
    const parsed = JSON.parse(saved);
    return { ...structuredClone(initialState), ...parsed, settings: { ...initialState.settings, ...parsed.settings, notifications: { ...initialState.settings.notifications, ...parsed.settings?.notifications } } };
  } catch (error) {
    console.error("Could not load clinic data from browser storage.", error);
    return structuredClone(initialState);
  }
}

function saveState() {
  try {
    if (adminSession && backendOnline) {
      const snapshot = JSON.parse(JSON.stringify(state));
      adminSaveQueue = adminSaveQueue
        .then(() => apiRequest("/api/admin/state", { method: "PUT", body: snapshot }))
        .then(() => { backendError = ""; })
        .catch(error => {
          console.error("Could not save clinic data to the server.", error);
          backendError = error.message;
          toast(error.message || "บันทึกข้อมูลไปยังเซิร์ฟเวอร์ไม่สำเร็จ");
        });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    return true;
  } catch (error) {
    console.error("Could not save clinic data to browser storage.", error);
    toast("บันทึกข้อมูลไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์");
    return false;
  }
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined;
  if (hasBody) headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    throw new Error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบว่าเปิด server.js อยู่");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `เซิร์ฟเวอร์ตอบกลับ ${response.status}`);
  return payload;
}

async function loadAdminState() {
  const result = await apiRequest("/api/admin/state");
  state = { ...structuredClone(initialState), ...result.state, settings: { ...initialState.settings, ...result.state.settings, notifications: { ...initialState.settings.notifications, ...result.state.settings?.notifications } } };
}

async function loadPublicState() {
  const result = await apiRequest("/api/public/state");
  state = {
    ...structuredClone(initialState),
    settings: { ...initialState.settings, ...result.settings, notifications: { ...initialState.settings.notifications, ...result.settings?.notifications } },
    services: result.services,
    therapists: result.therapists,
    appointments: [],
    customers: [],
    audit: [],
    admins: []
  };
}

async function loadCalendar() {
  if (!backendOnline || getRoute() !== "booking") return;
  const params = new URLSearchParams({ month: bookingCalendarMonth.slice(0, 7) });
  if (bookingDraft.serviceId) params.set("serviceId", bookingDraft.serviceId);
  if (bookingDraft.therapistId) params.set("therapistId", bookingDraft.therapistId);
  const key = params.toString();
  if (key === loadedCalendarKey) return;
  loadedCalendarKey = key;
  try {
    const result = await apiRequest(`/api/public/calendar?${params}`);
    calendarData = result.days || {};
    if (bookingDraft.date && calendarData[bookingDraft.date]) {
      bookingDraft.serverTimes = calendarData[bookingDraft.date].times || [];
    }
    if (getRoute() === "booking") render();
  } catch (error) {
    loadedCalendarKey = "";
    backendError = error.message;
    toast(error.message);
  }
}

async function initializeBackend() {
  try {
    const health = await apiRequest("/api/health");
    backendOnline = Boolean(health.ok);
    if (!backendOnline) return;
    const session = await apiRequest("/api/auth/session");
    authInfo = session;
    adminSession = session.admin;
    if (adminSession) await loadAdminState();
    else await loadPublicState();
    render();
  } catch (error) {
    backendOnline = false;
    backendError = error.message;
    console.warn("Clinic backend is unavailable; using the local demo data.", error);
    if (getRoute() === "admin") render();
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function todayString() {
  return localDateKey(new Date());
}
function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}
function formatPrice(value) {
  return `${Number(value || 0).toLocaleString("th-TH")} บาท`;
}
function getService(id) { return state.services.find(item => item.id === id); }
function getTherapist(id) { return state.therapists.find(item => item.id === id); }
function normalizePhone(phone) { return String(phone || "").replace(/\D/g, ""); }
function safeImageUrl(value) {
  const url = String(value || "").trim();
  return /^https:\/\//i.test(url) ? url : "";
}
function getRoute() { return location.hash.replace(/^#\/?/, "").split("/")[0] || "home"; }
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
function logAudit(action, detail) {
  state.audit.unshift({ id: crypto.randomUUID(), action, detail, at: new Date().toISOString(), actor: "เจ้าหน้าที่" });
  state.audit = state.audit.slice(0, 300);
}
function statusLabel(status) {
  return ({ Pending: "รอยืนยัน", Confirmed: "ยืนยันแล้ว", Completed: "เสร็จสิ้น", Cancelled: "ยกเลิก", "No-show": "ไม่มาตามนัด" })[status] || status;
}
function statusBadge(status) {
  const cls = ({ Pending: "pending", Confirmed: "confirmed", Completed: "completed", Cancelled: "cancelled", "No-show": "no-show" })[status] || "";
  return `<span class="status ${cls}">${statusLabel(status)}</span>`;
}
function activeAppointments() {
  return state.appointments.filter(item => !["Cancelled", "Completed", "No-show"].includes(item.status));
}
function appointmentOverlaps(dateStr, time, duration, therapistId = "", onlyUnassigned = false) {
  const [hour, minute] = time.split(":").map(Number);
  const start = hour * 60 + minute;
  const end = start + duration;
  return activeAppointments().some(item => {
    if (item.date !== dateStr || (therapistId && item.therapistId !== therapistId) || (onlyUnassigned && item.therapistId)) return false;
    const [existingHour, existingMinute] = item.time.split(":").map(Number);
    const existingStart = existingHour * 60 + existingMinute;
    const existingEnd = existingStart + Number(getService(item.serviceId)?.duration || 60);
    return start < existingEnd && end > existingStart;
  });
}
function dayClosed(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return !state.settings.openDays.includes(date.getDay()) || state.settings.holidays.some(item => (typeof item === "string" ? item : item.date) === dateStr);
}
function countDay(dateStr) {
  return activeAppointments().filter(item => item.date === dateStr).length;
}
function bookingWindowClosed(dateStr) {
  const latest = new Date();
  latest.setDate(latest.getDate() + Number(state.settings.advanceDays || 60));
  return dateStr < todayString() || dateStr > localDateKey(latest);
}
function dayStatus(dateStr, serviceId = "", therapistId = "") {
  if (backendOnline) return calendarData[dateStr]?.status || "closed";
  if (dayClosed(dateStr) || bookingWindowClosed(dateStr)) return "closed";
  if (countDay(dateStr) >= Number(state.settings.slotsPerDay || 9)) return "full";
  if (serviceId && !getAvailableTimes(dateStr, serviceId, therapistId).length) return "full";
  return "available";
}
function therapistOptions(serviceId, dateStr) {
  const service = getService(serviceId);
  if (!service) return [];
  return state.therapists.filter(person => person.active && person.serviceIds.includes(serviceId) && (!dateStr || (person.days.includes(new Date(`${dateStr}T00:00:00`).getDay()) && !person.leave.includes(dateStr))));
}
function getAvailableTimes(dateStr, serviceId, therapistId) {
  if (backendOnline) return calendarData[dateStr]?.times || [];
  const service = getService(serviceId);
  if (!service || dayStatus(dateStr) !== "available") return [];
  const candidates = therapistId ? therapistOptions(serviceId, dateStr).filter(person => person.id === therapistId) : therapistOptions(serviceId, dateStr);
  if (therapistId && !candidates.length) return [];
  const startsAt = state.settings.openTime;
  const endsAt = state.settings.closeTime;
  const [sh, sm] = startsAt.split(":").map(Number);
  const [eh, em] = endsAt.split(":").map(Number);
  const duration = Number(service.duration || 60);
  const slots = [];
  for (let minute = sh * 60 + sm; minute + duration <= eh * 60 + em; minute += 30) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    if (dateStr === todayString()) {
      const now = new Date();
      if (minute <= now.getHours() * 60 + now.getMinutes() + Number(state.settings.cutoffHours || 0) * 60) continue;
    }
    const availableProvider = candidates.some(person => {
      const [personStartHour, personStartMinute] = (person.from || startsAt).split(":").map(Number);
      const [personEndHour, personEndMinute] = (person.to || endsAt).split(":").map(Number);
      if (minute < personStartHour * 60 + personStartMinute || minute + duration > personEndHour * 60 + personEndMinute) return false;
      const breakMatch = String(person.break || "").match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
      if (breakMatch) {
        const breakStart = Number(breakMatch[1]) * 60 + Number(breakMatch[2]);
        const breakEnd = Number(breakMatch[3]) * 60 + Number(breakMatch[4]);
        if (minute < breakEnd && minute + duration > breakStart) return false;
      }
      return !appointmentOverlaps(dateStr, time, duration, person.id);
    });
    const hasUnassignedBooking = appointmentOverlaps(dateStr, time, duration, "", true);
    if ((candidates.length ? availableProvider : true) && !hasUnassignedBooking) slots.push(time);
  }
  return slots;
}
function bookingCalendarMarkup() {
  const monthDate = new Date(`${bookingCalendarMonth}T00:00:00`);
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const offset = firstDay.getDay();
  const label = monthDate.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const previousMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
  const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  const previousKey = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const nextKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const minMonth = `${todayString().slice(0, 7)}-01`;
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + Number(state.settings.advanceDays || 60));
  const maxMonth = `${localDateKey(maxDate).slice(0, 7)}-01`;
  const cells = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map(day => `<div class="calendar-cell weekday">${day}</div>`);
  for (let i = 0; i < offset; i += 1) cells.push('<div class="calendar-cell disabled"></div>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const status = dayStatus(dateStr, bookingDraft.serviceId, bookingDraft.therapistId);
    const selected = dateStr === bookingDraft.date;
    const statusText = ({ available: "ว่าง", full: "เต็ม", closed: "ปิด" })[status];
    const clickable = status === "available";
    cells.push(clickable
      ? `<button type="button" class="calendar-cell day ${selected ? "selected" : ""}" data-calendar-date="${dateStr}" aria-label="${formatDate(dateStr)}: ${statusText}"><span class="day-number">${day}</span><span class="day-status ${status}">${statusText}</span></button>`
      : `<div class="calendar-cell day disabled" aria-label="${formatDate(dateStr)}: ${statusText}"><span class="day-number">${day}</span><span class="day-status ${status}">${statusText}</span></div>`);
  }
  while (cells.length % 7) cells.push('<div class="calendar-cell disabled"></div>');
  return `<div class="calendar-toolbar"><button type="button" data-calendar-month="${previousKey}" ${previousKey < minMonth ? "disabled" : ""} aria-label="เดือนก่อนหน้า">‹</button><span class="calendar-month">${escapeHtml(label)}</span><button type="button" data-calendar-month="${nextKey}" ${nextKey > maxMonth ? "disabled" : ""} aria-label="เดือนถัดไป">›</button></div><div class="calendar-grid">${cells.join("")}</div><div class="calendar-legend"><span><i class="available"></i> มีคิวว่าง</span><span><i class="full"></i> คิวเต็ม</span><span><i class="closed"></i> ปิดทำการ</span></div>`;
}
function ensureCustomer(name, phone) {
  const phoneDigits = normalizePhone(phone);
  let customer = phoneDigits ? state.customers.find(item => normalizePhone(item.phone) === phoneDigits) : null;
  if (!customer) {
    customer = { id: crypto.randomUUID(), name, phone, active: true, createdAt: new Date().toISOString(), notes: "" };
    state.customers.push(customer);
  } else {
    customer.name = name;
  }
  return customer;
}
function generateBookingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "WU";
    for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  } while (state.appointments.some(item => item.code === code));
  return code;
}

function renderHome() {
  const services = state.services.filter(item => item.active).sort((a, b) => a.order - b.order);
  const announcement = state.settings.announcement;
  const heroImage = state.settings.heroImage && state.settings.heroImage.startsWith("data:image/") ? `<img class="hero-photo" src="${escapeHtml(state.settings.heroImage)}" alt="" aria-hidden="true">` : "";
  const faqs = state.settings.faq.split("\n").map(line => line.split("|")).filter(parts => parts.length > 1 && parts[0].trim()).map(([question, answer]) => `<details class="faq-item"><summary>${escapeHtml(question.trim())}</summary><p>${escapeHtml(answer.trim())}</p></details>`).join("");
  return `<section class="hero">${heroImage}<div class="hero-inner">
    <span class="eyebrow">WALAILAK UNIVERSITY MEDICAL CENTER</span>
    <h1>ศาสตร์ดั้งเดิม<br>เพื่อ <em>สุขภาพที่สมดุล</em></h1>
    <p class="hero-copy">ดูแลสุขภาพกายและใจด้วยภูมิปัญญาการแพทย์แผนไทย โดยทีมผู้ให้บริการที่พร้อมดูแลคุณอย่างใส่ใจ</p>
    <div class="hero-actions"><a class="button button-primary" href="#booking">จองบริการ →</a><a class="button button-outline" href="#services">ดูบริการทั้งหมด</a></div>
    <div class="hero-note"><span></span>${escapeHtml(state.settings.openTime)}–${escapeHtml(state.settings.closeTime)} น. · ${state.settings.openDays.map(day => ["อา","จ","อ","พ","พฤ","ศ","ส"][day]).join("–")}</div>
  </div></section>
  <section class="section"><div class="section-heading"><div><span class="eyebrow">OUR SERVICES</span><h2>บริการของเรา</h2><p>เลือกการดูแลที่เหมาะกับคุณ โดยทีมแพทย์แผนไทย</p></div><a class="button button-outline" href="#services">ดูบริการทั้งหมด →</a></div>
    <div class="service-grid">${services.slice(0, 3).map(serviceCard).join("")}</div></section>
  <section class="section" style="padding-top:0"><div class="notice-bar"><p><strong>ประกาศจากคลินิก</strong>${escapeHtml(announcement)}</p><a class="button button-primary" href="#booking">นัดหมายเลย</a></div>
  ${holidayNoticeMarkup()}<div class="section-heading mt-16"><div><span class="eyebrow">FAQ</span><h2>คำถามที่พบบ่อย</h2></div></div><div class="faq-list">${faqs || emptyState("ยังไม่มีคำถามที่พบบ่อย", "")}</div></section>`;
}
function holidayNoticeMarkup() {
  const today = todayString();
  const lastDate = new Date();
  lastDate.setDate(lastDate.getDate() + 60);
  const lastKey = localDateKey(lastDate);
  const holidays = state.settings.holidays.filter(item => {
    const date = typeof item === "string" ? item : item.date;
    return date >= today && date <= lastKey;
  }).sort((a, b) => String(typeof a === "string" ? a : a.date).localeCompare(String(typeof b === "string" ? b : b.date)));
  if (!holidays.length) return "";
  return `<div class="holiday-notices"><h3>วันหยุดและวันปิดบริการที่กำลังจะถึง</h3>${holidays.map(item => `<div><strong>${formatDate(typeof item === "string" ? item : item.date)}</strong><span>${escapeHtml(typeof item === "string" ? "ปิดทำการ" : item.label)}</span></div>`).join("")}</div>`;
}
function serviceCard(service) {
  const image = safeImageUrl(service.imageUrl);
  return `<article class="service-card">${image ? `<img class="service-image" src="${escapeHtml(image)}" alt="${escapeHtml(service.name)}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="service-icon">${escapeHtml(service.icon || "✳")}</div>`}<h3>${escapeHtml(service.name)}</h3><p>${escapeHtml(service.description)}</p><div class="service-meta"><span>◷ ${Number(service.duration)} นาที</span><span>${service.therapistRequired ? "เลือกแพทย์แผนไทย" : "เลือกแพทย์ได้"}</span></div><div class="service-price"><span>${formatPrice(service.price)}</span><a href="#booking" data-book-service="${escapeHtml(service.id)}" aria-label="นัดหมาย ${escapeHtml(service.name)}">→</a></div></article>`;
}
function renderServices() {
  const services = state.services.filter(item => item.active).sort((a, b) => a.order - b.order);
  return `<section class="page-shell"><div class="page-heading"><span class="eyebrow">OUR SERVICES</span><h1 class="page-title">บริการและอัตราค่าบริการ</h1><p class="lead">เลือกการดูแลที่เหมาะกับคุณ สามารถนัดหมายล่วงหน้าได้ ${Number(state.settings.advanceDays)} วัน</p></div><div class="service-grid">${services.map(serviceCard).join("") || emptyState("ยังไม่มีบริการที่เปิดให้จอง", "")}</div><div class="alert mt-16">ค่าบริการอาจเปลี่ยนแปลงได้ กรุณาตรวจสอบราคากับเจ้าหน้าที่ก่อนเข้ารับบริการ</div></section>`;
}
function emptyState(title, text) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(text)}</div>`;
}

function renderBooking() {
  const service = getService(bookingDraft.serviceId);
  const therapists = therapistOptions(bookingDraft.serviceId, bookingDraft.date);
  if (bookingDraft.therapistId && !therapists.some(person => person.id === bookingDraft.therapistId)) bookingDraft.therapistId = "";
  const slots = bookingDraft.date ? getAvailableTimes(bookingDraft.date, bookingDraft.serviceId, bookingDraft.therapistId) : [];
  return `<section class="page-shell"><div class="page-heading"><span class="eyebrow">BOOK AN APPOINTMENT</span><h1 class="page-title">นัดหมายเข้ารับบริการ</h1><p class="lead">เลือกบริการ วันเวลา และกรอกข้อมูลเพื่อยืนยันการนัดหมาย</p></div>
  ${backendOnline ? '<div class="alert mt-16">การจองและข้อมูลนัดหมายบันทึกไว้บนเซิร์ฟเวอร์ของคลินิกแล้ว</div>' : `<div class="alert warning mt-16">${escapeHtml(backendError || "เซิร์ฟเวอร์ยังไม่เชื่อมต่อ การจองจะเก็บในเบราว์เซอร์นี้เท่านั้น")}</div>`}
  ${state.settings.onlineBooking ? "" : '<div class="alert warning">ขณะนี้ปิดรับนัดหมายออนไลน์ กรุณาติดต่อคลินิกทางโทรศัพท์</div>'}
  <div class="booking-layout mt-16"><form class="panel" id="booking-form">
    <div class="step-label"><span class="step-num">1</span>เลือกบริการและแพทย์แผนไทย</div>
    <div class="form-grid"><div class="field full"><label for="booking-service">บริการ *</label><select id="booking-service" name="serviceId" required><option value="">เลือกบริการ</option>${state.services.filter(item => item.active).sort((a, b) => a.order - b.order).map(item => `<option value="${escapeHtml(item.id)}" ${item.id === bookingDraft.serviceId ? "selected" : ""}>${escapeHtml(item.name)} · ${formatPrice(item.price)}</option>`).join("")}</select></div>
      ${service ? `<div class="field full"><span class="field-help">${escapeHtml(service.description)} · ${Number(service.duration)} นาที</span></div>` : ""}
      <div class="field"><label for="booking-therapist">แพทย์แผนไทย ${service?.therapistRequired ? "*" : "(ไม่บังคับ)"}</label><select id="booking-therapist" name="therapistId" ${service?.therapistRequired ? "required" : ""}><option value="">ไม่ระบุ / เลือกได้ภายหลัง</option>${therapists.map(person => `<option value="${escapeHtml(person.id)}" ${person.id === bookingDraft.therapistId ? "selected" : ""}>${escapeHtml(person.name)}</option>`).join("")}</select><span class="field-help">เลือกแพทย์ที่ว่างและมีคุณสมบัติตรงกับบริการ</span></div></div>
    <div class="step-label"><span class="step-num">2</span>เลือกวันและเวลา</div>
    ${bookingCalendarMarkup()}
    ${bookingDraft.date ? `<div class="alert mt-16">วันที่เลือก: ${formatDate(bookingDraft.date)} · ${escapeHtml(bookingDraft.time || "เลือกเวลาที่ต้องการด้านล่าง")}</div>` : ""}
    ${bookingDraft.date ? `<div class="slot-grid">${slots.length ? slots.map(time => `<button type="button" class="slot ${bookingDraft.time === time ? "selected" : ""}" data-slot="${time}">${time}</button>`).join("") : emptyState("ไม่มีเวลาว่างในวันที่เลือก", "ลองเลือกวันอื่น หรือเปลี่ยนแพทย์แผนไทย")}</div>` : ""}
    <div class="step-label"><span class="step-num">3</span>ข้อมูลผู้เข้ารับบริการ</div>
    <div class="form-grid"><div class="field"><label for="booking-name">ชื่อ-นามสกุล ${state.settings.requiredName ? "*" : "(ไม่บังคับ)"}</label><input id="booking-name" name="name" autocomplete="name" ${state.settings.requiredName ? "required" : ""} maxlength="100" placeholder="ชื่อผู้เข้ารับบริการ"></div><div class="field"><label for="booking-phone">เบอร์โทรศัพท์ ${state.settings.requiredPhone ? "*" : "(ไม่บังคับ)"}</label><input id="booking-phone" name="phone" type="tel" autocomplete="tel" ${state.settings.requiredPhone ? "required" : ""} maxlength="20" pattern="[0-9+()\\- ]{8,20}" placeholder="08X-XXX-XXXX"></div><div class="field full"><label for="booking-note">หมายเหตุ (ไม่บังคับ)</label><textarea id="booking-note" name="note" maxlength="500" placeholder="ข้อมูลเพิ่มเติมที่ต้องการแจ้งเจ้าหน้าที่"></textarea></div></div>
    <div class="mt-16"><button class="button button-primary" type="submit" ${state.settings.onlineBooking ? "" : "disabled"}>ยืนยันการนัดหมาย →</button></div>
  </form>
  <aside class="summary-card"><h3>สรุปการนัดหมาย</h3><div class="summary-line"><span>บริการ</span><strong>${escapeHtml(service?.name || "ยังไม่ได้เลือก")}</strong></div><div class="summary-line"><span>แพทย์แผนไทย</span><strong>${escapeHtml(getTherapist(bookingDraft.therapistId)?.name || "ไม่ระบุ")}</strong></div><div class="summary-line"><span>วันที่</span><strong>${bookingDraft.date ? formatDate(bookingDraft.date) : "—"}</strong></div><div class="summary-line"><span>เวลา</span><strong>${escapeHtml(bookingDraft.time || "—")}</strong></div><div class="summary-total"><span>ค่าบริการ</span><span>${service ? formatPrice(service.price) : "—"}</span></div><button class="button button-primary" type="submit" form="booking-form" ${state.settings.onlineBooking ? "" : "disabled"}>ยืนยันนัดหมาย</button><p class="privacy-copy">ข้อมูลของท่านจะใช้สำหรับจัดการนัดหมายและการให้บริการเท่านั้น</p></aside></div></section>`;
}
function renderLookup() {
  return `<section class="page-shell"><div class="page-heading"><span class="eyebrow">MANAGE YOUR BOOKING</span><h1 class="page-title">ตรวจสอบและจัดการนัดหมาย</h1><p class="lead">กรอกรหัสนัดหมายและเบอร์โทรศัพท์ที่ใช้จอง</p></div><div class="panel lookup-panel">
    <form id="lookup-form"><div class="form-grid"><div class="field"><label for="lookup-code">รหัสนัดหมาย</label><input id="lookup-code" name="code" required placeholder="WUXXXXXX" autocomplete="off"></div><div class="field"><label for="lookup-phone">เบอร์โทรศัพท์ ${state.settings.requiredPhone ? "*" : "(หากมี)"}</label><input id="lookup-phone" name="phone" type="tel" ${state.settings.requiredPhone ? "required" : ""} placeholder="เบอร์โทรศัพท์ที่ใช้จอง"></div></div><button class="button button-primary mt-16" type="submit">ค้นหานัดหมาย</button></form>
    <div id="lookup-result" class="lookup-result">${lookupResult ? lookupResultMarkup(lookupResult) : ""}</div></div>
    <p class="small muted" style="text-align:center;margin-top:20px">หากไม่ทราบรหัสนัดหมาย กรุณาติดต่อคลินิก ${escapeHtml(state.settings.phone)}</p></section>`;
}
function lookupResultMarkup(appointment) {
  if (!appointment) return `<div class="alert warning mt-16">ไม่พบนัดหมายที่ตรงกับรหัสและเบอร์โทรศัพท์ กรุณาตรวจสอบข้อมูลอีกครั้ง</div>`;
  const customer = appointment.customer || state.customers.find(item => item.id === appointment.customerId);
  const service = appointment.service || getService(appointment.serviceId);
  const therapist = appointment.therapist || getTherapist(appointment.therapistId);
  const eligible = ["Pending", "Confirmed"].includes(appointment.status) && hoursUntil(appointment.date, appointment.time) >= Number(state.settings.cutoffHours);
  const canCancel = state.settings.allowCancel && eligible;
  const canReschedule = state.settings.allowReschedule && eligible;
  return `<div class="panel mt-16"><div class="result-code">${escapeHtml(appointment.code)}</div><div class="summary-line"><span>ชื่อ</span><strong>${escapeHtml(customer?.name || appointment.name || "—")}</strong></div><div class="summary-line"><span>บริการ</span><strong>${escapeHtml(service?.name || "—")}</strong></div><div class="summary-line"><span>วันที่และเวลา</span><strong>${formatDate(appointment.date)} · ${escapeHtml(appointment.time)}</strong></div><div class="summary-line"><span>แพทย์แผนไทย</span><strong>${escapeHtml(therapist?.name || "ยังไม่ระบุ")}</strong></div><div class="summary-line"><span>สถานะ</span><strong>${statusBadge(appointment.status)}</strong></div>${appointment.note ? `<div class="summary-line"><span>หมายเหตุ</span><strong>${escapeHtml(appointment.note)}</strong></div>` : ""}<div class="result-actions">${canCancel ? `<button class="button button-danger button-small" data-cancel-booking="${escapeHtml(appointment.code)}">ยกเลิกนัด</button>` : ""}${canReschedule ? `<button class="button button-outline button-small" data-reschedule-booking="${escapeHtml(appointment.code)}">เปลี่ยนวัน/เวลา</button>` : ""}</div>${eligible && !canCancel && !canReschedule ? `<p class="field-help">กรุณาติดต่อคลินิกเพื่อแก้ไขนัดหมาย</p>` : !eligible && ["Pending", "Confirmed"].includes(appointment.status) ? `<p class="field-help">กรุณาติดต่อคลินิกก่อนเวลานัดอย่างน้อย ${Number(state.settings.cutoffHours)} ชั่วโมง</p>` : ""}</div>`;
}
function hoursUntil(date, time) {
  return (new Date(`${date}T${time}:00`).getTime() - Date.now()) / 3600000;
}
function renderContact() {
  return `<section class="page-shell"><div class="page-heading"><span class="eyebrow">CONTACT & OPENING HOURS</span><h1 class="page-title">เราพร้อมดูแลคุณ</h1><p class="lead">สอบถามข้อมูลบริการและการนัดหมายได้ในเวลาทำการ</p></div><div class="contact-grid"><article class="contact-card"><div class="service-icon">◷</div><h3>เวลาทำการ</h3><p>${state.settings.openDays.map(day => ["อา","จ","อ","พ","พฤ","ศ","ส"][day]).join("–")}<br>${escapeHtml(state.settings.openTime)}–${escapeHtml(state.settings.closeTime)} น.<br>ปิดวันหยุดพิเศษ</p></article><article class="contact-card"><div class="service-icon">☎</div><h3>โทรศัพท์</h3><p><a href="tel:${escapeHtml(state.settings.phone)}">${escapeHtml(state.settings.phone)}</a><br>กรุณาติดต่อในเวลาทำการ</p></article><article class="contact-card"><div class="service-icon">⌖</div><h3>สถานที่ตั้ง</h3><p>${escapeHtml(state.settings.address)}<br>LINE: ${escapeHtml(state.settings.line)}</p></article></div>
  ${state.settings.announcement ? `<div class="notice-bar mt-16"><p><strong>ประกาศ</strong>${escapeHtml(state.settings.announcement)}</p></div>` : ""}${holidayNoticeMarkup()}<div class="alert mt-16">นัดหมายออนไลน์ล่วงหน้าได้สูงสุด ${Number(state.settings.advanceDays)} วัน · ขอเปลี่ยนหรือยกเลิกก่อนเวลานัดอย่างน้อย ${Number(state.settings.cutoffHours)} ชั่วโมง</div></section>`;
}

function renderAdmin() {
  if (!backendOnline) {
    return `<section class="page-shell"><div class="page-heading"><span class="eyebrow">CLINIC MANAGEMENT</span><h1 class="page-title">เชื่อมต่อระบบหลังบ้าน</h1></div><div class="panel lookup-panel"><div class="alert warning">${escapeHtml(backendError || "กรุณาเริ่มเซิร์ฟเวอร์เพื่อใช้งานหลังบ้าน")}</div><p class="small muted">เปิด Terminal ในโฟลเดอร์โครงการ แล้วรัน <code>node server.js</code></p></div></section>`;
  }
  if (!adminSession) return renderAdminAuth();
  const allTabs = [
    ["dashboard", "ภาพรวม"], ["appointments", "นัดหมาย"], ["customers", "ผู้รับบริการ"], ["therapists", "แพทย์แผนไทย"], ["services", "บริการ"], ["schedule", "ตารางและวันปิด"], ["reports", "รายงาน"], ["settings", "ตั้งค่าระบบ"], ["admins", "บัญชีและประวัติ"]
  ];
  const permissionForTab = { dashboard: "appointments", appointments: "appointments", customers: "customers", therapists: "staff", services: "staff", schedule: "settings", reports: "reports", settings: "settings", admins: "staff" };
  const tabs = allTabs.filter(([id]) => adminSession.permissions?.includes(permissionForTab[id]) || adminSession.role === "ผู้ดูแลระบบ");
  if (!tabs.some(([id]) => id === activeAdminTab)) activeAdminTab = tabs[0]?.[0] || "dashboard";
  return `<section class="page-shell admin-shell"><div class="admin-top"><div><span class="eyebrow">CLINIC MANAGEMENT</span><h1 class="page-title">ระบบจัดการคลินิก</h1><p class="lead">ลงชื่อเข้าใช้: ${escapeHtml(adminSession.name)} · ข้อมูลบันทึกบนเซิร์ฟเวอร์</p></div><div class="table-actions"><a class="button button-outline button-small" href="#home">กลับหน้าเว็บไซต์ ↗</a><button class="button button-outline button-small" data-action="logout">ออกจากระบบ</button></div></div>
  ${backendError ? `<div class="alert warning mt-16">${escapeHtml(backendError)}</div>` : ""}
  <div class="admin-layout"><nav class="panel admin-menu" aria-label="เมนูจัดการ">${tabs.map(([id, title]) => `<button data-admin-tab="${id}" class="${activeAdminTab === id ? "active" : ""}">${title}</button>`).join("")}</nav><div class="admin-content">${renderAdminTab()}</div></div></section>`;
}

function renderAdminAuth() {
  const setup = Boolean(authInfo.setupRequired);
  return `<section class="page-shell"><div class="page-heading"><span class="eyebrow">SECURE STAFF ACCESS</span><h1 class="page-title">${setup ? "ตั้งค่าผู้ดูแลระบบคนแรก" : "เข้าสู่ระบบเจ้าหน้าที่"}</h1><p class="lead">${setup ? "สร้างบัญชีผู้ดูแลระบบ บัญชีนี้ใช้ควบคุมระบบหลังบ้าน" : "เข้าสู่ระบบเพื่อจัดการข้อมูลคลินิก"}</p></div><form class="panel lookup-panel" id="auth-form">
    ${setup ? `<div class="field"><label for="auth-name">ชื่อผู้ดูแล *</label><input id="auth-name" name="name" required minlength="2" maxlength="100" autocomplete="name"></div>` : ""}
    <div class="field mt-16"><label for="auth-email">อีเมล *</label><input id="auth-email" name="email" type="email" required autocomplete="username"></div>
    <div class="field mt-16"><label for="auth-password">รหัสผ่าน * (${setup ? "อย่างน้อย 12 ตัวอักษร" : ""})</label><input id="auth-password" name="password" type="password" required ${setup ? "minlength=\"12\"" : ""} maxlength="256" autocomplete="${setup ? "new-password" : "current-password"}"></div>
    <button class="button button-primary mt-16" type="submit">${setup ? "สร้างบัญชีผู้ดูแล" : "เข้าสู่ระบบ"}</button>
    ${setup ? '<p class="field-help mt-16">ตั้งค่าครั้งเดียว ระบบจะจัดเก็บรหัสผ่านแบบแฮชบนเซิร์ฟเวอร์</p>' : ""}
    ${backendError ? `<div class="alert warning mt-16">${escapeHtml(backendError)}</div>` : ""}
  </form></section>`;
}
function renderAdminTab() {
  switch (activeAdminTab) {
    case "appointments": return adminAppointments();
    case "customers": return adminCustomers();
    case "therapists": return adminTherapists();
    case "services": return adminServices();
    case "schedule": return adminSchedule();
    case "reports": return adminReports();
    case "settings": return adminSettings();
    case "admins": return adminAdmins();
    default: return adminDashboard();
  }
}
function adminDashboard() {
  const today = todayString();
  const appointments = state.appointments;
  const todayCount = appointments.filter(item => item.date === today && item.status !== "Cancelled").length;
  const upcoming = appointments.filter(item => item.date >= today && ["Pending", "Confirmed"].includes(item.status)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 7);
  const last7 = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const key = localDateKey(date);
    return { key, count: appointments.filter(item => item.date === key && item.status !== "Cancelled").length };
  });
  const maxCount = Math.max(1, ...last7.map(item => item.count));
  const popular = state.services.map(service => ({ name: service.name, count: appointments.filter(item => item.serviceId === service.id && item.status !== "Cancelled").length })).sort((a, b) => b.count - a.count).slice(0, 4);
  const workloads = state.therapists.map(person => ({ name: person.name, count: appointments.filter(item => item.therapistId === person.id && item.status !== "Cancelled").length }));
  return `<div class="stat-grid">${[
    ["นัดหมายวันนี้", todayCount, "รายการที่ไม่ถูกยกเลิก"], ["นัดหมายทั้งหมด", appointments.filter(item => item.status !== "Cancelled").length, "รวมทุกสถานะ"], ["รอยืนยัน", appointments.filter(item => item.status === "Pending").length, "รายการรอดำเนินการ"], ["ผู้รับบริการ", state.customers.length, "ประวัติลูกค้าในระบบ"]
  ].map(([label, value, note]) => `<article class="stat-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join("")}</div>
  <div class="split-panels"><section class="panel"><h2>นัดหมาย 7 วันที่ผ่านมา</h2><div class="chart-bars">${last7.map(item => `<div class="chart-column"><div class="chart-bar" style="height:${Math.max(3, item.count / maxCount * 100)}%"></div><span>${new Date(`${item.key}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short" })}</span></div>`).join("")}</div></section>
  <section class="panel"><h2>บริการยอดนิยม</h2><ul class="rank-list">${popular.map(item => `<li><span>${escapeHtml(item.name)}</span><span class="rank-value">${item.count} ครั้ง</span></li>`).join("") || emptyState("ยังไม่มีข้อมูล", "")}</ul></section></div>
  <div class="split-panels mt-16"><section class="panel"><h2>ภาระงานแพทย์แผนไทย</h2><ul class="rank-list">${workloads.map(item => `<li><span>${escapeHtml(item.name)}</span><span class="rank-value">${item.count} นัด</span></li>`).join("") || emptyState("ยังไม่มีแพทย์แผนไทย", "")}</ul></section>
  <section class="panel"><h2>นัดหมายถัดไป</h2>${upcoming.length ? `<div class="table-wrap"><table><thead><tr><th>วันเวลา</th><th>ผู้รับบริการ</th><th>บริการ</th><th>สถานะ</th></tr></thead><tbody>${upcoming.map(item => `<tr><td>${formatDate(item.date)} ${escapeHtml(item.time)}</td><td>${escapeHtml(customerFor(item)?.name || "—")}</td><td>${escapeHtml(getService(item.serviceId)?.name || "—")}</td><td>${statusBadge(item.status)}</td></tr>`).join("")}</tbody></table></div>` : emptyState("ยังไม่มีนัดหมายถัดไป", "รายการนัดหมายจะแสดงที่นี่")}</section></div>`;
}
function customerFor(appointment) { return state.customers.find(person => person.id === appointment.customerId); }
function adminAppointments() {
  const q = document.getElementById("admin-search")?.value?.trim().toLowerCase() || "";
  const status = document.getElementById("admin-status")?.value || "";
  const serviceId = document.getElementById("admin-service")?.value || "";
  const therapistId = document.getElementById("admin-therapist")?.value || "";
  const date = document.getElementById("admin-date")?.value || "";
  const filtered = state.appointments.filter(item => {
    const customer = customerFor(item);
    const matchesText = !q || `${item.code} ${customer?.name || ""} ${customer?.phone || ""}`.toLowerCase().includes(q);
    return matchesText && (!status || item.status === status) && (!serviceId || item.serviceId === serviceId) && (!therapistId || item.therapistId === therapistId) && (!date || item.date === date);
  }).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  return `<section class="panel"><div class="section-heading"><div><h2>จัดการนัดหมาย</h2><p>ค้นหา ปรับสถานะ และติดตามประวัติ</p></div><button class="button button-primary button-small" data-action="new-appointment">+ สร้างนัดหมาย</button></div>
    <div class="toolbar"><input id="admin-search" type="search" placeholder="ค้นหาชื่อ เบอร์โทร หรือรหัสนัด" value="${escapeHtml(q)}"><select id="admin-status"><option value="">ทุกสถานะ</option>${["Pending","Confirmed","Completed","Cancelled","No-show"].map(item => `<option value="${item}" ${status === item ? "selected" : ""}>${statusLabel(item)}</option>`).join("")}</select><select id="admin-service"><option value="">ทุกบริการ</option>${state.services.map(item => `<option value="${item.id}" ${serviceId === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><select id="admin-therapist"><option value="">แพทย์ทุกคน</option>${state.therapists.map(item => `<option value="${item.id}" ${therapistId === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><input id="admin-date" type="date" aria-label="กรองวันที่" value="${escapeHtml(date)}"></div>
    <div class="table-wrap"><table><thead><tr><th>รหัส</th><th>วันและเวลา</th><th>ผู้รับบริการ</th><th>บริการ / แพทย์</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${filtered.map(item => appointmentRow(item)).join("") || `<tr><td colspan="6">${emptyState("ไม่พบนัดหมาย", "")}</td></tr>`}</tbody></table></div></section>`;
}
function appointmentRow(item) {
  return `<tr data-appointment-date="${escapeHtml(item.date)}"><td><strong>${escapeHtml(item.code)}</strong></td><td>${formatDate(item.date)}<br>${escapeHtml(item.time)}</td><td>${escapeHtml(customerFor(item)?.name || "—")}<br><span class="small muted">${escapeHtml(customerFor(item)?.phone || "")}</span></td><td>${escapeHtml(getService(item.serviceId)?.name || "—")}<br><span class="small muted">${escapeHtml(getTherapist(item.therapistId)?.name || "ไม่ระบุ")}</span></td><td><select class="status-select" data-status-id="${item.id}" aria-label="เปลี่ยนสถานะ">${["Pending","Confirmed","Completed","Cancelled","No-show"].map(status => `<option value="${status}" ${status === item.status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></td><td><div class="table-actions"><button class="button button-outline button-small" data-edit-appointment="${item.id}">แก้ไข</button><button class="button button-outline button-small" data-appointment-history="${item.id}">ประวัติ</button></div></td></tr>`;
}
function adminCustomers() {
  const q = document.getElementById("customer-search")?.value?.trim().toLowerCase() || "";
  const customers = state.customers.filter(item => !q || `${item.name} ${item.phone}`.toLowerCase().includes(q));
  return `<section class="panel"><div class="section-heading"><div><h2>ผู้รับบริการ</h2><p>ปิดใช้งานบัญชีได้โดยไม่ลบประวัติการรักษาและการนัดหมาย</p></div></div><div class="toolbar"><input id="customer-search" type="search" placeholder="ค้นหาชื่อหรือเบอร์โทร" value="${escapeHtml(q)}"></div><div class="table-wrap"><table><thead><tr><th>ชื่อ</th><th>เบอร์โทร</th><th>จำนวนครั้ง</th><th>มาใช้บริการ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${customers.map(person => {
    const bookings = state.appointments.filter(item => item.customerId === person.id);
    return `<tr><td>${escapeHtml(person.name || "—")}</td><td>${escapeHtml(person.phone || "—")}</td><td>${bookings.length}</td><td>${bookings.filter(item => item.status === "Completed").length}</td><td><span class="status ${person.active ? "confirmed" : "cancelled"}">${person.active ? "ใช้งาน" : "ปิดใช้งาน"}</span></td><td><div class="table-actions"><button class="button button-outline button-small" data-customer-history="${person.id}">ประวัติ</button><button class="button button-outline button-small" data-toggle-customer="${person.id}">${person.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button></div></td></tr>`;
  }).join("") || `<tr><td colspan="6">${emptyState("ยังไม่มีข้อมูลผู้รับบริการ", "ข้อมูลจะถูกสร้างเมื่อมีการจอง")}</td></tr>`}</tbody></table></div></section>`;
}
function adminTherapists() {
  return `<section class="panel"><div class="section-heading"><div><h2>แพทย์แผนไทย</h2><p>จัดการคุณสมบัติ ตารางทำงาน และวันลา</p></div><button class="button button-primary button-small" data-action="new-therapist">+ เพิ่มแพทย์</button></div><div class="table-wrap"><table><thead><tr><th>ชื่อ</th><th>บริการที่ดูแล</th><th>วันทำงาน</th><th>เวลาทำงาน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${state.therapists.map(person => `<tr><td>${escapeHtml(person.name)}<br><span class="small muted">${escapeHtml(person.phone)}</span></td><td>${person.serviceIds.map(id => escapeHtml(getService(id)?.name || "")).filter(Boolean).join(", ") || "—"}</td><td>${person.days.map(day => ["อา","จ","อ","พ","พฤ","ศ","ส"][day]).join(" ")}</td><td>${escapeHtml(person.from)}–${escapeHtml(person.to)}<br><span class="small muted">พัก ${escapeHtml(person.break || "—")}</span></td><td><span class="status ${person.active ? "confirmed" : "cancelled"}">${person.active ? "เปิดรับนัด" : "ปิด"}</span></td><td><div class="table-actions"><button class="button button-outline button-small" data-edit-therapist="${person.id}">แก้ไข</button><button class="button button-outline button-small" data-toggle-therapist="${person.id}">${person.active ? "ปิด" : "เปิด"}</button></div></td></tr>`).join("") || `<tr><td colspan="6">${emptyState("ยังไม่มีแพทย์แผนไทย", "")}</td></tr>`}</tbody></table></div></section>`;
}
function adminServices() {
  return `<section class="panel"><div class="section-heading"><div><h2>บริการและค่าบริการ</h2><p>กำหนดราคา ระยะเวลา และแพทย์ที่ให้บริการ</p></div><button class="button button-primary button-small" data-action="new-service">+ เพิ่มบริการ</button></div><div class="table-wrap"><table><thead><tr><th>บริการ</th><th>ราคา</th><th>ระยะเวลา</th><th>ผู้ให้บริการ</th><th>ต้องเลือกแพทย์</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${state.services.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${formatPrice(item.price)}</td><td>${item.duration} นาที</td><td>${item.therapistIds.map(id => escapeHtml(getTherapist(id)?.name || "")).filter(Boolean).join(", ") || "—"}</td><td>${item.therapistRequired ? "ต้องเลือก" : "ไม่บังคับ"}</td><td><span class="status ${item.active ? "confirmed" : "cancelled"}">${item.active ? "เปิด" : "ปิด"}</span></td><td><div class="table-actions"><button class="button button-outline button-small" data-edit-service="${item.id}">แก้ไข</button><button class="button button-outline button-small" data-toggle-service="${item.id}">${item.active ? "ปิด" : "เปิด"}</button></div></td></tr>`).join("")}</tbody></table></div></section>`;
}
function adminSchedule() {
  return `<section class="panel"><div class="section-heading"><div><h2>ตารางให้บริการและวันปิด</h2><p>กำหนดวันหยุดพิเศษและตรวจดูจำนวนคิวต่อวัน</p></div></div><div class="toolbar"><input type="date" id="schedule-date" value="${todayString()}"><input type="text" id="holiday-label" maxlength="80" placeholder="เหตุผล / ชื่อวันหยุด"><button class="button button-primary button-small" data-action="add-holiday">เพิ่มวันปิด</button></div><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>สถานะ</th><th>คิวที่จอง</th><th>ความจุสูงสุด</th><th>จัดการ</th></tr></thead><tbody>${Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i);   const date = localDateKey(d); const holiday = state.settings.holidays.find(item => (typeof item === "string" ? item : item.date) === date); const status = dayStatus(date); return `<tr><td>${formatDate(date)} ${holiday ? `<br><span class="small muted">${escapeHtml(typeof holiday === "string" ? "วันปิดพิเศษ" : holiday.label)}</span>` : ""}</td><td><span class="status ${status === "available" ? "confirmed" : status === "full" ? "pending" : "cancelled"}">${status === "available" ? "เปิด" : status === "full" ? "คิวเต็ม" : "ปิด"}</span></td><td>${countDay(date)}</td><td>${Number(state.settings.slotsPerDay)}</td><td>${holiday ? `<button class="button button-outline button-small" data-remove-holiday="${date}">ยกเลิกวันปิด</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div><div class="alert mt-16">วันทำการประจำสัปดาห์: ${state.settings.openDays.map(day => ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"][day]).join(", ")}</div></section>`;
}
function adminReports() {
  const from = document.getElementById("report-from")?.value || "";
  const to = document.getElementById("report-to")?.value || "";
  const serviceId = document.getElementById("report-service")?.value || "";
  const therapistId = document.getElementById("report-therapist")?.value || "";
  const status = document.getElementById("report-status")?.value || "";
  const filtered = state.appointments.filter(item => (!from || item.date >= from) && (!to || item.date <= to) && (!serviceId || item.serviceId === serviceId) && (!therapistId || item.therapistId === therapistId) && (!status || item.status === status));
  const counts = ["Pending","Confirmed","Completed","Cancelled","No-show"].map(status => ({ status, count: filtered.filter(item => item.status === status).length }));
  const totalRevenue = filtered.filter(item => item.status === "Completed").reduce((sum, item) => sum + Number(getService(item.serviceId)?.price || 0), 0);
  return `<section class="panel"><div class="section-heading"><div><h2>รายงานนัดหมาย</h2><p>สรุปข้อมูลตามช่วงวันที่และส่งออกเป็น CSV</p></div><div class="table-actions"><button class="button button-outline button-small" data-action="export-report">ส่งออก CSV</button><button class="button button-outline button-small" data-action="print-report">พิมพ์</button></div></div>
  <div class="toolbar"><label class="small">ตั้งแต่ <input id="report-from" type="date" value="${escapeHtml(from)}"></label><label class="small">ถึง <input id="report-to" type="date" value="${escapeHtml(to)}"></label><select id="report-status"><option value="">ทุกสถานะ</option>${["Pending","Confirmed","Completed","Cancelled","No-show"].map(item => `<option value="${item}" ${status === item ? "selected" : ""}>${statusLabel(item)}</option>`).join("")}</select><select id="report-service"><option value="">ทุกบริการ</option>${state.services.map(item => `<option value="${item.id}" ${serviceId === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><select id="report-therapist"><option value="">แพทย์ทุกคน</option>${state.therapists.map(item => `<option value="${item.id}" ${therapistId === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>
  <div class="stat-grid">${counts.map(item => `<article class="stat-card"><span>${statusLabel(item.status)}</span><strong>${item.count}</strong></article>`).join("")}<article class="stat-card"><span>รายได้จากบริการที่เสร็จสิ้น</span><strong>${totalRevenue.toLocaleString("th-TH")}</strong><small>บาท</small></article></div>
  <div class="split-panels"><section class="panel"><h3>ตามบริการ</h3><ul class="rank-list">${state.services.map(service => `<li><span>${escapeHtml(service.name)}</span><span class="rank-value">${filtered.filter(item => item.serviceId === service.id).length} นัด</span></li>`).join("")}</ul></section><section class="panel"><h3>ตามแพทย์แผนไทย</h3><ul class="rank-list">${state.therapists.map(person => `<li><span>${escapeHtml(person.name)}</span><span class="rank-value">${filtered.filter(item => item.therapistId === person.id).length} นัด</span></li>`).join("")}</ul></section></div></section>`;
}
function adminSettings() {
  const settings = state.settings;
  return `<section class="panel"><h2>ตั้งค่าคลินิกและการนัดหมาย</h2><p class="lead">การเปลี่ยนแปลงมีผลกับการจองใหม่และข้อมูลหน้าเว็บไซต์</p><form id="settings-form" class="mt-16"><div class="form-grid">
    <div class="field"><label for="set-name">ชื่อคลินิก</label><input id="set-name" name="clinicName" value="${escapeHtml(settings.clinicName)}"></div><div class="field"><label for="set-org">หน่วยงาน</label><input id="set-org" name="organization" value="${escapeHtml(settings.organization)}"></div>
    <div class="field"><label for="set-phone">โทรศัพท์</label><input id="set-phone" name="phone" value="${escapeHtml(settings.phone)}"></div><div class="field"><label for="set-line">LINE OA</label><input id="set-line" name="line" value="${escapeHtml(settings.line)}"></div>
    <div class="field full"><label for="set-address">ที่อยู่</label><input id="set-address" name="address" value="${escapeHtml(settings.address)}"></div>
    <div class="field"><label for="set-open">เวลาเปิด</label><input id="set-open" type="time" name="openTime" value="${escapeHtml(settings.openTime)}"></div><div class="field"><label for="set-close">เวลาปิด</label><input id="set-close" type="time" name="closeTime" value="${escapeHtml(settings.closeTime)}"></div>
    <div class="field"><label for="set-slots">จำนวนคิวต่อวัน</label><input id="set-slots" type="number" min="1" max="100" name="slotsPerDay" value="${Number(settings.slotsPerDay)}"></div><div class="field"><label for="set-advance">จองล่วงหน้าได้ (วัน)</label><input id="set-advance" type="number" min="1" max="365" name="advanceDays" value="${Number(settings.advanceDays)}"></div>
    <div class="field"><label for="set-cutoff">ยกเลิก/เปลี่ยนก่อน (ชั่วโมง)</label><input id="set-cutoff" type="number" min="0" max="720" name="cutoffHours" value="${Number(settings.cutoffHours)}"></div><div class="field"><label for="set-announcement">ประกาศหน้าแรก</label><input id="set-announcement" name="announcement" value="${escapeHtml(settings.announcement)}"></div>
    <div class="field full"><label for="set-faq">คำถามที่พบบ่อย (หนึ่งข้อ/บรรทัด รูปแบบคำถาม|คำตอบ)</label><textarea id="set-faq" name="faq">${escapeHtml(settings.faq || "")}</textarea></div>
    <div class="field full"><label for="set-hero-image">ภาพหน้าแรก (PNG/JPEG/WebP ไม่เกิน 250 KB)</label><input id="set-hero-image" type="file" accept="image/png,image/jpeg,image/webp"><span class="field-help">${settings.heroImage ? "มีภาพหน้าแรกแล้ว — เลือกไฟล์ใหม่เพื่อแทนที่" : "เลือกภาพเพื่อจัดเก็บในอุปกรณ์นี้ พร้อมข้อมูลระบบ"}</span><button type="button" class="button button-outline button-small" data-action="remove-hero-image" ${settings.heroImage ? "" : "disabled"}>ลบภาพหน้าแรก</button></div>
    <div class="field full"><label>วันเปิดประจำสัปดาห์</label><div class="filter-row">${["อา","จ","อ","พ","พฤ","ศ","ส"].map((day, i) => `<label class="checkbox-row"><input type="checkbox" name="openDays" value="${i}" ${settings.openDays.includes(i) ? "checked" : ""}>${day}</label>`).join("")}</div></div>
    <div class="field full"><label>ช่องทางแจ้งเตือน (ตั้งค่าสำหรับการเชื่อมต่อในอนาคต)</label><div class="filter-row">${[["sms","SMS"],["line","LINE OA"],["email","อีเมล"]].map(([key,label]) => `<label class="checkbox-row"><input type="checkbox" name="notify-${key}" ${settings.notifications[key] ? "checked" : ""}>${label}</label>`).join("")}</div><span class="field-help">ยังไม่มีการส่งข้อความหรือเชื่อมต่อบริการแจ้งเตือนภายนอก</span></div>
    <div class="field full"><label class="checkbox-row"><input type="checkbox" name="onlineBooking" ${settings.onlineBooking ? "checked" : ""}>เปิดรับนัดหมายออนไลน์</label></div>
    <div class="field full"><div class="filter-row"><label class="checkbox-row"><input type="checkbox" name="allowCancel" ${settings.allowCancel ? "checked" : ""}>อนุญาตให้ผู้รับบริการยกเลิกนัดออนไลน์</label><label class="checkbox-row"><input type="checkbox" name="allowReschedule" ${settings.allowReschedule ? "checked" : ""}>อนุญาตให้ผู้รับบริการส่งคำขอเปลี่ยนวันนัด</label></div></div>
    <div class="field full"><div class="filter-row"><label class="checkbox-row"><input type="checkbox" name="requiredName" ${settings.requiredName ? "checked" : ""}>บังคับกรอกชื่อ</label><label class="checkbox-row"><input type="checkbox" name="requiredPhone" ${settings.requiredPhone ? "checked" : ""}>บังคับกรอกเบอร์โทรศัพท์</label></div></div>
  </div><button class="button button-primary mt-16" type="submit">บันทึกการตั้งค่า</button></form></section>
  <section class="panel"><h2>ข้อมูลและความเป็นส่วนตัว</h2><p class="small muted">ข้อมูลนัดหมายและผู้รับบริการจัดเก็บในไฟล์ฐานข้อมูลบนเครื่องเซิร์ฟเวอร์ กรุณาจำกัดสิทธิ์เข้าถึงเครื่องและสำรองข้อมูลอย่างปลอดภัย ระบบนี้ยังไม่มีการเข้ารหัสฐานข้อมูลหรือการสำรองข้อมูลอัตโนมัติ</p><div class="table-actions mt-16"><button class="button button-outline button-small" data-action="backup-data">ดาวน์โหลดข้อมูลสำรอง JSON</button><button class="button button-danger button-small" data-action="reset-data">ล้างข้อมูลทั้งหมด</button></div></section>`;
}
function adminAdmins() {
  const permissionNames = { appointments: "นัดหมาย", customers: "ผู้รับบริการ", staff: "บุคลากร", settings: "ตั้งค่า", reports: "รายงาน" };
  return `<section class="panel"><div class="section-heading"><div><h2>บัญชีผู้ดูแลและเจ้าหน้าที่</h2><p>บัญชีจริงใช้รหัสผ่านที่แฮชและเซสชันบนเซิร์ฟเวอร์</p></div><button class="button button-primary button-small" data-action="new-admin">+ เพิ่มบัญชี</button></div><div class="table-wrap mt-16"><table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th><th>สิทธิ์</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${state.admins.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.role)}</td><td>${(item.permissions || []).map(permission => escapeHtml(permissionNames[permission] || permission)).join(", ") || "—"}</td><td><span class="status ${item.active ? "confirmed" : "cancelled"}">${item.active ? "ใช้งาน" : "ปิดใช้งาน"}</span></td><td><button class="button button-outline button-small" data-edit-admin="${item.id}">แก้ไข</button></td></tr>`).join("")}</tbody></table></div>
  <h3 class="mt-16">ประวัติการแก้ไขข้อมูล</h3><div class="table-wrap"><table><thead><tr><th>เวลา</th><th>ผู้ดำเนินการ</th><th>รายการ</th></tr></thead><tbody>${state.audit.slice(0, 20).map(item => `<tr><td>${new Date(item.at).toLocaleString("th-TH")}</td><td>${escapeHtml(item.actor)}</td><td>${escapeHtml(item.action)} — ${escapeHtml(item.detail)}</td></tr>`).join("") || `<tr><td colspan="3">${emptyState("ยังไม่มีประวัติการแก้ไข", "")}</td></tr>`}</tbody></table></div></section>`;
}

function render() {
  const route = getRoute();
  const app = document.getElementById("app");
  const renderers = { home: renderHome, services: renderServices, booking: renderBooking, lookup: renderLookup, contact: renderContact, admin: renderAdmin };
  app.innerHTML = (renderers[route] || renderHome)();
  document.querySelector(".brand strong").textContent = state.settings.clinicName;
  document.querySelector(".brand small").textContent = state.settings.organization;
  document.querySelector(".footer-brand small").textContent = `${state.settings.clinicName} · ${state.settings.organization}`;
  document.title = `${state.settings.clinicName} | ${state.settings.organization}`;
  document.querySelectorAll(".main-nav [data-route]").forEach(link => link.classList.toggle("active", link.dataset.route === route));
  document.getElementById("main-nav").classList.remove("open");
  document.getElementById("menu-toggle").setAttribute("aria-expanded", "false");
  if (route !== "lookup") lookupResult = null;
  if (route === "booking" && backendOnline) loadCalendar();
}

function refreshBooking() {
  const form = document.getElementById("booking-form");
  if (!form) return;
  const values = new FormData(form);
  bookingDraft.serviceId = values.get("serviceId") || "";
  bookingDraft.therapistId = values.get("therapistId") || "";
  bookingDraft.date = values.get("date") || bookingDraft.date;
  bookingDraft.serverTimes = [];
  if (bookingDraft.date) bookingCalendarMonth = `${bookingDraft.date.slice(0, 7)}-01`;
  const note = form.elements.note.value;
  const name = form.elements.name.value;
  const phone = form.elements.phone.value;
  render();
  const next = document.getElementById("booking-form");
  if (next) {
    next.elements.name.value = name;
    next.elements.phone.value = phone;
    next.elements.note.value = note;
  }
  if (backendOnline) loadCalendar();
}
async function handleBookingSubmit(form) {
  if (!state.settings.onlineBooking) return toast("ขณะนี้ปิดรับนัดหมายออนไลน์ กรุณาติดต่อคลินิก");
  const data = new FormData(form);
  const service = getService(data.get("serviceId"));
  const therapistId = data.get("therapistId") || "";
  const date = bookingDraft.date;
  const time = bookingDraft.time;
  if (!service || !date || !time) return toast("กรุณาเลือกบริการ วันที่ และเวลาให้ครบ");
  if ((service.therapistRequired && !therapistId) || (therapistId && !therapistOptions(service.id, date).some(person => person.id === therapistId))) return toast("กรุณาเลือกแพทย์แผนไทยที่มีคุณสมบัติและพร้อมให้บริการ");
  if (dayStatus(date) !== "available" || !getAvailableTimes(date, service.id, therapistId).includes(time)) return toast("เวลาที่เลือกไม่ว่างแล้ว กรุณาเลือกเวลาใหม่");
  const name = (data.get("name") || "").trim();
  const phone = (data.get("phone") || "").trim();
  if (state.settings.requiredName && !name) return toast("กรุณากรอกชื่อผู้เข้ารับบริการ");
  if (state.settings.requiredPhone && !phone) return toast("กรุณากรอกเบอร์โทรศัพท์");
  if (phone && state.customers.some(person => normalizePhone(person.phone) === normalizePhone(phone) && !person.active)) return toast("บัญชีผู้รับบริการนี้ถูกปิดใช้งาน กรุณาติดต่อคลินิก");
  if (backendOnline) {
    try {
      const result = await apiRequest("/api/public/bookings", { method: "POST", body: { serviceId: service.id, therapistId, date, time, name, phone, note: data.get("note") } });
      bookingDraft = { serviceId: "", therapistId: "", date: "", time: "" };
      lookupPhone = phone;
      lookupResult = { ...result.appointment, customer: { name }, service, therapist: getTherapist(result.appointment.therapistId) };
      location.hash = "#lookup";
      toast(`บันทึกนัดหมายแล้ว รหัส ${result.appointment.code}`);
      return;
    } catch (error) {
      backendError = error.message;
      toast(error.message);
      return;
    }
  }
  const customer = ensureCustomer(name, phone);
  const providerId = therapistId || therapistOptions(service.id, date).find(person => !appointmentOverlaps(date, time, Number(service.duration), person.id))?.id || "";
  const appointment = {
  id: crypto.randomUUID(), code: generateBookingCode(), customerId: customer.id,
  serviceId: service.id, therapistId: providerId, date, time, note: data.get("note").trim(),
    status: "Pending", createdAt: new Date().toISOString(), history: [{ status: "Pending", at: new Date().toISOString(), by: "ผู้รับบริการ" }]
  };
  state.appointments.push(appointment);
  logAudit("สร้างนัดหมาย", `${appointment.code} · ${name} · ${service.name}`);
  if (!saveState()) return;
  bookingDraft = { serviceId: "", therapistId: "", date: "", time: "" };
  lookupResult = appointment;
  location.hash = "#lookup";
  toast("บันทึกนัดหมายเรียบร้อย");
}
function updateAppointmentStatus(id, status) {
  const appointment = state.appointments.find(item => item.id === id);
  if (!appointment) return;
  const old = appointment.status;
  appointment.status = status;
  appointment.history ||= [];
  appointment.history.push({ status, at: new Date().toISOString(), by: "เจ้าหน้าที่" });
  logAudit("เปลี่ยนสถานะนัดหมาย", `${appointment.code}: ${statusLabel(old)} → ${statusLabel(status)}`);
  saveState();
  toast("อัปเดตสถานะนัดหมายแล้ว");
  render();
}
function setDialog(title, body, onSubmit, submitLabel = "บันทึก") {
  const dialog = document.getElementById("dialog");
  dialog.innerHTML = `<form id="dialog-form"><h2>${escapeHtml(title)}</h2>${body}<div class="dialog-footer"><button type="button" class="button button-outline" data-dialog-close>ยกเลิก</button><button class="button button-primary" type="submit">${escapeHtml(submitLabel)}</button></div></form>`;
  dialog.showModal();
  dialog.querySelector("[data-dialog-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = dialog.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (await onSubmit(new FormData(event.currentTarget)) === false) {
        submit.disabled = false;
        return;
      }
      dialog.close();
    } catch (error) {
      submit.disabled = false;
      toast(error.message || "ดำเนินการไม่สำเร็จ");
    }
  });
}
function adminAppointmentDialog(id) {
  const item = id ? state.appointments.find(entry => entry.id === id) : null;
  const services = state.services.filter(entry => entry.active);
  const date = item?.date || todayString();
  const body = `<div class="form-grid"><div class="field"><label>ผู้รับบริการ *</label><input name="name" required value="${escapeHtml(customerFor(item || {})?.name || "")}"></div><div class="field"><label>เบอร์โทรศัพท์ *</label><input name="phone" required value="${escapeHtml(customerFor(item || {})?.phone || "")}"></div><div class="field"><label>บริการ *</label><select name="serviceId" required>${services.map(entry => `<option value="${entry.id}" ${entry.id === item?.serviceId ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}</select></div><div class="field"><label>แพทย์แผนไทย</label><select name="therapistId"><option value="">ไม่ระบุ</option>${state.therapists.filter(entry => entry.active).map(entry => `<option value="${entry.id}" ${entry.id === item?.therapistId ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}</select></div><div class="field"><label>วันที่ *</label><input type="date" name="date" required value="${escapeHtml(date)}"></div><div class="field"><label>เวลา *</label><input type="time" name="time" required value="${escapeHtml(item?.time || state.settings.openTime)}"></div><div class="field full"><label>หมายเหตุ</label><input name="note" value="${escapeHtml(item?.note || "")}"></div></div>`;
  setDialog(id ? "แก้ไขนัดหมาย" : "สร้างนัดหมาย", body, data => {
    const customer = ensureCustomer(data.get("name").trim(), data.get("phone").trim());
    if (item) {
      item.customerId = customer.id; item.serviceId = data.get("serviceId"); item.therapistId = data.get("therapistId"); item.date = data.get("date"); item.time = data.get("time"); item.note = data.get("note");
      item.history ||= []; item.history.push({ status: item.status, at: new Date().toISOString(), by: "เจ้าหน้าที่ (แก้ไขข้อมูล)" });
      logAudit("แก้ไขนัดหมาย", item.code);
    } else {
      const appointment = { id: crypto.randomUUID(), code: generateBookingCode(), customerId: customer.id, serviceId: data.get("serviceId"), therapistId: data.get("therapistId"), date: data.get("date"), time: data.get("time"), note: data.get("note"), status: "Confirmed", createdAt: new Date().toISOString(), history: [{ status: "Confirmed", at: new Date().toISOString(), by: "เจ้าหน้าที่" }] };
      state.appointments.push(appointment); logAudit("สร้างนัดหมายโดยเจ้าหน้าที่", appointment.code);
    }
    saveState(); render();
  });
}
function adminTherapistDialog(id) {
  const item = state.therapists.find(entry => entry.id === id);
  const selected = item?.serviceIds || [];
  const body = `<div class="form-grid"><div class="field"><label>ชื่อแพทย์แผนไทย *</label><input name="name" required value="${escapeHtml(item?.name || "")}"></div><div class="field"><label>โทรศัพท์</label><input name="phone" value="${escapeHtml(item?.phone || "")}"></div><div class="field"><label>เริ่มงาน</label><input type="time" name="from" value="${escapeHtml(item?.from || state.settings.openTime)}"></div><div class="field"><label>เลิกงาน</label><input type="time" name="to" value="${escapeHtml(item?.to || state.settings.closeTime)}"></div><div class="field full"><label>พักกลางวัน</label><input name="break" value="${escapeHtml(item?.break || "12:00–13:00")}"></div><div class="field full"><label>วันที่ทำงาน</label><div class="filter-row">${["อา","จ","อ","พ","พฤ","ศ","ส"].map((day,i) => `<label class="checkbox-row"><input type="checkbox" name="days" value="${i}" ${(item?.days || [1,2,3,4,5]).includes(i) ? "checked" : ""}>${day}</label>`).join("")}</div></div><div class="field full"><label>บริการที่มีคุณสมบัติ</label><div class="filter-row">${state.services.map(service => `<label class="checkbox-row"><input type="checkbox" name="serviceIds" value="${service.id}" ${selected.includes(service.id) ? "checked" : ""}>${escapeHtml(service.name)}</label>`).join("")}</div></div><div class="field full"><label>วันลา (เลือกวันที่)</label><input type="date" name="leave"><span class="field-help">เพิ่มวันลาทีละครั้งจากช่องนี้; วันที่มีอยู่: ${escapeHtml((item?.leave || []).join(", ") || "ไม่มี")}</span></div></div>`;
  setDialog(item ? "แก้ไขข้อมูลแพทย์แผนไทย" : "เพิ่มแพทย์แผนไทย", body, data => {
    if (data.get("to") <= data.get("from")) {
      toast("เวลาเลิกงานต้องอยู่หลังเวลาเริ่มงาน");
      return false;
    }
    const record = item || { id: `th-${crypto.randomUUID()}`, active: true, leave: [] };
    record.name = data.get("name").trim(); record.phone = data.get("phone").trim(); record.from = data.get("from"); record.to = data.get("to"); record.break = data.get("break"); record.days = data.getAll("days").map(Number); record.serviceIds = data.getAll("serviceIds");
    const leave = data.get("leave"); if (leave && !record.leave.includes(leave)) record.leave.push(leave);
    if (!item) state.therapists.push(record);
    state.services.forEach(service => {
      service.therapistIds ||= [];
      service.therapistIds = service.therapistIds.filter(therapistId => therapistId !== record.id);
      if (record.serviceIds.includes(service.id)) service.therapistIds.push(record.id);
    });
    logAudit(item ? "แก้ไขแพทย์แผนไทย" : "เพิ่มแพทย์แผนไทย", record.name);
    saveState(); render();
  });
}
function adminServiceDialog(id) {
  const item = state.services.find(entry => entry.id === id);
  const body = `<div class="form-grid"><div class="field full"><label>ชื่อบริการ *</label><input name="name" required value="${escapeHtml(item?.name || "")}"></div><div class="field full"><label>คำอธิบาย</label><textarea name="description">${escapeHtml(item?.description || "")}</textarea></div><div class="field"><label>ราคา (บาท)</label><input type="number" min="0" name="price" value="${Number(item?.price || 0)}"></div><div class="field"><label>ระยะเวลา (นาที)</label><input type="number" min="15" max="360" name="duration" value="${Number(item?.duration || 60)}"></div><div class="field"><label>ลำดับ</label><input type="number" min="1" name="order" value="${Number(item?.order || state.services.length + 1)}"></div><div class="field"><label>สัญลักษณ์สำรอง</label><input name="icon" maxlength="4" value="${escapeHtml(item?.icon || "✳")}"></div><div class="field full"><label>URL ภาพบริการ (HTTPS)</label><input name="imageUrl" type="url" pattern="https://.*" value="${escapeHtml(item?.imageUrl || "")}" placeholder="https://..."></div><div class="field full"><label>แพทย์ที่มีคุณสมบัติ</label><div class="filter-row">${state.therapists.map(person => `<label class="checkbox-row"><input type="checkbox" name="therapistIds" value="${person.id}" ${(item?.therapistIds || []).includes(person.id) ? "checked" : ""}>${escapeHtml(person.name)}</label>`).join("")}</div></div><div class="field full"><label class="checkbox-row"><input type="checkbox" name="therapistRequired" ${item?.therapistRequired ? "checked" : ""}>ต้องระบุแพทย์แผนไทยเมื่อจอง</label></div></div>`;
  setDialog(item ? "แก้ไขบริการ" : "เพิ่มบริการ", body, data => {
    const record = item || { id: `svc-${crypto.randomUUID()}`, active: true };
    record.name = data.get("name").trim(); record.description = data.get("description"); record.price = Number(data.get("price")); record.duration = Number(data.get("duration")); record.order = Number(data.get("order")); record.icon = data.get("icon"); record.imageUrl = safeImageUrl(data.get("imageUrl")); record.therapistIds = data.getAll("therapistIds"); record.therapistRequired = data.has("therapistRequired");
    state.therapists.forEach(person => {
      person.serviceIds ||= [];
      person.serviceIds = person.id && record.therapistIds.includes(person.id)
        ? Array.from(new Set([...person.serviceIds, record.id]))
        : person.serviceIds.filter(serviceId => serviceId !== record.id);
    });
    if (!item) state.services.push(record);
    logAudit(item ? "แก้ไขบริการ" : "เพิ่มบริการ", record.name);
    saveState(); render();
  });
}
function adminAccountDialog(id) {
  const item = state.admins.find(entry => entry.id === id);
  const permissionOptions = [["appointments","นัดหมาย"],["customers","ผู้รับบริการ"],["staff","บุคลากร"],["settings","ตั้งค่า"],["reports","รายงาน"]];
  const body = `<div class="form-grid"><div class="field"><label>ชื่อ *</label><input name="name" required value="${escapeHtml(item?.name || "")}"></div><div class="field"><label>อีเมล *</label><input name="email" type="email" required value="${escapeHtml(item?.email || "")}" ${item ? "readonly" : ""}></div>${item ? "" : '<div class="field full"><label>รหัสผ่านชั่วคราว * (อย่างน้อย 12 ตัวอักษร)</label><input name="password" type="password" minlength="12" maxlength="256" required autocomplete="new-password"></div>'}<div class="field full"><label>บทบาท</label><select name="role"><option ${item?.role === "ผู้ดูแลระบบ" ? "selected" : ""}>ผู้ดูแลระบบ</option><option ${item?.role === "เจ้าหน้าที่" ? "selected" : ""}>เจ้าหน้าที่</option><option ${item?.role === "ผู้รายงาน" ? "selected" : ""}>ผู้รายงาน</option></select></div><div class="field full"><label>สิทธิ์</label><div class="filter-row">${permissionOptions.map(([value, label]) => `<label class="checkbox-row"><input type="checkbox" name="permissions" value="${value}" ${(item?.permissions || []).includes(value) ? "checked" : ""}>${label}</label>`).join("")}</div></div>${item ? `<div class="field full"><label class="checkbox-row"><input type="checkbox" name="active" ${item.active ? "checked" : ""}>เปิดใช้งาน</label></div>` : ""}</div>`;
  setDialog(item ? "แก้ไขบัญชีเจ้าหน้าที่" : "เพิ่มบัญชีเจ้าหน้าที่", body, async data => {
    if (!item) {
      await apiRequest("/api/admin/users", { method: "POST", body: { name: data.get("name"), email: data.get("email"), password: data.get("password"), role: data.get("role"), permissions: data.getAll("permissions") } });
      await loadAdminState();
      render();
      return;
    }
    const record = item;
    record.name = data.get("name").trim(); record.email = data.get("email"); record.role = data.get("role");
    record.permissions = data.getAll("permissions");
    record.active = data.has("active");
    logAudit("แก้ไขบัญชีเจ้าหน้าที่", record.email);
    saveState(); render();
  });
}

function downloadFile(filename, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}
function exportAppointments() {
  const from = document.getElementById("report-from")?.value || "";
  const to = document.getElementById("report-to")?.value || "";
  const serviceId = document.getElementById("report-service")?.value || "";
  const therapistId = document.getElementById("report-therapist")?.value || "";
  const status = document.getElementById("report-status")?.value || "";
  const rows = [["รหัสนัด", "วันที่", "เวลา", "ชื่อ", "โทรศัพท์", "บริการ", "แพทย์", "สถานะ", "หมายเหตุ"]];
  state.appointments.filter(item => (!from || item.date >= from) && (!to || item.date <= to) && (!serviceId || item.serviceId === serviceId) && (!therapistId || item.therapistId === therapistId) && (!status || item.status === status)).forEach(item => {
    const customer = customerFor(item);
    rows.push([item.code, item.date, item.time, customer?.name || "", customer?.phone || "", getService(item.serviceId)?.name || "", getTherapist(item.therapistId)?.name || "", statusLabel(item.status), item.note || ""]);
  });
  const csv = "\uFEFF" + rows.map(row => row.map(cell => {
    const value = String(cell).replace(/^[\u0000-\u0020]*([=+\-@])/u, "'$1");
    return `"${value.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
  downloadFile("clinic-appointments.csv", csv, "text/csv;charset=utf-8");
}

document.addEventListener("click", event => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.dataset.action === "admin") { location.hash = "#admin"; return; }
  if (target.dataset.action === "logout") {
    apiRequest("/api/auth/logout", { method: "POST" }).catch(error => toast(error.message));
    adminSession = null;
    authInfo = { setupRequired: false };
    state = structuredClone(initialState);
    location.hash = "#admin";
    render();
    return;
  }
  if (target.dataset.bookService) {
    bookingDraft.serviceId = target.dataset.bookService; bookingDraft.therapistId = ""; bookingDraft.date = ""; bookingDraft.time = ""; bookingCalendarMonth = `${todayString().slice(0, 7)}-01`; location.hash = "#booking"; return;
  }
  if (target.dataset.slot) {
    bookingDraft.time = target.dataset.slot; render(); return;
  }
  if (target.dataset.calendarDate) {
    bookingDraft.date = target.dataset.calendarDate; bookingDraft.time = ""; render(); return;
  }
  if (target.dataset.calendarMonth) {
    bookingCalendarMonth = target.dataset.calendarMonth; render(); return;
  }
  if (target.dataset.customerHistory) {
    const person = state.customers.find(item => item.id === target.dataset.customerHistory);
    const bookings = state.appointments.filter(item => item.customerId === person?.id).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
    setDialog(`ประวัติผู้รับบริการ · ${person?.name || ""}`, `<div class="table-wrap"><table><thead><tr><th>วันเวลา</th><th>บริการ</th><th>สถานะ</th><th>รหัสนัด</th></tr></thead><tbody>${bookings.map(item => `<tr><td>${formatDate(item.date)} ${escapeHtml(item.time)}</td><td>${escapeHtml(getService(item.serviceId)?.name || "—")}</td><td>${statusBadge(item.status)}</td><td>${escapeHtml(item.code)}</td></tr>`).join("") || '<tr><td colspan="4">ไม่มีประวัติ</td></tr>'}</tbody></table></div>`, () => {}, "ปิด");
    const submit = document.querySelector("#dialog-form button[type=submit]"); if (submit) submit.type = "button";
    return;
  }
  if (target.dataset.appointmentHistory) {
    const appointment = state.appointments.find(item => item.id === target.dataset.appointmentHistory);
    const history = appointment?.history || [];
    setDialog(`ประวัติการนัด · ${appointment?.code || ""}`, `<div class="table-wrap"><table><thead><tr><th>เวลา</th><th>สถานะ</th><th>ผู้ดำเนินการ</th></tr></thead><tbody>${history.map(item => `<tr><td>${new Date(item.at).toLocaleString("th-TH")}</td><td>${statusBadge(item.status)}</td><td>${escapeHtml(item.by || "—")}</td></tr>`).join("") || '<tr><td colspan="3">ไม่มีประวัติ</td></tr>'}</tbody></table></div>`, () => {}, "ปิด");
    const submit = document.querySelector("#dialog-form button[type=submit]"); if (submit) submit.type = "button";
    return;
  }
  if (target.dataset.adminTab) { activeAdminTab = target.dataset.adminTab; render(); return; }
  if (target.dataset.action === "new-appointment") { adminAppointmentDialog(); return; }
  if (target.dataset.editAppointment) { adminAppointmentDialog(target.dataset.editAppointment); return; }
  if (target.dataset.action === "new-therapist") { adminTherapistDialog(); return; }
  if (target.dataset.editTherapist) { adminTherapistDialog(target.dataset.editTherapist); return; }
  if (target.dataset.toggleTherapist) {
    const item = getTherapist(target.dataset.toggleTherapist); item.active = !item.active; logAudit("เปลี่ยนสถานะแพทย์แผนไทย", item.name); saveState(); render(); return;
  }
  if (target.dataset.action === "new-service") { adminServiceDialog(); return; }
  if (target.dataset.editService) { adminServiceDialog(target.dataset.editService); return; }
  if (target.dataset.toggleService) {
    const item = getService(target.dataset.toggleService); item.active = !item.active; logAudit("เปลี่ยนสถานะบริการ", item.name); saveState(); render(); return;
  }
  if (target.dataset.toggleCustomer) {
    const item = state.customers.find(entry => entry.id === target.dataset.toggleCustomer); item.active = !item.active; logAudit("เปลี่ยนสถานะผู้รับบริการ", item.name); saveState(); render(); return;
  }
  if (target.dataset.action === "add-holiday") {
    const date = document.getElementById("schedule-date")?.value;
    const label = document.getElementById("holiday-label")?.value.trim() || "วันปิดพิเศษ";
    if (!date) return toast("กรุณาเลือกวันที่");
    if (!state.settings.holidays.some(item => (typeof item === "string" ? item : item.date) === date)) state.settings.holidays.push({ date, label });
    logAudit("เพิ่มวันปิดพิเศษ", `${date} ${label}`); saveState(); render(); return;
  }
  if (target.dataset.removeHoliday) {
    state.settings.holidays = state.settings.holidays.filter(item => (typeof item === "string" ? item : item.date) !== target.dataset.removeHoliday);
    logAudit("ยกเลิกวันปิดพิเศษ", target.dataset.removeHoliday); saveState(); render(); return;
  }
  if (target.dataset.action === "export-report") { exportAppointments(); return; }
  if (target.dataset.action === "print-report") { window.print(); return; }
  if (target.dataset.action === "backup-data") { downloadFile("clinic-data-backup.json", JSON.stringify(state, null, 2), "application/json"); return; }
  if (target.dataset.action === "remove-hero-image") {
    state.settings.heroImage = ""; logAudit("ลบภาพหน้าแรก", ""); saveState(); render(); toast("ลบภาพหน้าแรกแล้ว"); return;
  }
  if (target.dataset.action === "reset-data") {
    if (confirm("ล้างข้อมูลนัดหมาย ลูกค้า และประวัติทั้งหมดในเบราว์เซอร์นี้หรือไม่?")) { state = structuredClone(initialState); saveState(); render(); toast("ล้างข้อมูลแล้ว"); } return;
  }
  if (target.dataset.action === "new-admin") { adminAccountDialog(); return; }
  if (target.dataset.editAdmin) { adminAccountDialog(target.dataset.editAdmin); return; }
  if (target.dataset.cancelBooking) {
    if (backendOnline) {
      if (!confirm("ยืนยันการยกเลิกนัดหมายนี้หรือไม่?")) return;
      apiRequest("/api/public/cancel", { method: "POST", body: { code: target.dataset.cancelBooking, phone: lookupPhone } })
        .then(() => refreshLookup())
        .catch(error => toast(error.message));
      return;
    }
    const item = state.appointments.find(entry => entry.id === target.dataset.cancelBooking);
    if (!state.settings.allowCancel || !item || !["Pending", "Confirmed"].includes(item.status) || hoursUntil(item.date, item.time) < Number(state.settings.cutoffHours)) return toast("ไม่สามารถยกเลิกนัดนี้ได้ตามเงื่อนไขที่กำหนด");
    if (!item || !confirm("ยืนยันการยกเลิกนัดหมายนี้หรือไม่?")) return;
    item.status = "Cancelled"; item.history ||= []; item.history.push({ status: "Cancelled", at: new Date().toISOString(), by: "ผู้รับบริการ" }); logAudit("ยกเลิกนัดหมายโดยผู้รับบริการ", item.code); saveState(); lookupResult = item; render(); toast("ยกเลิกนัดหมายแล้ว"); return;
  }
  if (target.dataset.rescheduleBooking) {
    if (backendOnline) {
      const code = target.dataset.rescheduleBooking;
      const body = `<div class="form-grid"><div class="field full"><label>วันที่ใหม่</label><input type="date" name="date" required min="${todayString()}" max="${(() => { const d = new Date(); d.setDate(d.getDate() + Number(state.settings.advanceDays)); return localDateKey(d); })()}"></div><div class="field full"><label>เวลาใหม่</label><select name="time" required><option value="">เลือกวันที่ก่อน</option></select></div></div><p class="field-help mt-16">เลือกได้เฉพาะช่วงเวลาว่างสำหรับบริการเดิม</p>`;
      setDialog("ขอเปลี่ยนวันและเวลา", body, async data => {
        await apiRequest("/api/public/reschedule", { method: "POST", body: { code, phone: lookupPhone, date: data.get("date"), time: data.get("time") } });
        await refreshLookup();
      }, "ส่งคำขอ");
      const dateInput = document.querySelector("#dialog-form [name=date]");
      dateInput.addEventListener("change", async () => {
        const select = document.querySelector("#dialog-form [name=time]");
        select.innerHTML = '<option value="">กำลังโหลดเวลาว่าง…</option>';
        try {
          const params = new URLSearchParams({ month: dateInput.value.slice(0, 7), serviceId: lookupResult.serviceId || lookupResult.service?.id || "", therapistId: lookupResult.therapistId || "" });
          const result = await apiRequest(`/api/public/calendar?${params}`);
          select.innerHTML = `<option value="">เลือกเวลา</option>${(result.days[dateInput.value]?.times || []).map(time => `<option value="${time}">${time}</option>`).join("")}`;
        } catch (error) {
          select.innerHTML = '<option value="">ไม่สามารถโหลดเวลาได้</option>';
          toast(error.message);
        }
      });
      return;
    }
    const item = state.appointments.find(entry => entry.id === target.dataset.rescheduleBooking);
    if (!item) return;
    if (!state.settings.allowReschedule || !["Pending", "Confirmed"].includes(item.status) || hoursUntil(item.date, item.time) < Number(state.settings.cutoffHours)) return toast("ไม่สามารถเปลี่ยนวันนัดนี้ได้ตามเงื่อนไขที่กำหนด");
    const body = `<div class="form-grid"><div class="field full"><label>วันที่ใหม่</label><input type="date" name="date" required min="${todayString()}" max="${(() => { const d = new Date(); d.setDate(d.getDate() + Number(state.settings.advanceDays)); return localDateKey(d); })()}"></div><div class="field full"><label>เวลาใหม่</label><select name="time" required><option value="">เลือกวันที่ก่อน</option></select></div></div><p class="field-help mt-16">เลือกได้เฉพาะช่วงเวลาว่างสำหรับบริการเดิม</p>`;
    setDialog("ขอเปลี่ยนวันและเวลา", body, data => {
      if (!getAvailableTimes(data.get("date"), item.serviceId, item.therapistId).includes(data.get("time"))) {
        toast("เวลาที่เลือกไม่ว่าง กรุณาเลือกช่วงเวลาอื่น");
        return false;
      }
      const old = `${item.date} ${item.time}`; item.date = data.get("date"); item.time = data.get("time"); item.status = "Pending";
      item.history ||= []; item.history.push({ status: "Pending", at: new Date().toISOString(), by: `ผู้รับบริการ ขอเปลี่ยนจาก ${old}` }); logAudit("ขอเปลี่ยนวันนัด", item.code); saveState(); lookupResult = item; render(); toast("บันทึกคำขอเปลี่ยนวันแล้ว");
    }, "ส่งคำขอ");
    const dateInput = document.querySelector("#dialog-form [name=date]");
    dateInput.addEventListener("change", () => {
      const select = document.querySelector("#dialog-form [name=time]");
      const options = getAvailableTimes(dateInput.value, item.serviceId, item.therapistId);
      select.innerHTML = `<option value="">เลือกเวลา</option>${options.map(time => `<option value="${time}">${time}</option>`).join("")}`;
    });

    async function refreshLookup() {
      try {
        const result = await apiRequest("/api/public/lookup", { method: "POST", body: { code: lookupResult.code, phone: lookupPhone } });
        lookupResult = result.appointment;
        render();
        toast("อัปเดตข้อมูลนัดหมายแล้ว");
      } catch (error) {
        toast(error.message);
      }
    }
    return;
  }
  if (event.target.id === "set-hero-image" && event.target.files?.[0]) {
    const file = event.target.files[0];
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 250 * 1024) return toast("เลือกรูป PNG, JPEG หรือ WebP ขนาดไม่เกิน 250 KB");
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) return toast("ไม่สามารถอ่านไฟล์ภาพได้");
      state.settings.heroImage = reader.result;
      logAudit("เปลี่ยนภาพหน้าแรก", file.name);
      if (saveState()) { render(); toast("บันทึกภาพหน้าแรกแล้ว"); }
    });
    reader.addEventListener("error", () => toast("ไม่สามารถอ่านไฟล์ภาพได้"));
    reader.readAsDataURL(file);
  }
});

document.addEventListener("input", event => {
  if (event.target.id === "booking-service" || event.target.id === "booking-therapist" || event.target.id === "booking-date") {
    bookingDraft.time = "";
    refreshBooking();
  } else if (event.target.id === "admin-search") {
    const start = event.target.selectionStart;
    const scroll = window.scrollY;
    const html = adminAppointments();
    document.querySelector(".admin-content").innerHTML = html;
    const next = document.getElementById("admin-search"); next.focus(); next.setSelectionRange(start, start);
    window.scrollTo(0, scroll);
  } else if (event.target.id === "customer-search") {
    const start = event.target.selectionStart, scroll = window.scrollY;
    document.querySelector(".admin-content").innerHTML = adminCustomers();
    const next = document.getElementById("customer-search"); next.focus(); next.setSelectionRange(start, start); window.scrollTo(0, scroll);
  } else if (event.target.id.startsWith("report-")) {
    document.querySelector(".admin-content").innerHTML = adminReports();
  }
});
document.addEventListener("change", event => {
  if (event.target.matches(".status-select")) { updateAppointmentStatus(event.target.dataset.statusId, event.target.value); return; }
  if (["admin-status", "admin-date", "admin-service", "admin-therapist"].includes(event.target.id)) { document.querySelector(".admin-content").innerHTML = adminAppointments(); return; }
  if (event.target.id.startsWith("report-")) { document.querySelector(".admin-content").innerHTML = adminReports(); return; }
  if (["booking-service", "booking-therapist", "booking-date"].includes(event.target.id)) {
    bookingDraft.time = "";
    if (event.target.id === "booking-date") bookingDraft.time = "";
    refreshBooking();
    return;
  }
});
document.addEventListener("submit", event => {
  if (event.target.id === "booking-form") { event.preventDefault(); handleBookingSubmit(event.target); return; }
  if (event.target.id === "auth-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    const path = authInfo.setupRequired ? "/api/auth/setup" : "/api/auth/login";
    apiRequest(path, { method: "POST", body: { name: data.get("name"), email: data.get("email"), password: data.get("password") } })
      .then(async result => {
        adminSession = result.admin;
        authInfo = { setupRequired: false };
        backendError = "";
        await loadAdminState();
        activeAdminTab = "dashboard";
        render();
        toast("เข้าสู่ระบบหลังบ้านแล้ว");
      })
      .catch(error => { backendError = error.message; render(); });
    return;
  }
  if (event.target.id === "lookup-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    if (backendOnline) {
      lookupPhone = data.get("phone");
      apiRequest("/api/public/lookup", { method: "POST", body: { code: data.get("code"), phone: lookupPhone } })
        .then(result => {
          lookupResult = result.appointment;
          document.getElementById("lookup-result").innerHTML = lookupResultMarkup(lookupResult);
        })
        .catch(error => {
          lookupResult = false;
          document.getElementById("lookup-result").innerHTML = lookupResultMarkup(null);
          if (error.message !== "ไม่พบนัดหมายที่ตรงกับข้อมูล") toast(error.message);
        });
      return;
    }
    const appointment = state.appointments.find(item => item.code.toLowerCase() === data.get("code").trim().toLowerCase() && normalizePhone(customerFor(item)?.phone) === normalizePhone(data.get("phone")));
    lookupResult = appointment || false;
    document.getElementById("lookup-result").innerHTML = lookupResultMarkup(appointment);
    return;
  }
  if (event.target.id === "settings-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    if (data.get("closeTime") <= data.get("openTime")) {
      event.preventDefault();
      toast("เวลาปิดคลินิกต้องอยู่หลังเวลาเปิด");
      return;
    }
    if (!data.getAll("openDays").length) {
      event.preventDefault();
      toast("กรุณาเลือกวันเปิดทำการอย่างน้อยหนึ่งวัน");
      return;
    }
    ["clinicName","organization","phone","line","address","openTime","closeTime","announcement","faq"].forEach(key => state.settings[key] = data.get(key).trim());
    ["slotsPerDay","advanceDays","cutoffHours"].forEach(key => state.settings[key] = Number(data.get(key)));
    state.settings.openDays = data.getAll("openDays").map(Number);
    state.settings.onlineBooking = data.has("onlineBooking");
    state.settings.notifications = { sms: data.has("notify-sms"), line: data.has("notify-line"), email: data.has("notify-email") };
    state.settings.allowCancel = data.has("allowCancel"); state.settings.allowReschedule = data.has("allowReschedule");
    state.settings.requiredName = data.has("requiredName"); state.settings.requiredPhone = data.has("requiredPhone");
    logAudit("แก้ไขการตั้งค่าคลินิก", "ข้อมูลทั่วไปและการนัดหมาย"); saveState(); render(); toast("บันทึกการตั้งค่าแล้ว");
  }
});
document.getElementById("menu-toggle").addEventListener("click", event => {
  const open = document.getElementById("main-nav").classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});
window.addEventListener("hashchange", render);
document.getElementById("year").textContent = new Date().getFullYear();
render();
initializeBackend();
