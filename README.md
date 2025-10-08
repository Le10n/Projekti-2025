# Financijski tracker

Sve-u-jednom aplikacija za kućne, obiteljske i poslovne financije. Sustav je prilagođen desktopu, s trajnim sidebarom, velikim fontom i jasnim koracima prilagođenima starijim korisnicima.

## Glavne značajke

- **Korisnički računi** – registracija s tipovima računa (osobni, obiteljski, poslovni), prijava, profil i mogućnost trajnog brisanja podataka.
- **Mjesečni budžet** – unos budžeta po mjesecu, vizualna traka potrošnje i upozorenje ako je budžet premašen.
- **Transakcije** – ručni unos prihoda i troškova, filteri (datum od/do, kategorija, tip), kalendarski pregled i tablica s brisanjem.
- **Grafovi** – padajući izbornik s Pie / Line / Bar prikazom na temelju kategorija i mjesečnog trenda prihoda/troškova.
- **Izvještaj (A4 / PDF)** – strukturirani mjesečni izvadak s izdavateljem/primateljem, sažetkom i stavkama spreman za `Print to PDF`.
- **Budžeti, ponavljanja i backup** – budžet po mjesecu, ponavljajuće stavke (1.–28. u mjesecu), gumb “Primijeni ponavljajuće” te sigurnosne kopije SQLite baze.

## Tehnologije

- **Frontend**: čisti HTML/CSS/JS + Chart.js
- **Backend**: Node.js (Express) + SQLite (better-sqlite3), JSON Web Token autentikacija, bcryptjs hashiranje lozinki

## Pokretanje

```bash
npm install
npm start
```

Server pokreće Express API na `http://localhost:3000/`. Staticki HTML/CSS/JS služe se npr. preko `live-server` ili bilo kojeg statičkog servera. Frontend očekuje da se API nalazi na istom porijeklu (koristite npr. `npm start` u pozadini i otvorite `index.html` kroz dev server).

## Ključni API endpointi

- `POST /auth/register`, `POST /auth/login`
- `GET/PUT/DELETE /me`
- `GET /api/transactions` (query: `month`, `from`, `to`, `category`, `type`), `POST /api/transactions`, `DELETE /api/transactions/:id`
- `GET/PUT /api/budgets/:month`
- `GET /api/analytics/summary?month=YYYY-MM`
- `GET /api/analytics/trend?months=N`
- `GET/POST /api/recurring`, `PUT /api/recurring/:id`, `POST /api/recurring/apply`
- `GET/POST /api/backups`

Sve mutirajuće rute zahtijevaju JWT (`Authorization: Bearer …`).

## Print / PDF

Stranica **Izvještaj** koristi `window.print()` i prilagođene `@media print` stilove (A4 margine 20 mm, skriven sidebar i alati) tako da korisnik kroz “Ispiši / PDF” dobije uredan mjesečni izvadak.
