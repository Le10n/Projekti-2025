# Financijski tracker

Jednostavna web aplikacija za praćenje prihoda i troškova koja radi u potpunosti na klijentu. Sve se čuva u `localStorage` preglednika pa je aplikacija spremna odmah nakon otvaranja `index.html` datoteke.

## Pokretanje

1. Otvorite datoteku `index.html` u pregledniku (Chrome, Edge ili Firefox).
2. Pri prvom pokretanju odaberite mjesec u gornjem desnom kutu; automatski je postavljen trenutni mjesec.
3. Dodajte novu transakciju kroz obrazac „Nova transakcija”.

## Ključne značajke

- **Sažeci** – kartice s ukupnim prihodima, troškovima i saldom za odabrani mjesec.
- **Grafovi** – kružni graf prikazuje troškove po kategorijama, a linijski graf uspoređuje prihode i troškove po mjesecima.
- **Transakcije** – tablica s popisom stavki za odabrani mjesec. Svaka stavka može se obrisati uz potvrdu.
- **Lokalna pohrana** – sve se trajno sprema u preglednik; nema slanja podataka na poslužitelj.
- **Upotrebljivost za starije** – veliki fontovi, jasni gumbi, visoki kontrast i čitljive poruke za pogreške.

## Pravila unosa

- Obavezna su polja: Tip (Prihod/Trošak), Naziv, Kategorija, Iznos, Datum.
- Iznos mora biti pozitivan broj (npr. `25.00`).
- Datum mora biti u obliku `YYYY-MM-DD`.
- U slučaju greške prikazuje se jasna poruka “Spremanje nije uspjelo. Pokušajte ponovno.”

## Resetiranje podataka

Ako želite krenuti ispočetka, otvorite konzolu preglednika i obrišite stavke `localStorage.removeItem('ft_transactions')`.

## Tehnologije

- [Chart.js](https://www.chartjs.org/) za grafove.
- Čisti HTML, CSS i JavaScript bez dodatnih biblioteka.
