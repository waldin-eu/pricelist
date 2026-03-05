const ADMIN_PASSWORD_HASH = "9f4b4978cd073fad33d4068570824dcbc176c9bd36b644014a3e4d50e4815a24"; // waldin-admin
const AUTH_KEY = "pricelist.admin.auth.v1";
const STORE_KEY = "pricelist.admin.v1";

const state = {
  files: [],
  baseItems: [],
  enTranslations: new Map(),
  catalog: new Map(),
  store: { overrides: {} },
  search: "",
  categoryFilter: "",
  selectedSku: ""
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

function formatTwoDecimals(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return raw;
  return num.toFixed(2);
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

function readCompositeCell(row, headers, idx) {
  if (idx < 0) return "";
  const left = String(row[idx] || "").trim();
  const nextHeader = idx + 1 < headers.length ? String(headers[idx + 1] || "").trim() : "";
  const right = !nextHeader && idx + 1 < row.length ? String(row[idx + 1] || "").trim() : "";
  if (left && right) return `${left}, ${right}`;
  return left || right || "";
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
        if (!allRows.length) return resolve([]);
        const headers = Array.isArray(allRows[0]) ? allRows[0] : [];
        const skuIdx = findColumnIndex(headers, (name) => name.includes("sku") || name.includes("article number") || name.includes("article no"));
        if (skuIdx < 0) return resolve([]);
        const eanIdx = findColumnIndex(headers, (name) => name.includes("ean"));
        const nameIdx = findColumnIndex(headers, (name) => name.includes("product name"));
        const bruttoIdx = findColumnIndex(headers, (name) => name.includes("brutto price"));
        const productDimensionsIdx = findColumnIndex(headers, (name) => name.includes("product dimensions and weight"));
        const shipmentDimensionsIdx = findColumnIndex(headers, (name) => name.includes("dimensions and weight of the shipment"));
        const items = allRows.slice(1).map((cells) => {
          const row = Array.isArray(cells) ? cells : [];
          const sku = String(row[skuIdx] || "").trim();
          if (!sku) return null;
          return {
            sku,
            ean: eanIdx >= 0 ? String(row[eanIdx] || "").trim() : "",
            name: nameIdx >= 0 ? String(row[nameIdx] || "").trim() : "",
            bruttoPrice: bruttoIdx >= 0 ? String(row[bruttoIdx] || "").trim() : "",
            productDimensions: readCompositeCell(row, headers, productDimensionsIdx),
            shipmentDimensions: readCompositeCell(row, headers, shipmentDimensionsIdx),
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
    const index = new Map();
    Object.entries(products).forEach(([sku, entry]) => {
      index.set(normalizeToken(sku), entry || {});
    });
    return index;
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
      productDimensions: item.productDimensions || "",
      shipmentDimensions: item.shipmentDimensions || "",
      bruttoPrice: item.bruttoPrice || "",
      photoDataUrl: "",
      source: "base",
      hidden: false
    });
  });

  Object.entries(state.store.overrides).forEach(([sku, override]) => {
    const key = normalizeToken(sku);
    if (!key || !override || typeof override !== "object") return;
    const existing = map.get(key);
    map.set(key, {
      sku: (override.sku && String(override.sku).trim()) || (existing ? existing.sku : key.toUpperCase()),
      ean: (override.ean && String(override.ean).trim()) || (existing ? existing.ean : ""),
      categoryFile: (override.categoryFile && String(override.categoryFile).trim()) || (existing ? existing.categoryFile : ""),
      name: (override.name && String(override.name).trim()) || (existing ? existing.name : ""),
      description: (override.description && String(override.description).trim()) || (existing ? existing.description : ""),
      color: (override.color && String(override.color).trim()) || (existing ? existing.color : ""),
      material: (override.material && String(override.material).trim()) || (existing ? existing.material : ""),
      productDimensions: (override.productDimensions && String(override.productDimensions).trim()) || (existing ? existing.productDimensions : ""),
      shipmentDimensions: (override.shipmentDimensions && String(override.shipmentDimensions).trim()) || (existing ? existing.shipmentDimensions : ""),
      bruttoPrice: (override.bruttoPrice && String(override.bruttoPrice).trim()) || (existing ? existing.bruttoPrice : ""),
      photoDataUrl: (override.photoDataUrl && String(override.photoDataUrl).trim()) || (existing ? existing.photoDataUrl : ""),
      source: existing ? "base+override" : "custom",
      hidden: Boolean(override.hidden)
    });
  });

  return map;
}

function allItemsSorted() {
  return Array.from(state.catalog.values()).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { sensitivity: "base" }));
}

