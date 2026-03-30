const ADMIN_PASSWORD = "Waldin2026!!";
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
  selectedSku: "",
  pendingPhotoBlob: null,
  pendingPhotoChanged: false,
  pendingPhotoRemoved: false,
  previewObjectUrl: ""
};

const PHOTO_DB_NAME = "pricelistPhotos";
const PHOTO_STORE_NAME = "photos";

function normalizeToken(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeHeaderName(v) {
  return normalizeToken(v).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function stemFromFileName(name) {
  return String(name || "").replace(/\.[^.]+$/, "");
}

function stemBeforeSuffix(stem) {
  const m = String(stem || "").match(/^(.*?)(?:[_-][^_-]+)$/);
  return m ? m[1] : "";
}

function formatSkuLabel(sku) {
  const raw = String(sku || "").trim();
  if (!raw) return "";
  if (/^\d{3}$/.test(raw)) return `000${raw}`;
  return raw.toUpperCase();
}

function setPhotoPreview(dataUrl, label) {
  const preview = document.getElementById("fPhotoPreview");
  const src = String(dataUrl || "").trim();
  if (state.previewObjectUrl && state.previewObjectUrl.startsWith("blob:")) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = "";
  }
  preview.src = src;
  preview.dataset.label = String(label || "").trim();
  preview.style.display = src ? "block" : "none";
  if (src.startsWith("blob:")) state.previewObjectUrl = src;
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        db.createObjectStore(PHOTO_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putPhotoBlob(key, blob) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");
    tx.objectStore(PHOTO_STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhotoBlob(key) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, "readonly");
    const req = tx.objectStore(PHOTO_STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhotoBlob(key) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");
    tx.objectStore(PHOTO_STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function formatTwoDecimals(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return raw;
  return num.toFixed(2);
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

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || "").split(",");
  if (parts.length < 2) return null;
  const header = parts[0];
  const mimeMatch = header.match(/data:(.*?);base64/i);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  try {
    const binary = atob(parts[1]);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (_) {
    return null;
  }
}

async function migrateLegacyPhotos() {
  const overrides = state.store && state.store.overrides ? state.store.overrides : {};
  let changed = false;
  const tasks = Object.entries(overrides).map(async ([skuKey, entry]) => {
    if (!entry || typeof entry !== "object") return;
    const hasKey = entry.photoKey && String(entry.photoKey).trim();
    const dataUrl = entry.photoDataUrl && String(entry.photoDataUrl).trim();
    if (!dataUrl || hasKey) return;
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return;
    const key = `sku:${normalizeToken(skuKey)}`;
    await putPhotoBlob(key, blob);
    entry.photoKey = key;
    entry.photoDataUrl = "";
    changed = true;
  });
  await Promise.all(tasks);
  if (changed) {
    writeStore({ ...state.store, overrides: { ...overrides } });
  }
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
      photoPath: "",
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
      photoPath: (override.photoPath && String(override.photoPath).trim()) || (existing ? existing.photoPath : ""),
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
  state.pendingPhotoBlob = null;
  state.pendingPhotoChanged = false;
  state.pendingPhotoRemoved = false;
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
  
  // Show photo path reference or placeholder
  if (item?.photoPath) {
    const photoPreview = document.getElementById("fPhotoPreview");
    photoPreview.src = item.photoPath;
    photoPreview.dataset.label = item.photoPath;
    photoPreview.style.display = "block";
  } else {
    setPhotoPreview("", "");
  }
  
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

async function saveCurrent() {
  const sku = formValue("fSku");
  const ean = formValue("fEan");
  const categoryFile = formValue("fCategory");
  if (!sku) return alert("SKU is required.");
  if (!ean) return alert("EAN is required.");
  if (!categoryFile) return alert("Category is required.");
  const key = normalizeToken(sku);
  
  // Photo file path will be: photos/sku/{sku}.jpg (user manages actual files through git)
  let photoPath = state.pendingPhotoChanged ? `photos/sku/${key}.jpg` : "";

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
    photoPath: photoPath,
    hidden: false
  });
  state.pendingPhotoBlob = null;
  state.pendingPhotoChanged = false;
  state.pendingPhotoRemoved = false;
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
    setPhotoPreview("", "");
    state.pendingPhotoBlob = null;
    state.pendingPhotoChanged = true;
    state.pendingPhotoRemoved = true;
    document.getElementById("fPhotoFile").value = "";
  });
  document.getElementById("fPhotoFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      alert("Please choose an image file.");
      e.target.value = "";
      return;
    }
    const label = formatSkuLabel(formValue("fSku"));
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(String(reader.result || ""), label);
      state.pendingPhotoBlob = file;
      state.pendingPhotoChanged = true;
      state.pendingPhotoRemoved = false;
      e.target.value = "";
    };
    reader.onerror = () => {
      alert("Could not read the selected image.");
      e.target.value = "";
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
  return password === ADMIN_PASSWORD;
}

async function startApp() {
  await loadAppData();
  await migrateLegacyPhotos();
  rebuildCatalog();
  renderCategoryOptions();
  bindAppEvents();
  renderTable();
  showApp();
}

async function init() {
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const passwordInput = document.getElementById("passwordInput");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const pass = String(passwordInput.value || "");
    
    if (!pass) {
      loginError.textContent = "Please enter a password.";
      loginError.hidden = false;
      passwordInput.focus();
      return;
    }
    
    const ok = await unlock(pass);
    if (!ok) {
      loginError.textContent = "Invalid password. Please try again.";
      loginError.hidden = false;
      passwordInput.value = "";
      passwordInput.focus();
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
