function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function setParam(name, value) {
  const url = new URL(window.location.href);
  if (!value) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  window.history.replaceState({}, "", url.toString());
}

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

function titleFromFilename(name) {
  let t = name.replace(/^PriceList_\d{4}_/i, "").replace(/\.csv$/i, "");
  t = t.replace(/_/g, " ").trim();
  if (/^sleepbag$/i.test(t)) return "Sleeping Bags";
  return t;
}

function backLabel(lang) {
  return lang === "it" ? "Torna al menu" : "Back to menu";
}

function uiText(lang) {
  if (lang === "it") {
    return {
      searchPlaceholder: "Cerca prodotti...",
      showingProducts: "Visualizzati {shown} / {total} prodotti",
      photoColumn: "Foto",
      showMore: "Mostra di piu",
      showLess: "Mostra meno",
      noRows: "Nessuna riga in questo CSV.",
      noColumns: "Nessuna colonna trovata in questo CSV.",
      noSkuEan: "Nessuna riga con SKU ed EAN.",
      missingFileTitle: "Parametro file mancante",
      openFromMenu: "Apri dal menu."
    };
  }
  return {
    searchPlaceholder: "Search products...",
    showingProducts: "Showing {shown} / {total} products",
    photoColumn: "Photo",
    showMore: "Show more",
    showLess: "Show less",
    noRows: "No rows in this CSV.",
    noColumns: "No columns found in this CSV.",
    noSkuEan: "No rows with both SKU and EAN.",
    missingFileTitle: "Missing file parameter",
    openFromMenu: "Open from the menu."
  };
}

function translateColumnHeader(key, lang) {
  if (lang !== "it") return key;
  const name = normalizeHeaderName(key);
  const map = {
    "article number sku": "Numero Articolo (SKU)",
    "ean": "EAN",
    "product name": "Nome Prodotto",
    "product photo": "Foto Prodotto",
    "registered design": "Design Registrato",
    "description": "Descrizione",
    "brutto price": "Prezzo Lordo",
    "dropshipping discount": "Sconto Dropshipping",
    "wholesale discount": "Sconto Ingrosso",
    "wholesale price": "Prezzo Ingrosso",
    "retail price": "Prezzo Dettaglio",
    "vat": "IVA",
    "color": "Colore",
    "material": "Materiale",
    "product dimensions and weight": "Dimensioni e Peso del Prodotto",
    "dimensions and weight of the shipment": "Dimensioni e Peso della Spedizione",
    "photos": "Foto"
  };
  return map[name] || key;
}

async function loadMenuTranslations(lang) {
  try {
    const res = await fetch(`i18n/menu_${lang}.json`, { cache: "no-store" });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data.labels === "object" ? data.labels : {};
  } catch (_) {
    return {};
  }
}

function loadAdminOverrideIndex() {
  try {
    const raw = localStorage.getItem("pricelist.admin.v1");
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    const overrides = parsed && typeof parsed.overrides === "object" ? parsed.overrides : {};
    const index = new Map();
    Object.entries(overrides).forEach(([sku, entry]) => {
      const key = normalizeToken(sku);
      if (!key || !entry || typeof entry !== "object") return;
      index.set(key, entry);
    });
    return index;
  } catch (_) {
    return new Map();
  }
}

async function loadTranslations(lang) {
  try {
    const res = await fetch(`i18n/${lang}.json`, { cache: "no-store" });
    if (!res.ok) return new Map();
    const data = await res.json();
    const products = data && typeof data.products === "object" ? data.products : {};
    const index = new Map();
    Object.entries(products).forEach(([sku, entry]) => {
      const key = normalizeToken(sku);
      if (key) index.set(key, entry || {});
    });
    return index;
  } catch (_) {
    return new Map();
  }
}

function fileNameFromPath(path) {
  const parts = String(path || "").split("/");
  return parts[parts.length - 1] || "";
}

function stemFromFileName(name) {
  return String(name || "").replace(/\.[^.]+$/, "");
}

function stemBeforeSuffix(stem) {
  const m = String(stem || "").match(/^(.*?)(?:[_-][^_-]+)$/);
  return m ? m[1] : "";
}

