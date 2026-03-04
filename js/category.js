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

function renderTable(rows, query) {
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

  const head = `
    <thead>
      <tr>
        ${imageKey ? `<th>Photo</th>` : ""}
        ${keys.map(k => `<th>${k}</th>`).join("")}
      </tr>
    </thead>
  `;

  const body = `
    <tbody>
      ${filtered.map(r => `
        <tr>
          ${imageKey ? `<td>${isProbablyImageUrl(r[imageKey]) ? `<img class="img" src="${r[imageKey]}" alt="">` : ""}</td>` : ""}
          ${keys.map(k => `<td>${(r[k] ?? "").toString()}</td>`).join("")}
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

  if (!file) {
    titleEl.textContent = "Missing file parameter";
    document.getElementById("out").innerHTML = "<p>Open from the categories page.</p>";
    return;
  }

  titleEl.textContent = titleFromFilename(file);

  let rows = [];
  try {
    rows = await loadCsv(file);
  } catch (e) {
    document.getElementById("out").innerHTML = `<p>${e.message}</p>`;
    return;
  }

  const input = document.getElementById("q");
  renderTable(rows, "");

  input.addEventListener("input", () => renderTable(rows, input.value));
}

main();
