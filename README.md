# Adhuneek Website

Modern customer website plus stock/admin backend for Adhuneek plastic household products.

## Run

```powershell
node server.js
```

Open:

- Website: `http://localhost:4173`
- Admin backend: `http://localhost:4173/admin.html`

Default admin password:

```text
adhuneek2026
```

## What is included

- Customer website with product filters, catalog download and enquiry form.
- Admin backend for products, stock alerts, customer enquiries and CSV export.
- Local JSON database in `data.json`.
- Product images and catalog PDF extracted from the supplied Adhuneek catalog.

To change the admin password, run the server with:

```powershell
$env:ADMIN_PASSWORD="your-new-password"; node server.js
```
