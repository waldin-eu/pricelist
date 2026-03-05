const ADMIN_PASSWORD_HASH = "9f4b4978cd073fad33d4068570824dcbc176c9bd36b644014a3e4d50e4815a24"; // waldin-admin
const AUTH_KEY = "pricelist.admin.auth.v1";
const STORE_KEY = "pricelist.admin.v1";

const state = {
  files: [],
  baseItems: [],
  catalog: new Map(),
  enTranslations: new Map(),
  search: "",
  categoryFilter: "",
  selectedSku: "",
  store: { overrides: {} }
};

function normalizeToken(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeHeaderName(v) {
  return normalizeToken(v).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", enc).then((buf) =>
    Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { overrides: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { overrides: {} };
    if (!parsed.overrides || typeof parsed.overrides !== "object") parsed.overrides = {};
    return parsed;
  } catch (_) {
    return { overrides: {} };
  }
}

function writeStore(nextStore) {
  state.store = nextStore;
  localStorage.setItem(STORE_KEY, JSON.stringify(nextStore));
}

function getOverride(sku) {
  return state.store.overrides[normalizeToken(sku)] || null;
}

function setOverride(sku, value) {
  const key = normalizeToken(sku);
  if (!key) return;
  const next = { ...state.store, overrides: { ...state.store.overrides, [key]: value } };
  writeStore(next);
}

function removeOverride(sku) {
  const key = normalizeToken(sku);
  if (!key) return;
  const overrides = { ...state.store.overrides };
  delete overrides[key];
  writeStore({ ...state.store, overrides });
}

function findColumnIndex(headers, matcher) {
  for (let i = 0; i < headers.length; i += 1) {
    if (matcher(normalizeHeaderName(headers[i]))) return i;
  }
  return -1;
}

async function loadCsvCatalog(file) {
  const res = await fetch(`csv/${file}`, { cache: "no-store" });
  if (!res.ok) return [];
  const text = await res.text();
  return new Promise((resolve) => {
    Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const allRows = Array.isArray(results.data) ? results.data : [];
        if (!allRows.length) {
          resolve([]);
          return;
        }
        const headers = Array.isArray(allRows[0]) ? allRows[0] : [];
        const skuIdx = findColumnIndex(headers, (name) => name.includes("sku") || name.includes("article number") || name.includes("article no"));
        if (skuIdx < 0) {
          resolve([]);
          return;
        }
        const eanIdx = findColumnIndex(headers, (name) => name.includes("ean"));
        const nameIdx = findColumnIndex(headers, (name) => name.includes("product name"));

        const items = allRows.slice(1).map((cells) => {
          const row = Array.isArray(cells) ? cells : [];
          const sku = String(row[skuIdx] || "").trim();
          if (!sku) return null;
          return {
            sku,
            ean: eanIdx >= 0 ? String(row[eanIdx] || "").trim() : "",
            name: nameIdx >= 0 ? String(row[nameIdx] || "").trim() : "",
            categoryFile: file
          };
        }).filter(Boolean);
        resolve(items);
      },
      error: () => resolve([])
    });
  });
}

