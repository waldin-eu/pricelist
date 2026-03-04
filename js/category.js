function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function titleFromFilename(name) {
  let t = name.replace(/^PriceList_\d{4}_/i, "").replace(/\.csv$/i, "");
  return t.replace(/_/g, " ").trim();
}

function isProbablyImageUrl(v) {
  if (!v) return false;
  const s = String(v).toLowerCase();
  return s.startsWith("http") && (s.endsWith(".jpg") || s.endsWith(".jpeg") || s.endsWith(".png") || s.endsWith(".webp"));
}

function normalizeToken(v) {
  return String(v || "").trim().toLowerCase();
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
    const name = normalizeToken(k).replace(/\s+/g, " ");
    return name.includes("sku") || name.includes("article number");
  });
}

function columnClass(key) {
  const name = normalizeToken(key).replace(/\s+/g, " ");
  if (name.includes("description")) return "col-description";
  return "";
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
  const text = (value ?? "").toString();

  if (cls === "col-description") {
    const hasLongText = text.trim().length > 140;
    const safeText = escapeHtml(text);
    if (!hasLongText) {
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

async function loadCsv(file) {
  const url = `csv/${file}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  const text = await res.text();

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => resolve(results.data),
      error: reject
    });
  });
}

function renderTable(rows, query, photoIndex) {
  const out = document.getElementById("out");
  if (!rows.length) {
    out.innerHTML = "<p>No rows in this CSV.</p>";
    return;
  }

  const keys = Object.keys(rows[0] || {});
  const q = (query || "").toLowerCase().trim();

  const filtered = !q ? rows : rows.filter(r =>
    keys.some(k => String(r[k] ?? "").toLowerCase().includes(q))
  );

  // Try to find an image column by common names or by content
  const imageKey =
    keys.find(k => ["image", "image_url", "photo", "photo_url", "img", "img_url"].includes(k.toLowerCase())) ||
    keys.find(k => filtered.some(r => isProbablyImageUrl(r[k])));
  const skuKey = findSkuKey(keys);
  const hasPhotoColumn = Boolean(imageKey || (skuKey && photoIndex.size > 0));

  const head = `
    <thead>
      <tr>
        ${hasPhotoColumn ? `<th>Photo</th>` : ""}
        ${keys.map(k => `<th class="${columnClass(k)}">${k}</th>`).join("")}
      </tr>
    </thead>
  `;

  const body = `
    <tbody>
      ${filtered.map(r => `
        <tr>
          ${hasPhotoColumn ? `<td>${(() => {
            const sku = normalizeToken(skuKey ? r[skuKey] : "");
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
    <p class="muted">Showing ${filtered.length} / ${rows.length} products</p>
    <table>${head}${body}</table>
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
  let photoIndex = new Map();
  try {
    [rows, photoIndex] = await Promise.all([loadCsv(file), loadPhotoIndex()]);
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
  renderTable(rows, "", photoIndex);

  input.addEventListener("input", () => renderTable(rows, input.value, photoIndex));
}

main();