async function loadPhotoIndex() {
  try {
    const res = await fetch("photos/manifest.json", { cache: "no-store" });
    if (!res.ok) return new Map();

    const data = await res.json();
    const files = Array.isArray(data.files) ? data.files : [];
    const index = new Map();

    files.forEach((path) => {
      const fileName = fileNameFromPath(path);
      const stem = stemFromFileName(fileName);
      const fullStem = normalizeToken(stem);
      const baseStem = normalizeToken(stemBeforeSuffix(stem));
      const publicPath = `photos/${path}`;

      if (fullStem && !index.has(fullStem)) index.set(fullStem, publicPath);
      if (baseStem && !index.has(baseStem)) index.set(baseStem, publicPath);
    });

    return index;
  } catch (_) {
    return new Map();
  }
}

function findSkuKey(keys) {
  return keys.find((k) => {
    const name = normalizeHeaderName(k);
    return name.includes("sku") || name.includes("article number") || name.includes("article no");
  });
}

function findEanKey(keys) {
  return keys.find((k) => normalizeHeaderName(k).includes("ean"));
}

function findProductNameKey(keys) {
  return keys.find((k) => normalizeHeaderName(k).includes("product name"));
}

function findDescriptionKey(keys) {
  return keys.find((k) => normalizeHeaderName(k).includes("description"));
}

function findColorKey(keys) {
  return keys.find((k) => normalizeHeaderName(k) === "color");
}

function findMaterialKey(keys) {
  return keys.find((k) => normalizeHeaderName(k) === "material");
}

function filterKeysByMatch(keys, matcher) {
  return keys.filter((k) => matcher(k));
}

function firstNonEmptyValue(row, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const v = normalizeToken(row?.[keys[i]]);
    if (v) return v;
  }
  return "";
}

function collectKeys(rows) {
  const keys = [];
  const seen = new Set();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (key === "__parsed_extra") return;
      if (seen.has(key)) return;
      seen.add(key);
      keys.push(key);
    });
  });
  return keys;
}

function combineWithComma(left, right) {
  const a = (left ?? "").toString().trim();
  const b = (right ?? "").toString().trim();
  if (a && b) return `${a}, ${b}`;
  return a || b || "";
}

function transformColumns(rows, keys) {
  const nextKeys = [...keys];
  const isGeneratedBlank = (k) => /^Column \d+$/i.test(String(k || "").trim());

  const combineNextBlankInto = (targetMatcher) => {
    const targetIdx = nextKeys.findIndex((k) => targetMatcher(normalizeHeaderName(k)));
    if (targetIdx === -1 || targetIdx + 1 >= nextKeys.length) return;
    const targetKey = nextKeys[targetIdx];
    const nextKey = nextKeys[targetIdx + 1];
    if (!isGeneratedBlank(nextKey)) return;

    rows.forEach((row) => {
      row[targetKey] = combineWithComma(row[targetKey], row[nextKey]);
      delete row[nextKey];
    });
    nextKeys.splice(targetIdx + 1, 1);
  };

  combineNextBlankInto((name) => name.includes("product dimensions and weight"));
  combineNextBlankInto((name) => name.includes("dimensions and weight of the shipment"));

  const photosKey = nextKeys.find((k) => normalizeHeaderName(k) === "photos");
  if (photosKey) {
    const idx = nextKeys.indexOf(photosKey);
    if (idx !== -1) nextKeys.splice(idx, 1);
    rows.forEach((row) => {
      delete row[photosKey];
    });
  }

  return { rows, keys: nextKeys };
}

function applyTranslations(rows, keys, translationIndex) {
  if (!translationIndex || !translationIndex.size) return rows;

  const skuKey = findSkuKey(keys) || findSkuKey(collectKeys(rows));
  const nameKey = findProductNameKey(keys);
  const descriptionKey = findDescriptionKey(keys);
  const colorKey = findColorKey(keys);
  const materialKey = findMaterialKey(keys);
  if (!skuKey || (!nameKey && !descriptionKey && !colorKey && !materialKey)) return rows;

  return rows.map((row) => {
    const sku = normalizeToken(row?.[skuKey]);
    const translated = sku ? translationIndex.get(sku) : null;
    if (!translated) return row;

    const next = { ...row };
    if (nameKey && translated.name && String(translated.name).trim()) {
      next[nameKey] = String(translated.name).trim();
    }
    if (descriptionKey && translated.description && String(translated.description).trim()) {
      next[descriptionKey] = String(translated.description).trim();
    }
    if (colorKey && translated.color && String(translated.color).trim()) {
      next[colorKey] = String(translated.color).trim();
    }
    if (materialKey && translated.material && String(translated.material).trim()) {
      next[materialKey] = String(translated.material).trim();
    }
    return next;
  });
}