async function loadFiles() {
  const res = await fetch("csv/manifest.json", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

async function loadEnTranslations() {
  try {
    const res = await fetch("i18n/en.json", { cache: "no-store" });
    if (!res.ok) return new Map();
    const data = await res.json();
    const products = data && typeof data.products === "object" ? data.products : {};
    const idx = new Map();
    Object.entries(products).forEach(([sku, entry]) => {
      idx.set(normalizeToken(sku), entry || {});
    });
    return idx;
  } catch (_) {
    return new Map();
  }
}

function combineCatalog(baseItems) {
  const map = new Map();
  baseItems.forEach((item) => {
    const key = normalizeToken(item.sku);
    if (!key || map.has(key)) return;
    const trans = state.enTranslations.get(key) || {};
    map.set(key, {
      sku: item.sku,
      ean: item.ean || "",
      categoryFile: item.categoryFile || "",
      name: (trans.name && String(trans.name).trim()) || item.name || "",
      description: (trans.description && String(trans.description).trim()) || "",
      color: (trans.color && String(trans.color).trim()) || "",
      material: (trans.material && String(trans.material).trim()) || "",
      bruttoPrice: "",
      source: "base",
      hidden: false
    });
  });

  Object.entries(state.store.overrides).forEach(([key, ov]) => {
    const skuKey = normalizeToken(key);
    if (!skuKey || !ov || typeof ov !== "object") return;
    const existing = map.get(skuKey);
    const merged = {
      sku: (ov.sku && String(ov.sku).trim()) || (existing ? existing.sku : skuKey.toUpperCase()),
      ean: (ov.ean && String(ov.ean).trim()) || (existing ? existing.ean : ""),
      categoryFile: (ov.categoryFile && String(ov.categoryFile).trim()) || (existing ? existing.categoryFile : ""),
      name: (ov.name && String(ov.name).trim()) || (existing ? existing.name : ""),
      description: (ov.description && String(ov.description).trim()) || (existing ? existing.description : ""),
      color: (ov.color && String(ov.color).trim()) || (existing ? existing.color : ""),
      material: (ov.material && String(ov.material).trim()) || (existing ? existing.material : ""),
      bruttoPrice: (ov.bruttoPrice && String(ov.bruttoPrice).trim()) || (existing ? existing.bruttoPrice : ""),
      source: existing ? "base+override" : "custom",
      hidden: Boolean(ov.hidden)
    };
    map.set(skuKey, merged);
  });

  return map;
}

function allItemsSorted() {
  return Array.from(state.catalog.values()).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { sensitivity: "base" }));
}

