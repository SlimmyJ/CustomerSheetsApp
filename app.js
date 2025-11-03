const el = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const todayEl = el('#today');
todayEl.textContent = new Date().toLocaleDateString(undefined, {year:'numeric', month:'short', day:'2-digit'});

function collectForm(){
  const form = el('#customerForm');
  const modules = $$('input[name="modules"]:checked', form).map(i=>i.value);
  return {
    company: el('#company').value.trim(),
    clientNumber: Number(el('#clientNumber').value || 0),
    nace: el('#nace').value.trim(),
    employeeCount: Number(el('#employeeCount').value || 0),
    contact: el('#contact').value.trim(),
    phone: el('#phone').value.trim(),
    notes: el('#notes').value.trim(),
    needsFollowUp: el('#needsFollowUp').checked,
    modules,
    createdAtISO: new Date().toISOString()
  };
}

function ensureMinimal(){
  const company = el('#company').value.trim();
  if(!company){
    alert('Please provide a company.');
    el('#company').focus();
    return false;
  }
  return true;
}

function download(filename, mime, content){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display='none';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function safeFileBase(s){
  return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

async function loadNaceOptions() {
  const select = el('#nace');
  if (!select) return;

  try {
    const res = await fetch('data/nace.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const groups = await res.json();

    // Clear existing (keep placeholder)
    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = '';
    if (placeholder) select.appendChild(placeholder);

    // Build <optgroup>/<option> from JSON
    for (const grp of groups) {
      const og = document.createElement('optgroup');
      og.label = grp.group; // bold, non-selectable
      for (const it of grp.items) {
        const opt = document.createElement('option');
        opt.value = `${it.code} — ${it.label}`;
        opt.textContent = `${it.code} — ${it.label}`;
        og.appendChild(opt);
      }
      select.appendChild(og);
    }
  } catch (err) {
    console.error('Failed to load NACE list:', err);
    // Graceful fallback: replace <select> with a text input if fetch fails (e.g., file://)
    const parent = select.parentElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'nace';
    input.name = 'nace';
    input.placeholder = 'NACE code (type vrij in)';
    parent.replaceChild(input, select);
  }
}

// Call on load
loadNaceOptions();



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
  el('#customerForm').reset();
});