function isProbablyImageUrl(v) {
  if (!v) return false;
  const s = String(v).toLowerCase();
  return s.startsWith("http") && (s.endsWith(".jpg") || s.endsWith(".jpeg") || s.endsWith(".png") || s.endsWith(".webp"));
}

function columnClass(key) {
  const name = normalizeToken(key).replace(/\s+/g, " ");
  if (name.includes("description")) return "col-description";
  return "";
}

function isHiddenDisplayColumn(key) {
  return normalizeHeaderName(key) === "product photo";
}

function isBruttoPriceColumn(key) {
  return normalizeHeaderName(key).includes("brutto price");
}

function isDiscountColumn(key) {
  const name = normalizeHeaderName(key);
  return name.includes("discount");
}

function findBruttoPriceKey(keys) {
  return keys.find((k) => isBruttoPriceColumn(k));
}

function findKeyByHeaderIncludes(keys, terms) {
  return keys.find((k) => {
    const name = normalizeHeaderName(k);
    return terms.some((term) => name.includes(term));
  });
}

function applyAdminOverrides(data, file) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  const overrides = loadAdminOverrideIndex();
  if (!keys.length || !overrides.size) return { rows, keys };

  const rowKeys = collectKeys(rows);
  const skuKey = findSkuKey(keys) || findSkuKey(rowKeys);
  const eanKey = findEanKey(keys) || findEanKey(rowKeys);
  if (!skuKey || !eanKey) return { rows, keys };

  const nameKey = findProductNameKey(keys) || findProductNameKey(rowKeys) || findKeyByHeaderIncludes(rowKeys, ["name"]);
  const descriptionKey = findDescriptionKey(keys) || findDescriptionKey(rowKeys);
  const colorKey = findColorKey(keys) || findColorKey(rowKeys);
  const materialKey = findMaterialKey(keys) || findMaterialKey(rowKeys);
  const bruttoKey = findBruttoPriceKey(keys) || findBruttoPriceKey(rowKeys);

  const nextRows = [];
  const seen = new Set();

  rows.forEach((row) => {
    const sku = normalizeToken(row?.[skuKey]);
    if (!sku) {
      nextRows.push(row);
      return;
    }
    const ov = overrides.get(sku);
    if (ov && ov.hidden) return;
    if (!ov) {
      seen.add(sku);
      nextRows.push(row);
      return;
    }

    const patched = { ...row };
    if (ov.sku && String(ov.sku).trim()) patched[skuKey] = String(ov.sku).trim();
    if (ov.ean && String(ov.ean).trim()) patched[eanKey] = String(ov.ean).trim();
    if (nameKey && ov.name && String(ov.name).trim()) patched[nameKey] = String(ov.name).trim();
    if (descriptionKey && ov.description && String(ov.description).trim()) patched[descriptionKey] = String(ov.description).trim();
    if (colorKey && ov.color && String(ov.color).trim()) patched[colorKey] = String(ov.color).trim();
    if (materialKey && ov.material && String(ov.material).trim()) patched[materialKey] = String(ov.material).trim();
    if (bruttoKey && ov.bruttoPrice && String(ov.bruttoPrice).trim()) patched[bruttoKey] = String(ov.bruttoPrice).trim();

    seen.add(sku);
    nextRows.push(patched);
  });

  overrides.forEach((ov, skuNorm) => {
    if (!ov || ov.hidden) return;
    if (normalizeToken(ov.categoryFile) !== normalizeToken(file)) return;
    if (seen.has(skuNorm)) return;

    const row = {};
    keys.forEach((k) => { row[k] = ""; });
    row[skuKey] = ov.sku && String(ov.sku).trim() ? String(ov.sku).trim() : skuNorm.toUpperCase();
    row[eanKey] = ov.ean && String(ov.ean).trim() ? String(ov.ean).trim() : "";
    if (nameKey) row[nameKey] = ov.name && String(ov.name).trim() ? String(ov.name).trim() : "";
    if (descriptionKey) row[descriptionKey] = ov.description && String(ov.description).trim() ? String(ov.description).trim() : "";
    if (colorKey) row[colorKey] = ov.color && String(ov.color).trim() ? String(ov.color).trim() : "";
    if (materialKey) row[materialKey] = ov.material && String(ov.material).trim() ? String(ov.material).trim() : "";
    if (bruttoKey) row[bruttoKey] = ov.bruttoPrice && String(ov.bruttoPrice).trim() ? String(ov.bruttoPrice).trim() : "";
    nextRows.push(row);
  });

  return { rows: nextRows, keys };
}