function getVisibleItems() {
  const q = normalizeToken(state.search);
  const category = normalizeToken(state.categoryFilter);
  return allItemsSorted().filter((item) => {
    if (category && normalizeToken(item.categoryFile) !== category) return false;
    if (!q) return true;
    return [item.sku, item.ean, item.name, item.categoryFile].some((v) => normalizeToken(v).includes(q));
  });
}

function statusLabel(item) {
  if (item.hidden) return "Removed";
  if (item.source === "custom") return "Custom";
  if (item.source === "base+override") return "Overridden";
  return "Active";
}

function statusClass(item) {
  if (item.hidden) return "is-removed";
  if (item.source === "custom") return "is-custom";
  if (item.source === "base+override") return "is-overridden";
  return "is-active";
}

function updateStats(items) {
  const total = items.length;
  const removed = items.filter((x) => x.hidden).length;
  const custom = items.filter((x) => x.source === "custom").length;
  const overridden = items.filter((x) => x.source === "base+override").length;
  document.getElementById("adminStats").innerHTML = `
    <div class="admin-stat"><span>${total}</span><small>Visible Rows</small></div>
    <div class="admin-stat"><span>${overridden}</span><small>Overridden</small></div>
    <div class="admin-stat"><span>${custom}</span><small>Custom</small></div>
    <div class="admin-stat"><span>${removed}</span><small>Removed</small></div>
  `;
}

function renderCategoryOptions() {
  const options = [`<option value="">Select category</option>`]
    .concat(state.files.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`))
    .join("");
  document.getElementById("fCategory").innerHTML = options;
  document.getElementById("categoryFilter").innerHTML = `<option value="">All categories</option>${state.files.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("")}`;
}

function renderTable() {
  const items = getVisibleItems();
  updateStats(items);
  const tbody = document.getElementById("skuTableBody");
  tbody.innerHTML = items.map((item) => {
    const key = normalizeToken(item.sku);
    const selected = state.selectedSku === key ? "is-selected" : "";
    return `
      <tr class="${selected}" data-sku="${escapeHtml(key)}">
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.ean)}</td>
        <td>${escapeHtml(item.categoryFile)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(formatTwoDecimals(item.bruttoPrice))}</td>
        <td><span class="admin-badge ${statusClass(item)}">${escapeHtml(statusLabel(item))}</span></td>
        <td><button type="button" class="admin-table-edit" data-action="edit" data-sku="${escapeHtml(key)}">Edit</button></td>
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
  document.getElementById("fProductDimensions").value = item?.productDimensions || "";
  document.getElementById("fShipmentDimensions").value = item?.shipmentDimensions || "";
  document.getElementById("fBruttoPrice").value = formatTwoDecimals(item?.bruttoPrice || "");
  document.getElementById("fPhotoFile").value = "";
  const preview = document.getElementById("fPhotoPreview");
  preview.src = item?.photoDataUrl || "";
  preview.style.display = item?.photoDataUrl ? "block" : "none";
  document.getElementById("modalTitle").textContent = item ? `Edit SKU: ${item.sku}` : "New SKU";
}

function formValue(id) {
  return String(document.getElementById(id).value || "").trim();
}

function openEditor(skuNorm = "") {
  state.selectedSku = skuNorm || "";
  const item = skuNorm ? state.catalog.get(skuNorm) : null;
  setForm(item || null);
  document.getElementById("editorModal").hidden = false;
  document.body.classList.add("admin-modal-open");
  document.getElementById("fSku").focus();
  renderTable();
}

function closeEditor() {
  document.getElementById("editorModal").hidden = true;
  document.body.classList.remove("admin-modal-open");
}

function rebuildCatalog() {
  state.catalog = combineCatalog(state.baseItems);
}

