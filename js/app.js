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
  const langButtons = Array.from(document.querySelectorAll(".lang-flag[data-lang]"));
  let currentLang = getParam("lang") || "en";
  const menuEl = document.getElementById("menu");
  const setActiveLang = (lang) => {
    langButtons.forEach((btn) => {
      const active = btn.dataset.lang === lang;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };
  setActiveLang(currentLang);

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

  let labels = await loadMenuTranslations(currentLang);

  const render = () => {
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
  langButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nextLang = btn.dataset.lang || "en";
      if (nextLang === currentLang) return;
      currentLang = nextLang;
      setParam("lang", currentLang);
      setActiveLang(currentLang);
      labels = await loadMenuTranslations(currentLang);
      render();
    });
  });
}

main();