function italianizeText(text) {
  let out = String(text ?? "");
  const replacements = [
    [/\\bwhite\\b/gi, "bianco"],
    [/\\bblack\\b/gi, "nero"],
    [/\\bgray\\b|\\bgrey\\b/gi, "grigio"],
    [/\\bbeige\\b/gi, "beige"],
    [/\\bgreen\\b/gi, "verde"],
    [/\\bblue\\b/gi, "blu"],
    [/\\bpink\\b/gi, "rosa"],
    [/\\bnatural\\b/gi, "naturale"],
    [/\\bwood\\b/gi, "legno"],
    [/\\bcotton\\b/gi, "cotone"],
    [/\\bbamboo\\b/gi, "bambu"],
    [/\\bmattress\\b/gi, "materasso"],
    [/\\bsheet\\b/gi, "lenzuolo"],
    [/\\bpillow\\b/gi, "cuscino"],
    [/\\bduvet\\b/gi, "piumone"],
    [/\\bquilt\\b/gi, "trapunta"],
    [/\\bcover\\b/gi, "copertura"],
    [/\\bcanopy\\b/gi, "baldacchino"],
    [/\\bplaypen\\b/gi, "box"],
    [/\\bmoses basket\\b/gi, "cesta di Mose"],
    [/\\bdresser\\b/gi, "cassettiera"],
    [/\\bsleepbag\\b/gi, "sacco nanna"],
    [/\\bbaby bed\\b/gi, "lettino bebe"],
    [/\\bwith filling\\b/gi, "con imbottitura"],
    [/\\bwith\\b/gi, "con"],
    [/\\band\\b/gi, "e"],
    [/\\bdimensions\\b/gi, "dimensioni"],
    [/\\btechnical information\\b|\\btechnical informations\\b/gi, "informazioni tecniche"],
    [/\\bset contains\\b/gi, "il set contiene"],
    [/\\bproperties\\b/gi, "caratteristiche"],
    [/\\bcare instructions\\b/gi, "istruzioni per il lavaggio"],
    [/\\bmachine washable\\b/gi, "lavabile in lavatrice"],
    [/\\bfabric\\b/gi, "tessuto"],
    [/\\bfilling\\b/gi, "imbottitura"],
    [/\\bhypoallergenic\\b/gi, "ipoallergenico"],
    [/\\bantibacterial\\b/gi, "antibatterico"],
    [/\\bantifungal\\b/gi, "antifungino"],
    [/\\bthermoregulating\\b|\\bthermoregulatory\\b/gi, "termoregolante"]
  ];
  replacements.forEach(([pattern, value]) => {
    out = out.replace(pattern, value);
  });
  return out;
}

function translateFieldValue(key, value, lang) {
  if (lang !== "it") return value;
  const name = normalizeHeaderName(key);
  if (name === "product name" || name === "description" || name === "color" || name === "material") {
    return italianizeText(value);
  }
  return value;
}

function formatTwoDecimals(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return raw;
  return num.toFixed(2);
}

function formatDiscountPercent(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("%")) return raw;
  const normalized = raw.replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return raw;
  return `${(num * 100).toFixed(0)}%`;
}