function renderCategoryOptions() {
  const options = [`<option value="">Select category</option>`].concat(
    state.files.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`)
  ).join("");
  document.getElementById("fCategory").innerHTML = options;
  document.getElementById("categoryFilter").innerHTML = `<option value="">All categories</option>${state.files.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("")}`;
}

function renderTable() {
  const q = normalizeToken(state.search);
  const categoryFilter = normalizeToken(state.categoryFilter);
  const rows = allItemsSorted().filter((item) => {
    if (categoryFilter && normalizeToken(item.categoryFile) !== categoryFilter) return false;
    if (!q) return true;
    return [item.sku, item.ean, item.categoryFile, item.name].some((v) => normalizeToken(v).includes(q));
  });

  const tbody = document.getElementById("skuTableBody");
  tbody.innerHTML = rows.map((item) => {
    const skuNorm = normalizeToken(item.sku);
    const selected = state.selectedSku && state.selectedSku === skuNorm;
    const status = item.hidden ? "Removed" : item.source === "custom" ? "Custom" : item.source === "base+override" ? "Overridden" : "Active";
    return `
      <tr data-sku="${escapeHtml(skuNorm)}" class="${selected ? "is-selected" : ""}">
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.ean)}</td>
        <td>${escapeHtml(item.categoryFile)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(status)}</td>
      </tr>
    `;
  }).join("");
}

function setForm(item) {
  document.getElementById("fSku").value = item?.sku || "";
  document.getElementById("fEan").value = item?.ean || "";
  document.getElementById("fCategory").value = item?.categoryFile || "";
  document.getElementById("fName").value = item?.name || "";
  document.getElementById("fDescription").value = item?.description || "";
  document.getElementById("fColor").value = item?.color || "";
  document.getElementById("fMaterial").value = item?.material || "";
  document.getElementById("fBruttoPrice").value = item?.bruttoPrice || "";
  document.getElementById("formTitle").textContent = item ? `Edit SKU: ${item.sku}` : "New SKU";
}

function getFormValue(id) {
  return String(document.getElementById(id).value || "").trim();
}

function selectSku(skuNorm) {
  state.selectedSku = skuNorm || "";
  const item = skuNorm ? state.catalog.get(skuNorm) : null;
  setForm(item || null);
  renderTable();
}

function saveCurrent() {
  const sku = getFormValue("fSku");
  const ean = getFormValue("fEan");
  const categoryFile = getFormValue("fCategory");
  if (!sku) {
    alert("SKU is required.");
    return;
  }
  if (!ean) {
    alert("EAN is required.");
    return;
  }
  if (!categoryFile) {
    alert("Category is required.");
    return;
  }
  const skuNorm = normalizeToken(sku);
  const payload = {
    sku,
    ean,
    categoryFile,
    name: getFormValue("fName"),
    description: getFormValue("fDescription"),
    color: getFormValue("fColor"),
    material: getFormValue("fMaterial"),
    bruttoPrice: getFormValue("fBruttoPrice"),
    hidden: false
  };
  setOverride(skuNorm, payload);
  state.catalog = combineCatalog(state.baseItems);
  selectSku(skuNorm);
}

function removeCurrent() {
  const sku = getFormValue("fSku");
  if (!sku) return;
  const skuNorm = normalizeToken(sku);
  const existing = getOverride(skuNorm) || {};
  setOverride(skuNorm, {
    ...existing,
    sku: existing.sku || (state.catalog.get(skuNorm)?.sku || sku),
    ean: existing.ean || (state.catalog.get(skuNorm)?.ean || ""),
    categoryFile: existing.categoryFile || (state.catalog.get(skuNorm)?.categoryFile || ""),
    hidden: true
  });
  state.catalog = combineCatalog(state.baseItems);
  selectSku(skuNorm);
}

function restoreCurrent() {
  const sku = getFormValue("fSku");
  if (!sku) return;
  const skuNorm = normalizeToken(sku);
  const existing = getOverride(skuNorm);
  if (!existing) return;
  setOverride(skuNorm, { ...existing, hidden: false });
  state.catalog = combineCatalog(state.baseItems);
  selectSku(skuNorm);
}

function deleteCurrentOverride() {
  const sku = getFormValue("fSku");
  if (!sku) return;
  const skuNorm = normalizeToken(sku);
  removeOverride(skuNorm);
  state.catalog = combineCatalog(state.baseItems);
  selectSku(skuNorm);
}

function setupAppEvents() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value || "";
    renderTable();
  });
  document.getElementById("categoryFilter").addEventListener("change", (e) => {
    state.categoryFilter = e.target.value || "";
    renderTable();
  });
  document.getElementById("skuTableBody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-sku]");
    if (!tr) return;
    selectSku(tr.getAttribute("data-sku") || "");
  });
  document.getElementById("newBtn").addEventListener("click", () => {
    state.selectedSku = "";
    setForm(null);
    renderTable();
  });
  document.getElementById("saveBtn").addEventListener("click", saveCurrent);
  document.getElementById("removeBtn").addEventListener("click", removeCurrent);
  document.getElementById("restoreBtn").addEventListener("click", restoreCurrent);
  document.getElementById("deleteOverrideBtn").addEventListener("click", deleteCurrentOverride);
  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(AUTH_KEY);
    location.reload();
  });
}

async function loadAppData() {
  state.store = readStore();
  state.files = await loadFiles();
  state.enTranslations = await loadEnTranslations();
  const allPerFile = await Promise.all(state.files.map((f) => loadCsvCatalog(f)));
  state.baseItems = allPerFile.flat();
  state.catalog = combineCatalog(state.baseItems);
}

function showApp() {
  document.getElementById("loginView").hidden = true;
  document.getElementById("appView").hidden = false;
}

async function unlock(password) {
  const hash = await sha256Hex(password);
  return hash === ADMIN_PASSWORD_HASH;
}

async function init() {
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const pass = String(document.getElementById("passwordInput").value || "");
    const ok = await unlock(pass);
    if (!ok) {
      loginError.hidden = false;
      return;
    }
    sessionStorage.setItem(AUTH_KEY, "1");
    await loadAppData();
    renderCategoryOptions();
    setupAppEvents();
    setForm(null);
    renderTable();
    showApp();
  });

  if (sessionStorage.getItem(AUTH_KEY) === "1") {
    await loadAppData();
    renderCategoryOptions();
    setupAppEvents();
    setForm(null);
    renderTable();
    showApp();
  }
}

init();
