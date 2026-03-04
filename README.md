# Price List (CSV → GitHub Pages)

This is a lightweight static site that:
- auto-creates a **menu** from every CSV in `/csv`
- lets you **drill down** to a category page that lists all products in that CSV
- supports inline photos from CSV URLs and local SKU-matched files in `/photos`

## Repo structure

```
index.html
category.html
/js
  app.js
  category.js
/csv
  *.csv
  manifest.json
/photos
  manifest.json
  *.jpg|*.jpeg|*.png|*.webp
/i18n
  en.json
  it.json
  menu_en.json
  menu_it.json
/.github/workflows
  generate-manifest.yml
```

## How it works

- `index.html` loads `csv/manifest.json` and creates one card/menu item per CSV file.
- `category.html?file=<csvfilename>` loads the selected CSV and renders it as a table with search.
- A GitHub Action regenerates `csv/manifest.json` on every push that changes `/csv/*.csv`.

## Add photos (optional)

You can use one or both methods below.

### Method 1: Local photo folder matched by SKU

Add a column in your CSV named one of:
- `ARTICLE NUMBER (SKU)` (already in your files)
- any column containing `sku`

Place photos in `/photos` and list them in `photos/manifest.json`.

Filename rule:
- If SKU is `ABC123`, these all match: `ABC123.jpg`, `ABC123_1.jpg`, `ABC123-front.png`, `ABC123-blue.webp`
- Matching uses filename stem and "stem before suffix" (text before final `_...` or `-...`)

Example `photos/manifest.json`:
```json
{
  "files": [
    "ABC123.jpg",
    "ABC123_1.jpg",
    "XYZ999-front.webp"
  ]
}
```

### Method 2: Image URL in CSV

Add a column named one of:
- `image_url` (recommended)
- `photo_url`, `img_url`, etc.

Put a full URL in that column. Example:
- `https://raw.githubusercontent.com/<USER>/<REPO>/main/images/SKU123.jpg`

## SKU language files

- Category pages support SKU-based translations for `PRODUCT NAME` and `DESCRIPTION`.
- Files:
  - `i18n/en.json`
  - `i18n/it.json`
- Structure:
  - `products.<SKU>.name`
  - `products.<SKU>.description`
- Language can be changed from the category page selector (English / Italiano).
- Menu labels are translated from:
  - `i18n/menu_en.json`
  - `i18n/menu_it.json`

## Local run

Because browsers restrict file access, use a simple local server:

**Python**
```bash
python -m http.server 8080
```

Then open: http://localhost:8080

## Publish to GitHub Pages

1. Create a new GitHub repository (public recommended for simple hosting).
2. Push this folder contents to the repo (instructions below).
3. Enable Pages:
   - GitHub → **Settings** → **Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** and folder: **/(root)**
4. Your site will appear at:
   - `https://<USER>.github.io/<REPO>/`

## Push to GitHub (step-by-step)

From inside this folder:

```bash
git init
git add .
git commit -m "Initial price list site"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

After pushing:
- The workflow will run and keep `csv/manifest.json` updated when CSVs change.
- If you rename/add/remove CSV files under `/csv`, just commit + push — the menu updates.

## Common issues

- **Menu is empty**: check that `/csv/manifest.json` exists in the repo and that CSV files are in `/csv`.
- **CSV not loading**: make sure you’re using GitHub Pages (not opening the HTML directly from disk) or run a local server.
- **Images not displaying**:
  - If using local `/photos`, check `photos/manifest.json` includes the file and filename matches SKU.
  - If using URL columns, ensure URLs are reachable publicly.
