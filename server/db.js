import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.sqlite');

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec('PRAGMA foreign_keys = ON');

const createStatements = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('personal','family','business')),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    first_name TEXT,
    last_name TEXT,
    dob TEXT,
    address TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS business_details (
    account_id INTEGER PRIMARY KEY,
    oib TEXT,
    headquarters TEXT,
    iban TEXT,
    vat_payer INTEGER DEFAULT 0,
    contact_person TEXT,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income','expense')),
    title TEXT NOT NULL,
    category TEXT,
    amount REAL NOT NULL CHECK (amount >= 0),
    date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date)`,
  `CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    UNIQUE(account_id, month),
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS recurring (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income','expense')),
    amount REAL NOT NULL CHECK (amount >= 0),
    day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
    note TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`
];

createStatements.forEach((sql) => db.exec(sql));

// Ensure existing transactions table has account_id if database older
const pragma = db.prepare("PRAGMA table_info(transactions)").all();
const hasAccountId = pragma.some((column) => column.name === 'account_id');
if (!hasAccountId) {
  db.exec("ALTER TABLE transactions ADD COLUMN account_id INTEGER");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)");
}

export async function backupDatabase(accountId) {
  const timestamp = new Date().toISOString().slice(0, 7);
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const fileName = `backup_${accountId}_${timestamp}.sqlite`;
  const fullPath = path.join(backupDir, fileName);
  await db.backup(fullPath);
  db.prepare(
    `INSERT INTO backups (account_id, file_name, created_at) VALUES (?,?,?)`
  ).run(accountId, fileName, new Date().toISOString());
  return { fileName };
}

export function listBackups(accountId) {
  return db
    .prepare(
      `SELECT id, file_name AS fileName, created_at AS createdAt FROM backups WHERE account_id=? ORDER BY created_at DESC`
    )
    .all(accountId);
}
