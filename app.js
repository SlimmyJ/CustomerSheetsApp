"use strict";

/* ---------- tiny helpers ---------- */
const el = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- constants ---------- */
const BE_VAT_REGEX = /^BE\s?0?\d{9}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_LOOSE = /^\+[\d\s\-().]{7,}$/;
const MODULE_LABELS = {
  time_registration: "Tijdsregistratie",
  tacho_downloads: "Tacho downloads",
  tacho_analysis: "Tacho analyse",
  jobs: "Jobs",
  identification: "Identificatie",
  asset_management: "Asset management",
  temp_registration: "Temperatuurregistratie",
  ciaw: "Checkin at work",
  cost_analysis: "Nacalculatie",
};

const STORAGE_KEY = "customerSheet.v1";
const STATUS_DEBOUNCE_MS = 400;

/* ---------- utils ---------- */
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function safeFileBase(s = "") {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function download(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markValidity(elm, ok, hintSel) {
  if (!elm) return;
  elm.classList.toggle("is-invalid", !ok);
  if (hintSel) {
    const h = document.querySelector(hintSel);
    if (h) h.classList.toggle("error", !ok);
  }
}

/* ---------- state ---------- */
let contacts = []; // array of contact objects
let moduleNotes = {}; // { moduleKey: "notes" }
let currentId = null;
let saveTimer = null;
let saveStatusEl = null;

/* ---------- contacts ---------- */
function newContact(overrides = {}) {
  return {
    id: uuid(),
    name: "",
    role: "Owner",
    email: "",
    phone: "",
    primary: contacts.length === 0,
    channel: "email",
    notes: "",
    ...overrides,
  };
}

function setPrimary(id) {
  contacts = contacts.map((c) => ({ ...c, primary: c.id === id }));
  renderContacts();
  scheduleSave();
}

function removeContact(id) {
  const wasPrimary = contacts.find((c) => c.id === id)?.primary;
  contacts = contacts.filter((c) => c.id !== id);
  if (wasPrimary && contacts.length) contacts[0].primary = true;
  renderContacts();
  scheduleSave();
}

function upsertContact(id, patch) {
  contacts = contacts.map((c) => (c.id === id ? { ...c, ...patch } : c));
  scheduleSave();
}

function renderContacts() {
  const host = el("#contacts");
  if (!host) return;
  host.innerHTML = "";

  if (!contacts.length) contacts.push(newContact());

  contacts.forEach((c) => {
    const card = document.createElement("div");
    card.className = "contact-card";
    card.dataset.id = c.id;

    card.innerHTML = `
      <div class="contact-grid">
        <div class="span-2">
          <label>Naam
            <input type="text" data-k="name" value="${escapeHtml(
              c.name
            )}" placeholder="Volledige naam">
          </label>
        </div>
        <div>
          <label>Rol
            <select data-k="role" value="${escapeHtml(c.role)}">
              ${["Owner", "Fleet", "HR/Payroll", "IT", "Finance", "Operations"]
                .map(
                  (r) =>
                    `<option ${r === c.role ? "selected" : ""}>${r}</option>`
                )
                .join("")}
            </select>
          </label>
        </div>
        <div class="inline">
          <label class="inline">
            <input type="checkbox" data-k="primary" ${
              c.primary ? "checked" : ""
            }> Primair
          </label>
        </div>

        <div>
          <label>Voorkeur
            <select data-k="channel" value="${escapeHtml(c.channel)}">
              ${["email", "phone", "teams"]
                .map(
                  (ch) =>
                    `<option ${
                      ch === c.channel ? "selected" : ""
                    }>${ch}</option>`
                )
                .join("")}
            </select>
          </label>
        </div>
        <div>
          <label>Email
            <input type="email" data-k="email" value="${escapeHtml(
              c.email
            )}" placeholder="naam@bedrijf.be">
          </label>
        </div>
        <div>
          <label>Telefoon
            <input type="tel" data-k="phone" value="${escapeHtml(
              c.phone
            )}" placeholder="+32 …">
          </label>
        </div>

        <div class="span-2">
          <label>Notities
            <input type="text" data-k="notes" value="${escapeHtml(
              c.notes
            )}" placeholder="Opmerkingen">
          </label>
        </div>
      </div>

      <div class="contact-actions no-print-controls">
        <div style="flex:1"></div>
        <button type="button" data-action="remove">Verwijderen</button>
      </div>
    `;

    // input events
    card.addEventListener("input", (e) => {
      const key = e.target?.dataset?.k;
      if (!key || key === "primary") return;
      upsertContact(c.id, { [key]: e.target.value });
    });
    card.addEventListener("change", (e) => {
      const key = e.target?.dataset?.k;
      if (!key) return;
      if (key === "primary") {
        if (e.target.checked) setPrimary(c.id);
        else renderContacts();
      } else if (key === "role" || key === "channel") {
        upsertContact(c.id, { [key]: e.target.value });
      }
    });
    card
      .querySelector('[data-action="remove"]')
      .addEventListener("click", () => removeContact(c.id));

    host.appendChild(card);
  });
}

/* ---------- module notes ---------- */
function renderModuleNotes() {
  const host = el("#moduleNotes");
  if (!host) return;

  const checked = $$('input[name="modules"]:checked').map((i) => i.value);

  host.innerHTML = "";
  checked.forEach((mod) => {
    const title = MODULE_LABELS[mod] || mod;
    const value = moduleNotes[mod] || "";

    const wrap = document.createElement("fieldset");
    wrap.className = "module-note";
    wrap.innerHTML = `
      <legend>${escapeHtml(title)}</legend>
      <textarea data-module="${mod}" rows="4" placeholder="Notities voor ${escapeHtml(
      title
    )}…">${escapeHtml(value)}</textarea>
    `;

    wrap.querySelector("textarea").addEventListener("input", (e) => {
      moduleNotes[mod] = e.target.value;
      scheduleSave();
    });

    host.appendChild(wrap);
  });
}

function wireModuleCheckboxes() {
  $$('input[name="modules"]').forEach((chk) => {
    chk.addEventListener("change", () => {
      renderModuleNotes();
      scheduleSave();
    });
  });
}

/* ---------- form collect/fill ---------- */
function collectForm() {
  const form = el("#customerForm");
  const modules = $$('input[name="modules"]:checked', form).map((i) => i.value);
  const naceEl =
    document.getElementById("naceInput") || document.getElementById("nace");

  return {
    id: currentId || uuid(),
    company: el("#company").value.trim(),
    clientNumber: Number(el("#clientNumber").value || 0),
    vat: el("#vat")?.value.trim() || "",
    nace: (naceEl?.value || "").trim(),
    employeeCount: Number(el("#employeeCount").value || 0),
    email: el("#email")?.value.trim() || "",
    phone: el("#phone").value.trim(),
    website: el("#website")?.value.trim() || "",
    address: {
      street: el("#street")?.value.trim() || "",
      number: el("#number")?.value.trim() || "",
      postalCode: el("#postalCode")?.value.trim() || "",
      city: el("#city")?.value.trim() || "",
      country: "BE",
    },
    badgeRegime: el("#badgeRegime")?.value || "",
    badgeType: el("#badgeType")?.value || "",
    tachoDownloadFrequency: el("#tachoFrequency")?.value || "",
    representative: el("#representative")?.value.trim() || "",
    reseller: el("#reseller")?.value.trim() || "",
    // UI follow-up was removed; guard remains for backward compatibility
    needsFollowUp: !!el("#needsFollowUp") && el("#needsFollowUp").checked,
    modules,
    moduleNotes: { ...moduleNotes },
    contacts: contacts.slice(),
    createdAtISO: new Date().toISOString(),
    version: 2,
  };
}

function fillForm(d) {
  if (!d) return;
  currentId = d.id || currentId || uuid();

  el("#company").value = d.company ?? "";
  el("#clientNumber").value = d.clientNumber ?? "";
  el("#vat") && (el("#vat").value = d.vat ?? "");
  el("#employeeCount").value = d.employeeCount ?? "";
  el("#email") && (el("#email").value = d.email ?? "");
  el("#phone").value = d.phone ?? "";
  el("#website") && (el("#website").value = d.website ?? "");
  el("#street") && (el("#street").value = d.address?.street ?? "");
  el("#number") && (el("#number").value = d.address?.number ?? "");
  el("#postalCode") && (el("#postalCode").value = d.address?.postalCode ?? "");
  el("#city") && (el("#city").value = d.address?.city ?? "");
  el("#badgeRegime") && (el("#badgeRegime").value = d.badgeRegime ?? "");
  el("#badgeType") && (el("#badgeType").value = d.badgeType ?? "");
  el("#tachoFrequency") &&
    (el("#tachoFrequency").value = d.tachoDownloadFrequency ?? "");
  el("#representative") &&
    (el("#representative").value = d.representative ?? "");
  el("#reseller") && (el("#reseller").value = d.reseller ?? "");
  el("#notes").value = d.notes ?? "";

  if (el("#needsFollowUp")) el("#needsFollowUp").checked = !!d.needsFollowUp;

  const naceEl =
    document.getElementById("naceInput") || document.getElementById("nace");
  if (naceEl) naceEl.value = d.nace ?? "";

  // restore modules
  $$('input[name="modules"]').forEach((chk) => {
    chk.checked = Array.isArray(d.modules)
      ? d.modules.includes(chk.value)
      : false;
  });

  // restore per-module notes
  moduleNotes =
    d.moduleNotes && typeof d.moduleNotes === "object"
      ? { ...d.moduleNotes }
      : {};

  // render based on restored state
  renderModuleNotes();

  // contacts
  contacts =
    Array.isArray(d.contacts) && d.contacts.length
      ? d.contacts
      : [newContact()];
  renderContacts();
}

/* ---------- autosave ---------- */
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, STATUS_DEBOUNCE_MS);
}

