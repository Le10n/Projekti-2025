# Projekti-2025
💰 Financijski Tracker

Interaktivna web aplikacija za praćenje osobnih financija — jednostavna, pregledna i prilagođena svim korisnicima, uključujući starije osobe.
Omogućuje unos prihoda i troškova, automatski izračun salda, vizualne prikaze kroz grafove i jednostavno brisanje ili pregled transakcija po mjesecima.

🧭 Glavne značajke

Mjesečni pregled: Brzi uvid u prihode, troškove i saldo za odabrani mjesec.

Dodavanje transakcija: Jednostavan obrazac za unos prihoda ili troškova s nazivom, kategorijom, iznosom, datumom i bilješkom.

Grafovi:

Kružni graf – potrošnja po kategorijama.

Linijski graf – trend prihoda i troškova kroz mjesece.

Tablica transakcija: Pregled svih unosa uz mogućnost brisanja pojedinih stavki.

Automatsko osvježavanje: Nakon svake promjene (dodavanje, brisanje, promjena mjeseca) svi prikazi se ažuriraju u stvarnom vremenu.

Jednostavno i pristupačno sučelje: Veliki font, jasni gumbi, visok kontrast i intuitivan raspored.

⚙️ Kako aplikacija radi

Po otvaranju se učitavaju podaci za trenutni mjesec.

Novi unos dodaješ putem obrasca (“Nova transakcija”).

Klikom na Spremi aplikacija ažurira tablicu, grafove i sažetke.

Brisanjem stavke ažuriraju se svi prikazi.

Promjenom mjeseca prikazuju se samo transakcije iz tog razdoblja.

🧩 Tehnička logika (DFA model)

Aplikacija koristi jednostavni deterministički konačni automat (DFA) za kontrolu stanja:

IDLE → FORM_EDITING → SUBMITTING → IDLE / ERROR

IDLE → DELETING → SUBMITTING → IDLE
Ovakva struktura osigurava pouzdan rad i brzu reakciju aplikacije bez grešaka.

🔒 Sigurnost i privatnost

Svi podaci ostaju lokalno (nema slanja trećim stranama).

Validacija unosa (iznos mora biti broj, obavezna polja).

Jasne poruke o greškama i mogućnost ponovnog pokušaja.

👵 Dizajnirano i za starije korisnike

Veliki, pregledni gumbi i tekst.

Jasne upute i potvrde (“Jeste li sigurni?”).

Automatski predložen današnji datum pri unosu.

Predefinirane kategorije (Mirovina, Hrana, Režije, Lijekovi, itd.).

🛠️ Tehnologije

HTML, CSS, JavaScript (frontend)

SQLite / lokalna pohrana (backend ili localStorage)

D3.js ili Chart.js za grafove
