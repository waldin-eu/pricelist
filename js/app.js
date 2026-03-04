function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function setParam(name, value) {
  const url = new URL(window.location.href);
  if (!value) {
    url.searchParams.delete(name);
  } else {
    url.searchParams.set(name, value);
  }
  window.history.replaceState({}, "", url.toString());
}

function titleFromFilename(name) {
  let t = name.replace(/^PriceList_\d{4}_/i, "").replace(/\.csv$/i, "");
  return t.replace(/_/g, " ").trim();
}

async function loadMenuTranslations(lang) {
  try {
    const res = await fetch(`i18n/menu_${lang}.json`, { cache: "no-store" });
    if (!res.ok) return {};
    const data = await res.json();
    if (!data || typeof data.labels !== "object") return {};
    return data.labels;
  } catch (_) {
    return {};
  }
}

async function main() {
  const langEl = document.getElementById("lang");
  const lang = getParam("lang") || "en";
  const menuEl = document.getElementById("menu");
  langEl.value = lang;

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

  let labels = await loadMenuTranslations(langEl.value || "en");

  const render = () => {
    const currentLang = langEl.value || "en";
    menuEl.innerHTML = files.map(f => {
      const title = labels[f] || titleFromFilename(f);
      const href = `category.html?file=${encodeURIComponent(f)}&lang=${encodeURIComponent(currentLang)}`;
      return `
        <a class="menu-card" href="${href}">
          <div class="menu-title">${title}</div>
        </a>
      `;
    }).join("");
  };

  render();
  langEl.addEventListener("change", async () => {
    const currentLang = langEl.value || "en";
    setParam("lang", currentLang);
    labels = await loadMenuTranslations(currentLang);
    render();
  });
}

main();
