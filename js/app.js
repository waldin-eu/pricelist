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

function titleFromFilename(name, lang) {
  let t = name.replace(/^PriceList_\d{4}_/i, "").replace(/\.csv$/i, "");
  t = t.replace(/_/g, " ").trim();

  const key = t.toLowerCase();
  const map = {
    en: {
      "sleepbag": "Sleeping Bags",
      "7-in-1 baby beds with accessori": "7-in-1 Baby Beds With Accessories",
      "5-in-1 baby beds": "5-in-1 Baby Beds",
      "side beds 2-in-1": "Side Beds 2-in-1",
      "bamboo duvets with filling": "Bamboo Duvets With Filling",
      "cotton duvets with filling": "Cotton Duvets With Filling",
      "moses baskets": "Moses Baskets",
      "dresser": "Dresser",
      "playpen": "Playpen"
    },
    it: {
      "sleepbag": "Sacchi Nanna",
      "7-in-1 baby beds with accessori": "Lettini 7-in-1 Con Accessori",
      "5-in-1 baby beds": "Lettini 5-in-1",
      "side beds 2-in-1": "Lettini Affiancabili 2-in-1",
      "bamboo duvets with filling": "Piumoni In Bambu Con Imbottitura",
      "cotton duvets with filling": "Piumoni In Cotone Con Imbottitura",
      "moses baskets": "Ceste Di Mose",
      "dresser": "Cassettiera",
      "playpen": "Box"
    }
  };

  return (map[lang] && map[lang][key]) || (map.en[key]) || t;
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

  const render = () => {
    const currentLang = langEl.value || "en";
    menuEl.innerHTML = files.map(f => {
      const title = titleFromFilename(f, currentLang);
      const href = `category.html?file=${encodeURIComponent(f)}&lang=${encodeURIComponent(currentLang)}`;
      return `
        <a class="menu-card" href="${href}">
          <div class="menu-title">${title}</div>
        </a>
      `;
    }).join("");
  };

  render();
  langEl.addEventListener("change", () => {
    const currentLang = langEl.value || "en";
    setParam("lang", currentLang);
    render();
  });
}

main();