function saveCurrent() {
  const sku = formValue("fSku");
  const ean = formValue("fEan");
  const categoryFile = formValue("fCategory");
  if (!sku) return alert("SKU is required.");
  if (!ean) return alert("EAN is required.");
  if (!categoryFile) return alert("Category is required.");
  const key = normalizeToken(sku);
  setOverride(key, {
    sku,
    ean,
    categoryFile,
    name: formValue("fName"),
    description: formValue("fDescription"),
    color: formValue("fColor"),
    material: formValue("fMaterial"),
    productDimensions: formValue("fProductDimensions"),
    shipmentDimensions: formValue("fShipmentDimensions"),
    bruttoPrice: formatTwoDecimals(formValue("fBruttoPrice")),
    photoDataUrl: document.getElementById("fPhotoPreview").src || "",
    hidden: false
  });
  rebuildCatalog();
  state.selectedSku = key;
  renderTable();
  closeEditor();
}

function removeCurrent() {
  const sku = formValue("fSku");
  if (!sku) return;
  const key = normalizeToken(sku);
  const existing = getOverride(key) || {};
  const base = state.catalog.get(key);
  setOverride(key, {
    ...existing,
    sku: existing.sku || base?.sku || sku,
    ean: existing.ean || base?.ean || "",
    categoryFile: existing.categoryFile || base?.categoryFile || "",
    hidden: true
  });
  rebuildCatalog();
  state.selectedSku = key;
  renderTable();
  closeEditor();
}

function restoreCurrent() {
  const sku = formValue("fSku");
  if (!sku) return;
  const key = normalizeToken(sku);
  const existing = getOverride(key);
  if (!existing) return;
  setOverride(key, { ...existing, hidden: false });
  rebuildCatalog();
  state.selectedSku = key;
  renderTable();
  closeEditor();
}

function deleteCurrentOverride() {
  const sku = formValue("fSku");
  if (!sku) return;
  const key = normalizeToken(sku);
  removeOverride(key);
  rebuildCatalog();
  state.selectedSku = key;
  renderTable();
  closeEditor();
}

function bindAppEvents() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value || "";
    renderTable();
  });
  document.getElementById("categoryFilter").addEventListener("change", (e) => {
    state.categoryFilter = e.target.value || "";
    renderTable();
  });

  document.getElementById("skuTableBody").addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-action='edit']");
    if (editBtn) {
      openEditor(editBtn.getAttribute("data-sku") || "");
      return;
    }
    const row = e.target.closest("tr[data-sku]");
    if (!row) return;
    openEditor(row.getAttribute("data-sku") || "");
  });

  document.getElementById("newBtn").addEventListener("click", () => openEditor(""));
  document.getElementById("saveBtn").addEventListener("click", saveCurrent);
  document.getElementById("removeBtn").addEventListener("click", removeCurrent);
  document.getElementById("restoreBtn").addEventListener("click", restoreCurrent);
  document.getElementById("deleteOverrideBtn").addEventListener("click", deleteCurrentOverride);
  document.getElementById("removePhotoBtn").addEventListener("click", () => {
    const preview = document.getElementById("fPhotoPreview");
    preview.removeAttribute("src");
    preview.style.display = "none";
  });
  document.getElementById("fPhotoFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const preview = document.getElementById("fPhotoPreview");
      preview.src = String(reader.result || "");
      preview.style.display = preview.src ? "block" : "none";
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("modalCloseBtn").addEventListener("click", closeEditor);
  document.getElementById("modalBackdrop").addEventListener("click", closeEditor);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("editorModal").hidden) closeEditor();
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(AUTH_KEY);
    location.reload();
  });
}

async function loadAppData() {
  state.store = readStore();
  state.files = await loadFiles();
  state.enTranslations = await loadEnTranslations();
  const perFile = await Promise.all(state.files.map((f) => loadCsvCatalog(f)));
  state.baseItems = perFile.flat();
  rebuildCatalog();
}

function showApp() {
  document.getElementById("loginView").hidden = true;
  document.getElementById("appView").hidden = false;
}

async function unlock(password) {
  const hash = await sha256Hex(password);
  return hash === ADMIN_PASSWORD_HASH;
}

async function startApp() {
  await loadAppData();
  renderCategoryOptions();
  bindAppEvents();
  renderTable();
  showApp();
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
    await startApp();
  });

  if (sessionStorage.getItem(AUTH_KEY) === "1") {
    await startApp();
  }
}

init();
