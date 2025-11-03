// Tiny, dependency-free combobox with grouped (non-selectable) headers
export function initNaceCombobox({ mountId = "nace-combobox", src = "data/nace.json", placeholder = "Zoek NACE code…" } = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) return console.warn(`[NACE] Mount #${mountId} not found.`);

  mount.classList.add("cbx");
  mount.innerHTML = `
    <label for="naceInput" class="cbx-label">NACE code</label>
    <div class="cbx-inputwrap" role="combobox" aria-haspopup="listbox" aria-owns="${mountId}-listbox" aria-expanded="false">
      <input id="naceInput" name="nace" type="text" autocomplete="off" placeholder="${placeholder}" aria-autocomplete="list" aria-controls="${mountId}-listbox" />
      <button type="button" class="cbx-toggle" aria-label="Open list">▾</button>
    </div>
    <div class="cbx-popover" id="${mountId}-listbox" role="listbox" tabindex="-1" hidden></div>
  `;

  const input = mount.querySelector("#naceInput");
  const toggleBtn = mount.querySelector(".cbx-toggle");
  const popover = mount.querySelector(".cbx-popover");
  const combo = mount.querySelector(".cbx-inputwrap");

  let data = [];        // [{group, items:[{code,label,level}]}]
  let flat = [];        // rendered items with indices incl. headers
  let activeIndex = -1; // current keyboard focus
  let open = false;

  function setOpen(v) {
    open = !!v;
    combo.setAttribute("aria-expanded", String(open));
    popover.hidden = !open;
  }

  function isHeader(item) { return item && item.type === "header"; }

  function buildFlat(groups) {
    const out = [];
    groups.forEach(g => {
      out.push({ type: "header", label: g.group });
      g.items.forEach(it => out.push({ type: "option", value: `${it.code} — ${it.label}` }));
    });
    return out;
  }

  function filterFlat(q) {
    const query = q.trim().toLowerCase();
    if (!query) return buildFlat(data);
    const filtered = [];
    data.forEach(g => {
      const matches = g.items.filter(it => {
        const v = `${it.code} — ${it.label}`.toLowerCase();
        return v.includes(query);
      });
      if (matches.length) {
        filtered.push({ type: "header", label: g.group });
        matches.forEach(it => filtered.push({ type: "option", value: `${it.code} — ${it.label}` }));
      }
    });
    return filtered;
  }

  function render(list) {
    popover.innerHTML = "";
    list.forEach((item, idx) => {
      if (isHeader(item)) {
        const h = document.createElement("div");
        h.className = "cbx-header";
        h.setAttribute("role", "presentation");
        h.textContent = item.label;
        popover.appendChild(h);
      } else {
        const opt = document.createElement("div");
        opt.className = "cbx-option";
        opt.setAttribute("role", "option");
        opt.setAttribute("id", `opt-${idx}`);
        opt.textContent = item.value;
        opt.addEventListener("mousedown", (e) => {
          e.preventDefault(); // keep focus
          selectIndex(idx);
        });
        popover.appendChild(opt);
      }
    });
  }

  function moveActive(delta) {
    if (!flat.length) return;
    let next = activeIndex;
    do {
      next = Math.max(0, Math.min(flat.length - 1, next + delta));
    } while (isHeader(flat[next]) && next !== activeIndex);
    setActive(next);
  }

  function setActive(idx) {
    activeIndex = idx;
    const opts = popover.querySelectorAll(".cbx-option, .cbx-header");
    opts.forEach(o => o.classList.remove("is-active"));
    if (idx >= 0 && flat[idx] && !isHeader(flat[idx])) {
      const el = popover.querySelector(`#opt-${idx}`);
      if (el) {
        el.classList.add("is-active");
        el.scrollIntoView({ block: "nearest" });
        input.setAttribute("aria-activedescendant", el.id);
      }
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function selectIndex(idx) {
    if (idx < 0 || idx >= flat.length) return;
    const item = flat[idx];
    if (isHeader(item)) return; // ignore non-selectable headers
    input.value = item.value;
    setOpen(false);
  }

  function refresh() {
    flat = filterFlat(input.value);
    render(flat);
    // reset active to first selectable
    activeIndex = -1;
    for (let i = 0; i < flat.length; i++) {
      if (!isHeader(flat[i])) { setActive(i); break; }
    }
  }

  // events
  input.addEventListener("input", () => { setOpen(true); refresh(); });
  input.addEventListener("focus", () => { setOpen(true); refresh(); });
  toggleBtn.addEventListener("click", () => { setOpen(!open); if (open) refresh(); });

  input.addEventListener("keydown", (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true); refresh(); e.preventDefault(); return;
    }
    switch (e.key) {
      case "ArrowDown": moveActive(1); e.preventDefault(); break;
      case "ArrowUp": moveActive(-1); e.preventDefault(); break;
      case "Enter": if (open && activeIndex >= 0) { selectIndex(activeIndex); e.preventDefault(); } break;
      case "Escape": setOpen(false); break;
      case "Home": setActive( findFirstOptionIndex() ); e.preventDefault(); break;
      case "End": setActive( findLastOptionIndex() ); e.preventDefault(); break;
    }
  });

  function findFirstOptionIndex() {
    for (let i = 0; i < flat.length; i++) if (!isHeader(flat[i])) return i;
    return -1;
  }
  function findLastOptionIndex() {
    for (let i = flat.length - 1; i >= 0; i--) if (!isHeader(flat[i])) return i;
    return -1;
  }

  document.addEventListener("click", (e) => {
    if (!mount.contains(e.target)) setOpen(false);
  });

  // Load data
  fetch(src, { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(json => { data = json || []; refresh(); })
    .catch(err => {
      console.error("[NACE] Failed to load JSON:", err);
      // graceful fallback: leave a simple text input
    });
}