function saveDraft() {
  const data = collectForm();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      lastSaved: new Date().toISOString(),
      data,
    })
  );
  if (saveStatusEl) {
    const dt = new Date();
    saveStatusEl.textContent = `Auto-opgeslagen ${dt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      contacts = [newContact()];
      renderContacts();
      return;
    }
    const { data, lastSaved } = JSON.parse(raw);
    fillForm(data);
    if (saveStatusEl && lastSaved) {
      const dt = new Date(lastSaved);
      saveStatusEl.textContent = `Laatst opgeslagen ${dt.toLocaleDateString()} ${dt.toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" }
      )}`;
    }
  } catch (e) {
    console.warn("Kon concept niet laden", e);
    contacts = [newContact()];
    renderContacts();
  }
}

function wireAutosave() {
  const form = el("#customerForm");
  form.addEventListener("input", scheduleSave);
  form.addEventListener("change", scheduleSave);
}

function wireValidation() {
  const vatEl = el("#vat");
  const emailEl = el("#email");
  const phoneEl = el("#phone");

  if (vatEl) {
    vatEl.addEventListener("input", () => {
      const v = vatEl.value.trim().toUpperCase();
      markValidity(vatEl, !v || BE_VAT_REGEX.test(v), "#vatHint");
    });
  }
  if (emailEl) {
    emailEl.addEventListener("input", () => {
      const v = emailEl.value.trim();
      markValidity(emailEl, !v || EMAIL_REGEX.test(v));
    });
  }
  if (phoneEl) {
    phoneEl.addEventListener("input", () => {
      const v = phoneEl.value.trim();
      markValidity(phoneEl, !v || E164_LOOSE.test(v));
    });
  }
}

/* ---------- actions ---------- */
function ensureMinimal() {
  const company = el("#company").value.trim();
  if (!company) {
    alert("Gelieve een bedrijf op te geven.");
    el("#company").focus();
    return false;
  }
  return true;
}

function wireButtons() {
  el("#btnExportJson").addEventListener("click", () => {
    if (!ensureMinimal()) return;
    const data = collectForm();
    const base = data.company ? safeFileBase(data.company) : "customer";
    download(
      `customer-sheet_${base}.json`,
      "application/json",
      JSON.stringify(data, null, 2)
    );
  });

  el("#btnExportCsv").addEventListener("click", () => {
    if (!ensureMinimal()) return;
    const d = collectForm();

    const baseHeaders = [
      "company",
      "clientNumber",
      "vat",
      "nace",
      "employeeCount",
      "email",
      "phone",
      "website",
      "street",
      "number",
      "postalCode",
      "city",
      "country",
      "badgeRegime",
      "badgeType",
      "tachoDownloadFrequency",
      "representative",
      "reseller",
      "needsFollowUp",
      "modules",
      "notes",
      "createdAtISO",
    ];

    const noteKeys = Object.keys(MODULE_LABELS);
    const noteHeaders = noteKeys.map((k) => `notes_${k}`);

    const headers = [...baseHeaders, ...noteHeaders];

    const values = [
      d.company,
      d.clientNumber,
      d.vat,
      d.nace,
      d.employeeCount,
      d.email,
      d.phone,
      d.website,
      d.address?.street || "",
      d.address?.number || "",
      d.address?.postalCode || "",
      d.address?.city || "",
      d.address?.country || "BE",
      d.badgeRegime,
      d.badgeType,
      d.tachoDownloadFrequency,
      d.representative,
      d.reseller,
      d.needsFollowUp,
      d.modules.join("|"),
      (d.notes || "").replace(/\r?\n/g, " "),
      d.createdAtISO,
      ...noteKeys.map((k) =>
        d.moduleNotes && d.moduleNotes[k]
          ? String(d.moduleNotes[k]).replace(/\r?\n/g, " ")
          : ""
      ),
    ];

    const csv = [
      headers.join(","),
      values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    ].join("\n");
    const base = d.company ? safeFileBase(d.company) : "customer";
    download(`customer-sheet_${base}.csv`, "text/csv", csv);
  });

  el("#btnPrint").addEventListener("click", () => {
    if (!ensureMinimal()) return;
    window.print();
  });

  el("#btnReset").addEventListener("click", () => {
    if (!confirm("Formulier en concept wissen?")) return;
    el("#customerForm").reset();
    contacts = [newContact()];
    moduleNotes = {};
    renderContacts();
    renderModuleNotes();
    localStorage.removeItem(STORAGE_KEY);
    if (saveStatusEl) saveStatusEl.textContent = "";
  });

  el("#btnAddContact").addEventListener("click", () => {
    contacts.push(newContact());
    renderContacts();
    scheduleSave();
  });
}

/* ---------- init ---------- */
window.addEventListener("DOMContentLoaded", () => {
  // date + status
  const todayEl = el("#today");
  if (todayEl) {
    todayEl.textContent = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }
  saveStatusEl = el("#saveStatus");

  wireButtons();
  wireAutosave();
  wireValidation();
  wireModuleCheckboxes();
  loadDraft();
  renderContacts();
  renderModuleNotes();
});
