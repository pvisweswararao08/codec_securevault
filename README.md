# SecureVault — Quick Start

## 1. Start the Backend

```powershell
cd c:\CODEC\backend
python app.py
```

Backend runs at → **http://127.0.0.1:5000**

Default admin seeded automatically:
- **Username:** `admin`
- **Password:** `Admin@1234!`

---

## 2. Open the Frontend

Open [[frontend/index.html]((https://securevaultweb.edgeone.app/)) in VS Code with **Live Server** (right-click → Open with Live Server).

Or serve manually:
```powershell
cd c:\CODEC\frontend
python -m http.server 5500
# then open http://127.0.0.1:5500
```

---

## 3. What to try

| Action | How |
|---|---|
| Register a new user | Click "Create Account" tab |
| Create/edit/delete notes | Dashboard page |
| Pin a note | Hover a note → 📌 icon |
| Admin panel | Login as `admin` → click 🛡️ Admin in navbar |
| See lockout | Enter wrong password 5× |
| Token revocation | Log out, try old token in DevTools |
| SQL injection test | Type `' OR 1=1 --` as username → blocked |

---

## Security Architecture

```
Browser ──JWT──► Flask API
                    │
                    ├── bcrypt password hashing (cost 12)
                    ├── JWT access (15 min) + refresh (7 days)
                    ├── Token blocklist on logout
                    ├── 5-attempt lockout (15 min)
                    ├── SQLAlchemy ORM (parameterized queries)
                    ├── Marshmallow input validation
                    ├── HTML escaping (XSS prevention)
                    ├── CSP + security headers
                    ├── Rate limiting (10 req/min on auth)
                    └── RBAC (user / admin roles)
```
