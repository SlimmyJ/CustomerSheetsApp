// ---------- helpers ----------
const el = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const STORAGE_KEY = 'customerSheet.v1';
const STATUS_DEBOUNCE_MS = 400;

const todayEl = el('#today');
if (todayEl) {
  todayEl.textContent = new Date().toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' });
}
const saveStatusEl = el('#saveStatus');

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c =>{
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });

const safeFileBase = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function download(filename, mime, content){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display='none';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ---------- contacts state ----------
let contacts = []; // array of objects

function newContact(overrides = {}){
  return {
    id: uuid(),
    name: '',
    role: 'Owner',
    email: '',
    phone: '',
    primary: contacts.length === 0, // first is primary by default
    channel: 'email',
    notes: '',
    ...overrides
  };
}

function setPrimary(id){
  contacts = contacts.map(c => ({ ...c, primary: c.id === id }));
  renderContacts();
  scheduleSave();
}

function removeContact(id){
  const wasPrimary = contacts.find(c => c.id === id)?.primary;
  contacts = contacts.filter(c => c.id !== id);
  if (wasPrimary && contacts.length) contacts[0].primary = true;
  renderContacts();
  scheduleSave();
}

function upsertContact(id, patch){
  contacts = contacts.map(c => c.id === id ? ({ ...c, ...patch }) : c);
  scheduleSave();
}

function renderContacts(){
  const host = el('#contacts');
  if (!host) return;
  host.innerHTML = '';

  if (!contacts.length) contacts.push(newContact());

  contacts.forEach((c, idx) => {
    const card = document.createElement('div');
    card.className = 'contact-card';
    card.dataset.id = c.id;

    card.innerHTML = `
      <div class="contact-grid">
        <div class="span-2">
          <label>Naam
            <input type="text" data-k="name" value="${escapeHtml(c.name)}" placeholder="Volledige naam">
          </label>
        </div>
        <div>
          <label>Rol
            <select data-k="role" value="${escapeHtml(c.role)}">
              ${['Owner','Fleet','HR/Payroll','IT','Finance','Operations'].map(r => `<option ${r===c.role?'selected':''}>${r}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="inline">
          <label class="inline">
            <input type="checkbox" data-k="primary" ${c.primary ? 'checked' : ''}> Primair
          </label>
        </div>

        <div>
          <label>Voorkeur
            <select data-k="channel" value="${escapeHtml(c.channel)}">
              ${['email','phone','teams'].map(ch => `<option ${ch===c.channel?'selected':''}>${ch}</option>`).join('')}
            </select>
          </label>
        </div>
        <div>
          <label>Email
            <input type="email" data-k="email" value="${escapeHtml(c.email)}" placeholder="naam@bedrijf.be">
          </label>
        </div>
        <div>
          <label>Telefoon
            <input type="tel" data-k="phone" value="${escapeHtml(c.phone)}" placeholder="+32 …">
          </label>
        </div>

        <div class="span-2">
          <label>Notities
            <input type="text" data-k="notes" value="${escapeHtml(c.notes)}" placeholder="Opmerkingen">
          </label>
        </div>
      </div>

      <div class="contact-actions no-print-controls">
        <span class="badge">Contact ${idx+1}</span>
        <div style="flex:1"></div>
        <button type="button" data-action="remove">Verwijderen</button>
      </div>
    `;

    // wire events
    card.addEventListener('input', (e) => {
      const key = e.target?.dataset?.k;
      if (!key) return;
      if (key === 'primary') return; // handled on change
      upsertContact(c.id, { [key]: e.target.value });
    });
    card.addEventListener('change', (e) => {
      const key = e.target?.dataset?.k;
      if (!key) return;
      if (key === 'primary') {
        if (e.target.checked) setPrimary(c.id);
        else { // unchecking primary keeps it primary to ensure one primary exists
          renderContacts();
        }
      } else if (key === 'role' || key === 'channel') {
        upsertContact(c.id, { [key]: e.target.value });
      }
    });
    card.querySelector('[data-action="remove"]').addEventListener('click', () => removeContact(c.id));

    host.appendChild(card);
  });
}

function escapeHtml(s=''){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ---------- form collect/fill ----------
function collectForm(){
  const form = el('#customerForm');
  const modules = $$('input[name="modules"]:checked', form).map(i=>i.value);

  // Support either the combobox (#naceInput) or the simple field (#nace)
  const naceEl = document.getElementById('naceInput') || document.getElementById('nace');

  return {
    id: currentId || uuid(),
    company: el('#company').value.trim(),
    clientNumber: Number(el('#clientNumber').value || 0),
    nace: (naceEl?.value || '').trim(),
    employeeCount: Number(el('#employeeCount').value || 0),
    contact: el('#contact').value.trim(),
    phone: el('#phone').value.trim(),
    notes: el('#notes').value.trim(),
    needsFollowUp: el('#needsFollowUp').checked,
    modules,
    contacts: contacts.slice(),
    createdAtISO: new Date().toISOString(),
    version: 1
  };
}

function fillForm(d){
  if (!d) return;
  currentId = d.id || currentId || uuid();

  el('#company').value = d.company ?? '';
  el('#clientNumber').value = d.clientNumber ?? '';
  el('#employeeCount').value = d.employeeCount ?? '';
  el('#contact').value = d.contact ?? '';
  el('#phone').value = d.phone ?? '';
  el('#notes').value = d.notes ?? '';
  el('#needsFollowUp').checked = !!d.needsFollowUp;

  // NACE
  const naceEl = document.getElementById('naceInput') || document.getElementById('nace');
  if (naceEl) naceEl.value = d.nace ?? '';

  // Modules
  $$('input[name="modules"]').forEach(chk => {
    chk.checked = Array.isArray(d.modules) ? d.modules.includes(chk.value) : false;
  });

  // Contacts
  contacts = Array.isArray(d.contacts) && d.contacts.length ? d.contacts : [newContact()];
  renderContacts();
}

// ---------- autosave ----------
let currentId = null;
let saveTimer = null;

function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, STATUS_DEBOUNCE_MS);
}

function saveDraft(){
  const data = collectForm();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    lastSaved: new Date().toISOString(),
    data
  }));
  if (saveStatusEl) {
    const dt = new Date();
    saveStatusEl.textContent = `Auto-opgeslagen ${dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  }
}

function loadDraft(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) {
      contacts = [newContact()];
      renderContacts();
      return;
    }
    const { data, lastSaved } = JSON.parse(raw);
    fillForm(data);
    if (saveStatusEl && lastSaved) {
      const dt = new Date(lastSaved);
      saveStatusEl.textContent = `Laatst opgeslagen ${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
    }
  }catch(e){
    console.warn('Kon concept niet laden', e);
    contacts = [newContact()];
    renderContacts();
  }
}

// Wire autosave on input changes
function wireAutosave(){
  const form = el('#customerForm');
  form.addEventListener('input', scheduleSave);
  form.addEventListener('change', scheduleSave);
}

// ---------- actions ----------
function ensureMinimal(){
  const company = el('#company').value.trim();
  if(!company){
    alert('Gelieve een bedrijf op te geven.');
    el('#company').focus();
    return false;
  }
  return true;
}

el('#btnExportJson').addEventListener('click', ()=>{
  if(!ensureMinimal()) return;
  const data = collectForm();
  const base = data.company ? safeFileBase(data.company) : 'customer';
  download(`customer-sheet_${base}.json`, 'application/json', JSON.stringify(data, null, 2));
});

el('#btnExportCsv').addEventListener('click', ()=>{
  if(!ensureMinimal()) return;
  const d = collectForm();
  const headers = ['company','clientNumber','nace','employeeCount','contact','phone','needsFollowUp','modules','notes','createdAtISO'];
  const values = [
    d.company,
    d.clientNumber,
    d.nace,
    d.employeeCount,
    d.contact,
    d.phone,
    d.needsFollowUp,
    d.modules.join('|'),
    d.notes.replace(/\r?\n/g,' '),
    d.createdAtISO
  ];
  const csv = [headers.join(','), values.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')].join('\n');
  const base = d.company ? safeFileBase(d.company) : 'customer';
  download(`customer-sheet_${base}.csv`, 'text/csv', csv);
});

el('#btnPrint').addEventListener('click', ()=>{
  if(!ensureMinimal()) return;
  window.print();
});

el('#btnReset').addEventListener('click', ()=>{
  if (!confirm('Formulier en concept wissen?')) return;
  el('#customerForm').reset();
  contacts = [newContact()];
  renderContacts();
  localStorage.removeItem(STORAGE_KEY);
  if (saveStatusEl) saveStatusEl.textContent = '';
});

// add-contact
el('#btnAddContact').addEventListener('click', ()=>{
  contacts.push(newContact());
  renderContacts();
  scheduleSave();
});

// ---------- init ----------
loadDraft();
wireAutosave();
renderContacts();
