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

## Vercel backend storage

For a reliable live admin backend, connect Supabase and add these Vercel environment variables:

```text
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_TABLE=adhuneek_state
ADMIN_PASSWORD=your-secure-admin-password
```

Create this table in Supabase SQL editor:

```sql
create table if not exists adhuneek_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
```

Without Supabase, Vercel uses temporary runtime storage. That is okay for a quick demo, but admin stock/enquiry data can reset after serverless idle/restart.

To change the admin password, run the server with:

```powershell
$env:ADMIN_PASSWORD="your-new-password"; node server.js
```
