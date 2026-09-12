# 🏥 Farmacia Moldova

Aplicație Full-Stack pentru o farmacie din Republica Moldova.

## 🚀 Funcționalități

- **Pagina principală** — Lista de produse cu prețuri în MDL, imagini, statusul stocului
- **Panou de administrare** (`/admin`) — Protejat cu parolă, CRUD complet pentru produse
- **API REST** — Autentificare JWT, CRUD produse
- **Bază de date** — SQLite (local) / PostgreSQL (producție)
- **Design modern** — Dark theme, responsive, micro-animații

## 📁 Structura proiectului

```
farmacia-moldova/
├── server.js           # Server Express principal
├── database.js         # Abstractizare bază de date (SQLite / PostgreSQL)
├── package.json        # Dependențe și scripturi
├── .env                # Variabile de mediu (local)
├── .env.example        # Template variabile de mediu
├── .gitignore          # Fișiere ignorate de Git
├── README.md           # Acest fișier
└── public/             # Front-End
    ├── index.html      # Pagina principală
    ├── admin.html      # Panou de administrare
    ├── css/
    │   ├── style.css   # Stiluri principale
    │   └── admin.css   # Stiluri admin
    └── js/
        ├── app.js      # JavaScript pagina principală
        └── admin.js    # JavaScript panou admin
```

## ⚡ Instalare și rulare locală

```bash
# 1. Clonează repository-ul
git clone https://github.com/USERNAME/farmacia-moldova.git
cd farmacia-moldova

# 2. Instalează dependențele
npm install

# 3. Copiază și configurează .env
cp .env.example .env
# Editează .env cu parola dorită

# 4. Pornește serverul
npm start
```

Serverul va porni pe `http://localhost:3000`

**Panou admin:** `http://localhost:3000/admin`
**Utilizator implicit:** `admin`
**Parola implicită:** `Cojocaru1234`

## 🌐 Deploy pe Render.com & Baza de date PostgreSQL (Supabase / Render)

1. Creează un cont pe [Render.com](https://render.com)
2. Conectează repository-ul GitHub
3. Creează un **Web Service** cu următoarele setări:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Adaugă **Environment Variables**:
   - `ADMIN_PASSWORD` — parola de administrator
   - `JWT_SECRET` — un string secret aleator lung
   - `DATABASE_URL` — șirul de conexiune PostgreSQL (din Supabase: *Project Settings* → *Database* → *Connection string* (URI) sau din Render PostgreSQL)
5. **Inițializare automată**: La pornire, serverul detectează `DATABASE_URL`, se conectează prin pachetul `pg` cu suport SSL și creează/migrează automat tabelele `products`, `admins` și `orders`, populându-le inițial dacă sunt goale.

## 🔒 API Endpoints

### Publice
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/api/products` | Lista tuturor produselor |
| GET | `/api/products/:id` | Detalii produs |
| POST | `/api/orders` | Plasare comandă nouă |

### Autentificare
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| POST | `/api/login` | Autentificare admin (body: `{ password }`) |
| GET | `/api/admin/verify` | Verificare validitate token JWT |

### Admin (necesită token JWT)
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/api/admin/stats` | Statistici dashboard (produse, comenzi noi, stoc critic, stoc 0) |
| POST | `/api/admin/products` | Adaugă produs nou (cu preț vechi și status rețetă) |
| PUT | `/api/admin/products/:id` | Actualizează produs complet |
| PATCH | `/api/admin/products/:id/stock` | Modifică numeric stocul |
| PATCH | `/api/admin/products/:id/toggle-stock` | Comutare rapidă În Stoc / Fără Stoc |
| DELETE | `/api/admin/products/:id` | Șterge produs |
| GET | `/api/admin/orders` | Lista tuturor comenzilor primite |
| PATCH | `/api/admin/orders/:id/status` | Actualizează status comandă (Nouă, În procesare, Trimisă, Finalizată, Anulată) |
| DELETE | `/api/admin/orders/:id` | Șterge comandă |

## 📄 Licență

MIT License — © 2026 Farmacia Moldova
