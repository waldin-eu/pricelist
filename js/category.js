function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function titleFromFilename(name) {
  let t = name.replace(/^PriceList_\d{4}_/i, "").replace(/\.csv$/i, "");
  t = t.replace(/_/g, " ").trim();
  if (/^sleepbag$/i.test(t)) return "Sleeping Bags";
  return t;
}

function isProbablyImageUrl(v) {
  if (!v) return false;
  const s = String(v).toLowerCase();
  return s.startsWith("http") && (s.endsWith(".jpg") || s.endsWith(".jpeg") || s.endsWith(".png") || s.endsWith(".webp"));
}

function normalizeToken(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeHeaderName(v) {
  return normalizeToken(v).replace(/[^a-z0-9]+/g, " ");
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
    const name = normalizeHeaderName(k).replace(/\s+/g, " ");
    return name.includes("sku") || name.includes("article number") || name.includes("article no");
  });
}

function findEanKey(keys) {
  return keys.find((k) => {
    const name = normalizeHeaderName(k).replace(/\s+/g, " ");
    return name.includes("ean");
  });
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

function columnClass(key) {
  const name = normalizeToken(key).replace(/\s+/g, " ");
  if (name.includes("description")) return "col-description";
  return "";
}

function isBruttoPriceColumn(key) {
  const name = normalizeHeaderName(key).replace(/\s+/g, " ");
  return name.includes("brutto price");
}

function formatTwoDecimals(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return raw;
  return num.toFixed(2);
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCell(key, value) {
  const cls = columnClass(key);
  let text = (value ?? "").toString();
  if (isBruttoPriceColumn(key)) {
    text = formatTwoDecimals(text);
  }

  if (cls === "col-description") {
    const hasText = text.trim().length > 0;
    const safeText = escapeHtml(text);
    if (!hasText) {
      return `<td class="${cls}"><div class="desc-text">${safeText}</div></td>`;
    }
    return `
      <td class="${cls}">
        <div class="desc-wrap">
          <div class="desc-text is-collapsed">${safeText}</div>
          <button type="button" class="desc-toggle">Show more</button>
        </div>
      </td>
    `;
  }

  return `<td class="${cls}">${escapeHtml(text)}</td>`;
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
  const key12 = nextKeys[11];
  const key13 = nextKeys[12];
  const key14 = nextKeys[13];
  const key15 = nextKeys[14];

  if (key12 && key13) {
    rows.forEach((row) => {
      row[key12] = combineWithComma(row[key12], row[key13]);
    });
    nextKeys.splice(12, 1);
    rows.forEach((row) => {
      delete row[key13];
    });
  }

  if (key14 && key15) {
    rows.forEach((row) => {
      row[key14] = combineWithComma(row[key14], row[key15]);
    });
    const idx15 = nextKeys.indexOf(key15);
    if (idx15 !== -1) nextKeys.splice(idx15, 1);
    rows.forEach((row) => {
      delete row[key15];
    });
  }

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
          for (let i = 0; i < keys.length; i += 1) {
            row[keys[i]] = values[i] ?? "";
          }
          return row;
        });

        resolve(transformColumns(rows, keys));
      },
      error: reject
    });
  });
}

function renderTable(data, query, photoIndex) {
  const out = document.getElementById("out");
  const rows = data?.rows || [];
  const keys = data?.keys || [];
  if (!rows.length) {
    out.innerHTML = "<p>No rows in this CSV.</p>";
    return;
  }

  if (!keys.length) {
    out.innerHTML = "<p>No columns found in this CSV.</p>";
    return;
  }
  const rowKeys = collectKeys(rows);
  const skuKey = findSkuKey(keys) || findSkuKey(rowKeys);
  const eanKey = findEanKey(keys) || findEanKey(rowKeys);
  const skuCandidates = skuKey
    ? [skuKey]
    : filterKeysByMatch(rowKeys, (k) => normalizeHeaderName(k).includes("sku") || normalizeHeaderName(k).includes("article number") || normalizeHeaderName(k).includes("article no"));
  const eanCandidates = eanKey
    ? [eanKey]
    : filterKeysByMatch(rowKeys, (k) => normalizeHeaderName(k).includes("ean"));
  const eligibleRows = rows.filter((r) => {
    const sku = firstNonEmptyValue(r, skuCandidates);
    const ean = firstNonEmptyValue(r, eanCandidates);
    return Boolean(sku && ean);
  });

  if (!eligibleRows.length) {
    out.innerHTML = "<p>No rows with both SKU and EAN.</p>";
    return;
  }

  const q = (query || "").toLowerCase().trim();

  const filtered = !q ? eligibleRows : eligibleRows.filter(r =>
    keys.some(k => String(r[k] ?? "").toLowerCase().includes(q))
  );

  // Try to find an image column by common names or by content
  const imageKey =
    keys.find(k => ["image", "image_url", "photo", "photo_url", "img", "img_url"].includes(k.toLowerCase())) ||
    keys.find(k => filtered.some(r => isProbablyImageUrl(r[k])));
  const hasPhotoColumn = Boolean(imageKey || (skuKey && photoIndex.size > 0));

  const head = `
    <thead>
      <tr>
        ${hasPhotoColumn ? `<th>Photo</th>` : ""}
        ${keys.map(k => `<th class="${columnClass(k)}">${escapeHtml(k)}</th>`).join("")}
      </tr>
    </thead>
  `;

  const body = `
    <tbody>
      ${filtered.map(r => `
        <tr>
          ${hasPhotoColumn ? `<td>${(() => {
            const sku = firstNonEmptyValue(r, skuCandidates);
            const localPhoto = sku ? photoIndex.get(sku) : "";
            if (localPhoto) return `<img class="img" src="${localPhoto}" alt="">`;
            if (imageKey && isProbablyImageUrl(r[imageKey])) return `<img class="img" src="${r[imageKey]}" alt="">`;
            return "";
          })()}</td>` : ""}
          ${keys.map(k => renderCell(k, r[k])).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;

  out.innerHTML = `
    <p class="muted">Showing ${filtered.length} / ${eligibleRows.length} products</p>
    <div class="table-scroll">
      <table>${head}${body}</table>
    </div>
  `;
}

async function main() {
  const file = getParam("file");
  const titleEl = document.getElementById("title");
  const outEl = document.getElementById("out");

  if (!file) {
    titleEl.textContent = "Missing file parameter";
    outEl.innerHTML = "<p>Open from the categories page.</p>";
    return;
  }

  titleEl.textContent = titleFromFilename(file);

  let rows = [];
  let keys = [];
  let photoIndex = new Map();
  try {
    [{ rows, keys }, photoIndex] = await Promise.all([loadCsv(file), loadPhotoIndex()]);
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
    const expanded = textEl.classList.toggle("is-collapsed");
    btn.textContent = expanded ? "Show more" : "Show less";
  });

  const input = document.getElementById("q");
  renderTable({ rows, keys }, "", photoIndex);

  input.addEventListener("input", () => renderTable({ rows, keys }, input.value, photoIndex));
}

main();
