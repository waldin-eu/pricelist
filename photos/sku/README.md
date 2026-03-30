# SKU Photos Directory

This folder stores product photos organized by SKU.

## Structure

```
photos/
└── sku/
    ├── w5n.jpg
    ├── w5w.jpg
    ├── w7n.jpg
    └── ... (one image per SKU)
```

## How to Add Photos

1. **Admin Panel**: In the admin interface, when you upload a photo for a SKU, it creates a reference to `photos/sku/{SKU}.jpg`

2. **Local Management**: 
   - Save/export images from the admin panel (if needed)
   - Name them according to the SKU (normalized to lowercase)
   - Place them in this `photos/sku/` folder
   - Commit to git

3. **Accessible to Everyone**:
   - Once committed to git and deployed, these photos are visible to all users viewing the pricelist
   - Photos are served as static files from this directory

## File Format

- **Format**: JPG images
- **Naming**: `{sku}.jpg` (lowercase, normalized SKU name)
- **Examples**: `w5n.jpg`, `w5w.jpg`, `w7n-1.jpg`

## Notes

- Images in this folder are publicly accessible
- Keep image sizes reasonable for web (< 500 KB recommended)
- Backup important images before committing
