import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import { db, backupDatabase, listBackups } from './db.js';
import { makeJwt, authMiddleware } from './auth.js';

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '..');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/backups', express.static('backups'));

app.get('/', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'styles.css'));
});

app.get('/app.js', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'app.js'));
});

function ensureAdult(dob) {
  if (!dob) return true;
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return age >= 16;
}

function validateEmail(email) {
  return /.+@.+\..+/.test(email);
}

function normaliseNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return num;
}

app.post('/auth/register', async (req, res) => {
  try {
    const { accountType, email, password, personal = {}, family = {}, business = {} } = req.body;
    if (!['personal', 'family', 'business'].includes(accountType)) {
      return res.status(400).json({ error: 'Bad accountType' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Neispravan e-mail.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Lozinka mora imati najmanje 8 znakova.' });
    }

    const ownerPersonal = personal || {};
    if (!ensureAdult(ownerPersonal.dob)) {
      return res.status(400).json({ error: 'Korisnici mlađi od 16 godina ne mogu koristiti aplikaciju.' });
    }

    let accountName = '';
    if (accountType === 'personal') {
      const { firstName, lastName, dob, address } = ownerPersonal;
      if (!firstName || !lastName || !dob) {
        return res.status(400).json({ error: 'Molimo unesite ime, prezime i datum rođenja.' });
      }
      if (!ensureAdult(dob)) {
        return res.status(400).json({ error: 'Korisnici mlađi od 16 godina ne mogu koristiti aplikaciju.' });
      }
      accountName = `${firstName} ${lastName}`.trim();
    }
    if (accountType === 'family') {
      if (!family.householdName) {
        return res.status(400).json({ error: 'Unesite naziv kućanstva.' });
      }
      accountName = family.householdName.trim();
    }
    if (accountType === 'business') {
      if (!business.companyName) {
        return res.status(400).json({ error: 'Unesite naziv tvrtke.' });
      }
      accountName = business.companyName.trim();
    }

    const now = new Date().toISOString();
    const hash = await bcrypt.hash(password, 12);

    const transaction = db.transaction(() => {
      const account = db
        .prepare('INSERT INTO accounts (type, name, created_at) VALUES (?,?,?)')
        .run(accountType, accountName, now);

      const owner = db
        .prepare(
          `INSERT INTO users (account_id, email, password_hash, role, first_name, last_name, dob, address, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(
          account.lastInsertRowid,
          email,
          hash,
          'owner',
          ownerPersonal.firstName || null,
          ownerPersonal.lastName || null,
          ownerPersonal.dob || null,
          ownerPersonal.address || null,
          now
        );

      if (accountType === 'business') {
        db.prepare(
          `INSERT INTO business_details (account_id, oib, headquarters, iban, vat_payer, contact_person)
           VALUES (?,?,?,?,?,?)`
        ).run(
          account.lastInsertRowid,
          business.oib || null,
          business.headquarters || null,
          business.iban || null,
          business.vatPayer ? 1 : 0,
          business.contactPerson || null
        );
      }

      return { accountId: account.lastInsertRowid, userId: owner.lastInsertRowid };
    });

    const { accountId, userId } = transaction();
    const token = makeJwt({ user_id: userId, account_id: accountId, account_type: accountType });
    res.json({ ok: true, token });
  } catch (error) {
    if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'E-mail je već registriran.' });
    }
    console.error('Register error', error);
    res.status(500).json({ error: 'Ne možemo vas trenutno registrirati.' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Neispravan e-mail.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Neispravni podaci' });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Neispravni podaci' });
  }
  const account = db.prepare('SELECT type FROM accounts WHERE id=?').get(user.account_id);
  const token = makeJwt({ user_id: user.id, account_id: user.account_id, account_type: account?.type });
  res.json({ ok: true, token });
});

app.get('/me', authMiddleware, (req, res) => {
  const user = db
    .prepare('SELECT id, email, first_name, last_name, dob, address, account_id FROM users WHERE id=?')
    .get(req.user.user_id);
  if (!user) {
    return res.status(404).json({ error: 'Korisnik nije pronađen.' });
  }
  const account = db.prepare('SELECT id, type, name FROM accounts WHERE id=?').get(user.account_id);
  const business = account?.type === 'business'
    ? db
        .prepare('SELECT oib, headquarters, iban, vat_payer AS vatPayer, contact_person AS contactPerson FROM business_details WHERE account_id=?')
        .get(account.id)
    : null;
  res.json({ user, account, business });
});

app.put('/me', authMiddleware, (req, res) => {
  const { first_name, last_name, dob, address } = req.body;
  if (dob && !ensureAdult(dob)) {
    return res.status(400).json({ error: 'Korisnici mlađi od 16 godina ne mogu koristiti aplikaciju.' });
  }
  db.prepare('UPDATE users SET first_name=?, last_name=?, dob=?, address=? WHERE id=?').run(
    first_name || null,
    last_name || null,
    dob || null,
    address || null,
    req.user.user_id
  );
  res.json({ ok: true });
});

app.delete('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT role, account_id FROM users WHERE id=?').get(req.user.user_id);
  if (!user) {
    return res.status(404).json({ error: 'Korisnik nije pronađen.' });
  }
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Samo vlasnik može obrisati račun i podatke.' });
  }
  db.prepare('DELETE FROM accounts WHERE id=?').run(user.account_id);
  res.json({ ok: true });
});

app.get('/api/transactions', authMiddleware, (req, res) => {
  const { month, from, to, category, type } = req.query;
  let sql = 'SELECT id, type, title, category, amount, date, note FROM transactions WHERE account_id=?';
  const params = [req.user.account_id];
  if (month) {
    sql += ' AND date LIKE ?';
    params.push(`${month}%`);
  }
  if (from) {
    sql += ' AND date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND date <= ?';
    params.push(to);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (type && ['income', 'expense'].includes(type)) {
    sql += ' AND type = ?';
    params.push(type);
  }
  sql += ' ORDER BY date ASC, created_at ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.post('/api/transactions', authMiddleware, (req, res) => {
  const { type, title, category, amount, date, note } = req.body;
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'Odaberite Tip (prihod ili trošak).' });
  }
  if (!title || !category || !date) {
    return res.status(400).json({ error: 'Naziv, kategorija i datum su obavezni.' });
  }
  const numericAmount = normaliseNumber(amount);
  if (numericAmount === null) {
    return res.status(400).json({ error: 'Iznos mora biti nenegativan broj.' });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO transactions (id, account_id, type, title, category, amount, date, note, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    req.user.account_id,
    type,
    title,
    category,
    numericAmount,
    date,
    note || null,
    now,
    now
  );
  res.status(201).json({ id, type, title, category, amount: numericAmount, date, note: note || null });
});

app.delete('/api/transactions/:id', authMiddleware, (req, res) => {
  const { changes } = db
    .prepare('DELETE FROM transactions WHERE id=? AND account_id=?')
    .run(req.params.id, req.user.account_id);
  if (!changes) {
    return res.status(404).json({ error: 'Stavka nije pronađena.' });
  }
  res.json({ ok: true });
});

app.get('/api/budgets/:month', authMiddleware, (req, res) => {
  const row = db
    .prepare('SELECT amount FROM budgets WHERE account_id=? AND month=?')
    .get(req.user.account_id, req.params.month);
  res.json({ amount: row?.amount ?? 0 });
});

app.put('/api/budgets/:month', authMiddleware, (req, res) => {
  const amt = normaliseNumber(req.body.amount);
  if (amt === null) {
    return res.status(400).json({ error: 'Bad amount' });
  }
  db.prepare(
    `INSERT INTO budgets (account_id, month, amount) VALUES (?,?,?)
     ON CONFLICT(account_id, month) DO UPDATE SET amount=excluded.amount`
  ).run(req.user.account_id, req.params.month, amt);
  res.json({ ok: true, amount: amt });
});

app.get('/api/analytics/summary', authMiddleware, (req, res) => {
  const { month } = req.query;
  if (!month) {
    return res.status(400).json({ error: 'Nedostaje parametar mjeseca.' });
  }
  const rows = db
    .prepare(
      `SELECT type, category, amount FROM transactions WHERE account_id=? AND date LIKE ?`
    )
    .all(req.user.account_id, `${month}%`);
  let income = 0;
  let expense = 0;
  const categoryMap = new Map();
  rows.forEach((row) => {
    if (row.type === 'income') {
      income += row.amount;
    } else if (row.type === 'expense') {
      expense += row.amount;
      const key = row.category || 'Ostalo';
      categoryMap.set(key, (categoryMap.get(key) || 0) + row.amount);
    }
  });
  const categories = Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value }));
  const budgetRow = db
    .prepare('SELECT amount FROM budgets WHERE account_id=? AND month=?')
    .get(req.user.account_id, month);
  res.json({
    income,
    expense,
    balance: income - expense,
    categories,
    budget: budgetRow?.amount ?? 0,
  });
});

app.get('/api/analytics/trend', authMiddleware, (req, res) => {
  const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
  const rows = db
    .prepare(
      `SELECT substr(date,1,7) AS ym,
              SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
              SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
       FROM transactions
       WHERE account_id=?
       GROUP BY ym
       ORDER BY ym DESC
       LIMIT ?`
    )
    .all(req.user.account_id, months);
  const ordered = rows.sort((a, b) => (a.ym > b.ym ? 1 : -1));
  res.json(ordered);
});

app.get('/api/recurring', authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, category, type, amount, day_of_month AS dayOfMonth, note, active
       FROM recurring WHERE account_id=? ORDER BY title ASC`
    )
    .all(req.user.account_id);
  res.json(rows);
});

app.post('/api/recurring', authMiddleware, (req, res) => {
  const { title, category, type, amount, dayOfMonth, note } = req.body;
  if (!title || !category) {
    return res.status(400).json({ error: 'Naziv i kategorija su obavezni.' });
  }
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'Odaberite tip.' });
  }
  const numericAmount = normaliseNumber(amount);
  if (numericAmount === null) {
    return res.status(400).json({ error: 'Iznos mora biti nenegativan broj.' });
  }
  const day = Number(dayOfMonth);
  if (!Number.isInteger(day) || day < 1 || day > 28) {
    return res.status(400).json({ error: 'Dan u mjesecu treba biti između 1 i 28.' });
  }
  const now = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO recurring (account_id, title, category, type, amount, day_of_month, note, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(req.user.account_id, title, category, type, numericAmount, day, note || null, 1, now, now);
  res.status(201).json({
    id: lastInsertRowid,
    title,
    category,
    type,
    amount: numericAmount,
    dayOfMonth: day,
    note: note || null,
    active: 1,
  });
});

app.put('/api/recurring/:id', authMiddleware, (req, res) => {
  const { title, category, type, amount, dayOfMonth, note, active } = req.body;
  const numericAmount = normaliseNumber(amount);
  if (numericAmount === null) {
    return res.status(400).json({ error: 'Iznos mora biti nenegativan.' });
  }
  const day = Number(dayOfMonth);
  if (!Number.isInteger(day) || day < 1 || day > 28) {
    return res.status(400).json({ error: 'Dan u mjesecu treba biti između 1 i 28.' });
  }
  const activeFlag = active ? 1 : 0;
  const { changes } = db
    .prepare(
      `UPDATE recurring
       SET title=?, category=?, type=?, amount=?, day_of_month=?, note=?, active=?, updated_at=?
       WHERE id=? AND account_id=?`
    )
    .run(
      title,
      category,
      type,
      numericAmount,
      day,
      note || null,
      activeFlag,
      new Date().toISOString(),
      req.params.id,
      req.user.account_id
    );
  if (!changes) {
    return res.status(404).json({ error: 'Ponavljanje nije pronađeno.' });
  }
  res.json({ ok: true });
});

app.post('/api/recurring/apply', authMiddleware, (req, res) => {
  const { month } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Nedostaje mjesec (YYYY-MM).' });
  }
  const recurrences = db
    .prepare('SELECT * FROM recurring WHERE account_id=? AND active=1')
    .all(req.user.account_id);
  const now = new Date().toISOString();
  const inserted = [];
  const insertStmt = db.prepare(
    `INSERT INTO transactions (id, account_id, type, title, category, amount, date, note, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  const tx = db.transaction(() => {
    recurrences.forEach((item) => {
      const day = String(item.day_of_month).padStart(2, '0');
      const date = `${month}-${day}`;
      const id = crypto.randomUUID();
      insertStmt.run(
        id,
        req.user.account_id,
        item.type,
        item.title,
        item.category,
        item.amount,
        date,
        item.note || 'Ponavljajuća stavka',
        now,
        now
      );
      inserted.push({
        id,
        type: item.type,
        title: item.title,
        category: item.category,
        amount: item.amount,
        date,
        note: item.note || 'Ponavljajuća stavka',
      });
    });
  });
  tx();
  res.json({ ok: true, created: inserted.length, transactions: inserted });
});

app.post('/api/backups', authMiddleware, async (req, res) => {
  try {
    const { fileName } = await backupDatabase(req.user.account_id);
    res.json({ ok: true, fileName });
  } catch (error) {
    console.error('Backup error', error);
    res.status(500).json({ error: 'Ne možemo stvoriti sigurnosnu kopiju.' });
  }
});

app.get('/api/backups', authMiddleware, (req, res) => {
  const backups = listBackups(req.user.account_id);
  res.json(backups);
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/api') || req.path.startsWith('/backups')) {
    return res.status(404).json({ error: 'Ruta nije pronađena.' });
  }
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