function formatSkuDisplay(key, value) {
  const header = normalizeHeaderName(key);
  const isSkuColumn = header.includes("sku") || header.includes("article number") || header.includes("article no");
  if (!isSkuColumn) return value;
  const raw = String(value ?? "").trim();
  if (!/^\d{3}$/.test(raw)) return value;
  return `000${raw}`;
}

function renderCell(key, value, ui, lang) {
  const cls = columnClass(key);
  const withSkuFormat = formatSkuDisplay(key, value);
  let text = translateFieldValue(key, (withSkuFormat ?? "").toString(), lang);
  if (isBruttoPriceColumn(key)) text = formatTwoDecimals(text);
  if (isDiscountColumn(key)) text = formatDiscountPercent(text);

  if (cls === "col-description") {
    const safeText = escapeHtml(text);
    if (!text.trim()) return `<td class="${cls}"><div class="desc-text">${safeText}</div></td>`;
    return `
      <td class="${cls}">
        <div class="desc-wrap">
          <div class="desc-text is-collapsed">${safeText}</div>
          <button type="button" class="desc-toggle" data-more="${escapeHtml(ui.showMore)}" data-less="${escapeHtml(ui.showLess)}">${escapeHtml(ui.showMore)}</button>
        </div>
      </td>
    `;
  }

  return `<td class="${cls}">${escapeHtml(text)}</td>`;
}

