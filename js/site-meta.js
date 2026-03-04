(async function renderSiteMeta() {
  const year = new Date().getFullYear();
  const copyrightEl = document.createElement("div");
  copyrightEl.className = "site-copyright";
  copyrightEl.textContent = `© ${year} Waldin Baby Collection. All rights reserved.`;

  const versionEl = document.createElement("div");
  versionEl.className = "site-version";
  versionEl.textContent = "v?.?.?";

  try {
    const res = await fetch("version.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.version) {
        versionEl.textContent = `v${data.version}`;
      }
    }
  } catch (_) {
    // Keep fallback version label if version file cannot be loaded.
  }

  document.body.appendChild(copyrightEl);
  document.body.appendChild(versionEl);
})();
