# Financijski tracker (lokalna verzija)

Ovo je jednostrana (SPA) aplikacija namijenjena praćenju osobnih, obiteljskih ili poslovnih financija bez poslužitelja. Svi se podaci spremaju lokalno u preglednik i mogu se izvesti u JSON datoteku za sigurnosnu kopiju ili prijenos na drugi uređaj.

## Pokretanje

1. Klonirajte repozitorij.
2. Pokrenite bilo koji statički poslužitelj (npr. `npx serve -s .`) **ili** otvorite `index.html` izravno u pregledniku.
3. Aplikacija se izvršava u potpunosti na strani klijenta.

## Registracija i prijava

- Registracija kreira račun s tipom (osobni, obiteljski, poslovni), osobnim podacima i PIN-om (točno 4 znamenke).
- PIN se ne sprema u čistom obliku; aplikacija generira slučajni salt i hash (SHA-256) pomoću Web Crypto API-ja.
- Nakon registracije račun se sprema u `localStorage` i automatski se preuzima JSON datoteka oblika `ft-account-<uuid>.json`. Datoteku je potrebno čuvati na sigurnom mjestu.
- Prijava je moguća na dva načina:
  - Odabirom računa spremljenog na računalu + unos PIN-a.
  - Uvozom JSON datoteke i unosom PIN-a (račun se ponovno sprema lokalno).
- Moguće je obrisati lokalnu kopiju računa te ponovno uvesti datoteku kad je potrebno.

## Glavne funkcionalnosti

### Navigacija

- Stalni lijevi sidebar s tabovima: Početna, Nova stavka, Povijest, Izvještaj, Postavke.
- Gornja alatna traka s tipkom za preuzimanje sigurnosne kopije i korisničkim izbornikom (profil, odjava, brisanje podataka).

### Početna

- Odabir mjeseca i unos budžeta s praćenjem potrošnje.
- Kartice s ukupnim prihodima, troškovima i saldom.
- Odabir tipa grafa (kružni, linijski, stupčasti) za pregled kategorija ili trendova (Chart.js).
- Popis transakcija za odabrani mjesec i mogućnost brisanja stavki.

### Nova stavka

- Ručni unos transakcija (tip, naziv, kategorija, iznos, datum, bilješka).
- Kategorije se mogu proširivati u postavkama; iznos se validira na pozitivni broj.

### Povijest

- Filtri po rasponu datuma, kategoriji i tipu.
- Jednostavni kalendar s naglašenim danima na kojima postoje prihodi ili troškovi (klik postavlja filter na odabrani dan).
- Tablica filtriranih stavki.

### Izvještaj

- A4 prikaz mjesečnog izvatka/računa s podacima o izdavatelju i primatelju.
- Tablica sažetaka i popis svih stavki u razdoblju.
- Gumb “Ispiši / PDF” koristi `window.print()` i posebno definirane print stilove.

### Postavke

- Upravljanje kategorijama i osnovnim postavkama (valuta, spremanje slika).
- Gumb “Preuzmi kopiju” uvijek preuzima najnoviju verziju JSON datoteke.

### Profil i sigurnost

- Profilni panel (dostupan iz korisničke ikonice) za izmjenu osobnih podataka i naziva računa.
- Provjera dobi (≥16 godina) prilikom registracije i uređivanja profila.
- Potvrda za brisanje svih podataka zahtijeva unos riječi “OBRIŠI”.

## Struktura JSON datoteke

```json
{
  "meta": {
    "version": "1.0",
    "created_at": "2025-10-08T12:00:00Z",
    "id": "uuid-v4"
  },
  "account": {
    "type": "personal",
    "name": "Ana Anić"
  },
  "user": {
    "first_name": "Ana",
    "last_name": "Anić",
    "email": "ana@example.com",
    "dob": "1990-03-12",
    "address": "Ulica 1, Rovinj"
  },
  "auth": {
    "pin_salt": "base64",
    "pin_hash": "base64"
  },
  "settings": {
    "save_images": false,
    "currency": "EUR",
    "categories": ["Mirovina", "Plaća", "Hrana", "Režije"]
  },
  "statementProfile": {
    "issuerName": "Financijski tracker",
    "issuerAddress": "",
    "issuerOib": "",
    "recipientName": "",
    "recipientAddress": "",
    "place": "Rovinj"
  },
  "budgets": [
    { "month": "2025-10", "amount": 800 }
  ],
  "transactions": [
    { "id": "t1", "date": "2025-10-05", "type": "income", "title": "Mirovina", "category": "Mirovina", "amount": 650 },
    { "id": "t2", "date": "2025-10-06", "type": "expense", "title": "HEP - Struja", "category": "Režije", "amount": 55 }
  ]
}
```

## Backup i prijenos

- Za izvoz podataka koristite gumb “Preuzmi kopiju” u gornjoj alatnoj traci ili u Postavkama.
- Za prijenos na drugo računalo otvorite aplikaciju, odaberite “Prijava pomoću datoteke”, učitajte JSON i unesite PIN.
- Gubitak i datoteke i lokalnih podataka znači gubitak svih informacija, stoga korisnicima naglasite važnost sigurnosnih kopija.

## Licenca

Projekt je namijenjen edukativnim scenarijima i može se slobodno prilagoditi vlastitim potrebama.