async function loadCsv(file) {
  const url = `csv/${file}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  const text = await res.text();
  const headerCounts = new Map();

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        const allRows = Array.isArray(results.data) ? results.data : [];
        if (!allRows.length) {
          resolve({ rows: [], keys: [] });
          return;
        }

        const rawHeaders = Array.isArray(allRows[0]) ? allRows[0] : [];
        const keys = rawHeaders.map((header, index) => {
          const base = String(header || "").trim() || `Column ${index + 1}`;
          const seen = headerCounts.get(base) || 0;
          headerCounts.set(base, seen + 1);
          return seen === 0 ? base : `${base} (${seen + 1})`;
        });

        const rows = allRows.slice(1).map((cells) => {
          const values = Array.isArray(cells) ? cells : [];
          const row = {};
          for (let i = 0; i < keys.length; i += 1) row[keys[i]] = values[i] ?? "";
          return row;
        });

        resolve(transformColumns(rows, keys));
      },
      error: reject
    });
  });
}

function renderTable(data, query, photoIndex, lang) {
  const ui = uiText(lang);
  const out = document.getElementById("out");
  const rows = data?.rows || [];
  const keys = data?.keys || [];

  if (!rows.length) {
    out.innerHTML = `<p>${escapeHtml(ui.noRows)}</p>`;
    return;
  }
  if (!keys.length) {
    out.innerHTML = `<p>${escapeHtml(ui.noColumns)}</p>`;
    return;
  }

  const rowKeys = collectKeys(rows);
  const displayKeys = keys.filter((k) => !isHiddenDisplayColumn(k));

  const skuKey = findSkuKey(keys) || findSkuKey(rowKeys);
  const eanKey = findEanKey(keys) || findEanKey(rowKeys);
  const skuCandidates = skuKey ? [skuKey] : filterKeysByMatch(rowKeys, (k) => {
    const n = normalizeHeaderName(k);
    return n.includes("sku") || n.includes("article number") || n.includes("article no");
  });
  const eanCandidates = eanKey ? [eanKey] : filterKeysByMatch(rowKeys, (k) => normalizeHeaderName(k).includes("ean"));

  const eligibleRows = rows.filter((r) => Boolean(firstNonEmptyValue(r, skuCandidates) && firstNonEmptyValue(r, eanCandidates)));
  if (!eligibleRows.length) {
    out.innerHTML = `<p>${escapeHtml(ui.noSkuEan)}</p>`;
    return;
  }

  const q = (query || "").toLowerCase().trim();
  const filtered = !q
    ? eligibleRows
    : eligibleRows.filter((r) => rowKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)));

  const imageKey =
    rowKeys.find((k) => ["image", "image_url", "photo", "photo_url", "img", "img_url"].includes(k.toLowerCase())) ||
    rowKeys.find((k) => filtered.some((r) => isProbablyImageUrl(r[k])));

  const hasPhotoColumn = filtered.some((r) => {
    const sku = firstNonEmptyValue(r, skuCandidates);
    const localPhoto = sku ? photoIndex.get(sku) : "";
    if (localPhoto) return true;
    if (imageKey && isProbablyImageUrl(r[imageKey])) return true;
    return false;
  });

  const head = `
    <thead>
      <tr>
        ${hasPhotoColumn ? `<th>${escapeHtml(ui.photoColumn)}</th>` : ""}
        ${displayKeys.map((k) => `<th class="${columnClass(k)}">${escapeHtml(translateColumnHeader(k, lang))}</th>`).join("")}
      </tr>
    </thead>
  `;

  const body = `
    <tbody>
      ${filtered.map((r) => `
        <tr>
          ${hasPhotoColumn ? `<td>${(() => {
            const sku = firstNonEmptyValue(r, skuCandidates);
            const localPhoto = sku ? photoIndex.get(sku) : "";
            if (localPhoto) return `<img class="img" src="${localPhoto}" alt="">`;
            if (imageKey && isProbablyImageUrl(r[imageKey])) return `<img class="img" src="${r[imageKey]}" alt="">`;
            return "";
          })()}</td>` : ""}
          ${displayKeys.map((k) => renderCell(k, r[k], ui, lang)).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;

  const showing = ui.showingProducts
    .replace("{shown}", String(filtered.length))
    .replace("{total}", String(eligibleRows.length));

  out.innerHTML = `
    <p class="muted">${escapeHtml(showing)}</p>
    <div class="table-scroll">
      <table>${head}${body}</table>
    </div>
  `;
}

async function main() {
  const file = getParam("file");
  let currentLang = getParam("lang") || "en";
  const titleEl = document.getElementById("title");
  const outEl = document.getElementById("out");
  const backEl = document.getElementById("back-link");
  const input = document.getElementById("q");
  const langButtons = Array.from(document.querySelectorAll(".lang-flag[data-lang]"));

  const setActiveLang = (lang) => {
    langButtons.forEach((btn) => {
      const active = btn.dataset.lang === lang;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };
  setActiveLang(currentLang);

  if (!file) {
    const ui = uiText(currentLang);
    titleEl.textContent = ui.missingFileTitle;
    outEl.innerHTML = `<p>${escapeHtml(ui.openFromMenu)}</p>`;
    return;
  }

  let rows = [];
  let keys = [];
  let photoIndex = new Map();
  let translationIndex = new Map();
  let menuLabels = {};

  try {
    [{ rows, keys }, photoIndex, translationIndex, menuLabels] = await Promise.all([
      loadCsv(file),
      loadPhotoIndex(),
      loadTranslations(currentLang),
      loadMenuTranslations(currentLang)
    ]);
  } catch (e) {
    outEl.innerHTML = `<p>${escapeHtml(e.message)}</p>`;
    return;
  }

  outEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".desc-toggle");
    if (!btn) return;
    const wrap = btn.closest(".desc-wrap");
    const textEl = wrap ? wrap.querySelector(".desc-text") : null;
    if (!textEl) return;
    const collapsed = textEl.classList.toggle("is-collapsed");
    btn.textContent = collapsed ? (btn.dataset.more || "Show more") : (btn.dataset.less || "Show less");
  });

  const render = () => {
    const ui = uiText(currentLang);
    titleEl.textContent = menuLabels[file] || titleFromFilename(file);
    backEl.textContent = backLabel(currentLang);
    backEl.href = `index.html?lang=${encodeURIComponent(currentLang)}`;
    input.placeholder = ui.searchPlaceholder;

    const translatedRows = applyTranslations(rows, keys, translationIndex);
    const rowsWithAdminOverrides = applyAdminOverrides({ rows: translatedRows, keys }, file);
    renderTable(rowsWithAdminOverrides, input.value, photoIndex, currentLang);
  };

  render();
  input.addEventListener("input", render);

  langButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const selected = btn.dataset.lang || "en";
      if (selected === currentLang) return;
      currentLang = selected;
      setParam("lang", currentLang);
      setActiveLang(currentLang);
      [translationIndex, menuLabels] = await Promise.all([
        loadTranslations(currentLang),
        loadMenuTranslations(currentLang)
      ]);
      render();
    });
  });
}

main();
