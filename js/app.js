function titleFromFilename(name) {
  // Example: PriceList_2026_Side_beds_2-in-1.csv -> Side beds 2-in-1
  let t = name.replace(/^PriceList_\d{4}_/i, "").replace(/\.csv$/i, "");
  t = t.replace(/_/g, " ").trim();
  return t;
}

async function main() {
  const menuEl = document.getElementById("menu");

  const res = await fetch("csv/manifest.json", { cache: "no-store" });
  if (!res.ok) {
    menuEl.innerHTML = `<p>Could not load <code>csv/manifest.json</code>. (${res.status})</p>`;
    return;
  }

  const data = await res.json();
  const files = data.files || [];

  if (!files.length) {
    menuEl.innerHTML = `<p>No CSV files found in <code>/csv</code>.</p>`;
    return;
  }

  menuEl.innerHTML = files.map(f => {
    const title = titleFromFilename(f);
    const href = `category.html?file=${encodeURIComponent(f)}`;
    return `
      <a class="card" href="${href}">
        <div style="font-weight:700">${title}</div>
      </a>
    `;
  }).join("");
}

main();
