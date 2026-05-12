# MetaMind Tech POS (HTML/JS)

This is a modular, offline-first browser POS demo with:
- Products, categories, brands, units
- Customers, suppliers
- POS sale invoices
- Purchase / GRN invoices
- Returns
- Inventory visibility
- Reports summary
- Users, settings, audit logs, backup

## Important
Pure HTML/JavaScript cannot directly use MySQL or SQLite in the browser. This version stores data locally in IndexedDB and is ready to be wired to a backend API or packaged in Electron/Tauri for full desktop/database integration.

## Run
Open `index.html` from a static server or package it in Electron.

Example:
```bash
python -m http.server 8000
```

Then open:
`http://localhost:8000`
