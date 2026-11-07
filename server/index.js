import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const port = Number(process.env.PORT) || 3001;

fs.mkdirSync(dataDir, { recursive: true });

/* ---------- configuration (works with no .env; override in production) ---------- */
const staffAccounts = {
  kitchen: {
    username: (process.env.KITCHEN_USERNAME || 'kitchen').toLowerCase(),
    password: process.env.KITCHEN_PASSWORD || 'kitchen123',
  },
  owner: {
    username: (process.env.OWNER_USERNAME || 'owner').toLowerCase(),
    password: process.env.OWNER_PASSWORD || 'owner123',
  },
};

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(dataDir, 'session-secret.txt');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret);
    return secret;
  }
}
const sessionSecret = loadSecret();

/* ---------- order rules ---------- */
const orderTypes = ['dine-in', 'takeaway', 'delivery'];
const statusFlows = {
  'dine-in': ['Placed', 'Preparing', 'Ready', 'Delivered', 'Completed'],
  delivery: ['Placed', 'Preparing', 'Ready', 'On the way', 'Completed'],
  takeaway: ['Placed', 'Preparing', 'Ready', 'At reception', 'Completed'],
};
const paidMethods = ['card', 'upi', 'qr'];

/* ---------- database ---------- */
const db = new Database(process.env.DB_PATH || path.join(dataDir, 'orders-live.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    checkout_attempt_id TEXT UNIQUE,
    order_type TEXT NOT NULL,
    table_number TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    delivery_address TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    status TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    image TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
`);

const insertOrder = db.prepare(`
  INSERT INTO orders (id, checkout_attempt_id, order_type, table_number, customer_name, phone, delivery_address,
    instructions, payment_method, payment_status, status, subtotal, created_at, updated_at)
  VALUES (@id, @checkout_attempt_id, @order_type, @table_number, @customer_name, @phone, @delivery_address,
    @instructions, @payment_method, @payment_status, @status, @subtotal, @created_at, @updated_at)
`);
const insertItem = db.prepare(`
  INSERT INTO order_items (order_id, item_id, name, price, quantity, image) VALUES (?, ?, ?, ?, ?, ?)
`);
const selectOrder = db.prepare('SELECT * FROM orders WHERE id = ?');
const selectOrderByAttempt = db.prepare('SELECT * FROM orders WHERE checkout_attempt_id = ?');
const selectAllOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC');
const selectItems = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
const updateStatus = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?');

const createOrderTx = db.transaction((order, items) => {
  insertOrder.run(order);
  items.forEach((item) => insertItem.run(order.id, item.id, item.name, item.price, item.quantity, item.image));
});

function shapeOrder(row, { includePrivate }) {
  const items = selectItems.all(row.id).map((item) => ({
    id: item.item_id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    image: item.image,
  }));
  const order = {
    id: row.id,
    orderNumber: row.id,
    orderType: row.order_type,
    table: row.table_number,
    customerName: row.customer_name,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    subtotal: row.subtotal,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includePrivate) {
    order.phone = row.phone;
    order.deliveryAddress = row.delivery_address;
    order.instructions = row.instructions;
    order.checkoutAttemptId = row.checkout_attempt_id || '';
  }
  return order;
}

function newOrderId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const date = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const bytes = crypto.randomBytes(6);
    const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
    const id = `7S-${date}-${suffix}`;
    if (!selectOrder.get(id)) return id;
  }
  throw new Error('Could not generate a unique order number.');
}

/* ---------- auth ---------- */
const sign = (value) => crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');

function createToken(role, username) {
  const payload = Buffer.from(JSON.stringify({ role, username, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(signature || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const session = readToken(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (!session || !roles.includes(session.role)) {
      res.status(401).json({ error: 'Please sign in again.' });
      return;
    }
    req.session = session;
    next();
  };
}

const safeEqual = (a, b) => {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
};

const loginAttempts = new Map();
function loginThrottled(ip) {
  const now = Date.now();
  const recent = (loginAttempts.get(ip) || []).filter((time) => now - time < 60_000);
  recent.push(now);
  loginAttempts.set(ip, recent);
  return recent.length > 10;
}

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

const route = (handler) => (req, res, next) => {
  try {
    handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

app.get('/api/health', route((req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM orders').get();
  res.json({ ok: true, orders: count });
}));

app.post('/api/login', route((req, res) => {
  if (loginThrottled(req.ip)) {
    res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
    return;
  }
  const { username = '', password = '', role = '' } = req.body || {};
  const account = staffAccounts[role];
  const userMatches = account && String(username).trim().toLowerCase() === account.username;
  if (!account || !userMatches || !safeEqual(password, account.password)) {
    res.status(401).json({ error: `Those details don’t match the ${role || 'staff'} account.` });
    return;
  }
  res.json({ username: account.username, role, token: createToken(role, account.username) });
}));

app.post('/api/orders', route((req, res) => {
  const body = req.body || {};
  const orderType = body.orderType;
  if (!orderTypes.includes(orderType)) {
    res.status(400).json({ error: 'Choose dine-in, takeaway or delivery.' });
    return;
  }
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.map((item) => ({
    id: String(item?.id || '').slice(0, 80),
    name: String(item?.name || '').trim().slice(0, 120),
    price: Math.round(Number(item?.price)),
    quantity: Math.round(Number(item?.quantity)),
    image: String(item?.image || '').slice(0, 300),
  }));
  if (!items.length || items.length > 60 || items.some((item) => !item.id || !item.name || !(item.price > 0) || !(item.quantity >= 1 && item.quantity <= 50))) {
    res.status(400).json({ error: 'Your order has no valid items.' });
    return;
  }
  const attemptId = String(body.checkoutAttemptId || '').slice(0, 80);
  if (attemptId) {
    const existing = selectOrderByAttempt.get(attemptId);
    if (existing) {
      res.json(shapeOrder(existing, { includePrivate: true }));
      return;
    }
  }

  let tableNumber = '';
  let customerName = String(body.customerName || '').trim().slice(0, 80);
  let phone = '';
  let deliveryAddress = '';
  let paymentMethod = 'pay-at-restaurant';
  let paymentStatus = 'Not Paid';

  if (orderType === 'dine-in') {
    const table = Number(body.table);
    if (!Number.isInteger(table) || table < 1 || table > 99) {
      res.status(400).json({ error: 'A valid table number is required for dine-in orders.' });
      return;
    }
    tableNumber = String(table);
    customerName = customerName || `Table ${table} guest`;
  } else {
    phone = String(body.phone || '');
    if (!customerName) {
      res.status(400).json({ error: 'Please enter your name.' });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
      return;
    }
    if (orderType === 'delivery') {
      deliveryAddress = String(body.deliveryAddress || '').trim().slice(0, 300);
      if (!deliveryAddress) {
        res.status(400).json({ error: 'Please enter a delivery address.' });
        return;
      }
    }
    if (!paidMethods.includes(body.paymentMethod)) {
      res.status(400).json({ error: 'Choose a payment method.' });
      return;
    }
    paymentMethod = body.paymentMethod;
    paymentStatus = 'Paid';
  }

  const now = new Date().toISOString();
  const order = {
    id: newOrderId(),
    checkout_attempt_id: attemptId || null,
    order_type: orderType,
    table_number: tableNumber,
    customer_name: customerName,
    phone,
    delivery_address: deliveryAddress,
    instructions: String(body.instructions || '').trim().slice(0, 300),
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    status: 'Placed',
    subtotal: items.reduce((total, item) => total + item.price * item.quantity, 0),
    created_at: now,
    updated_at: now,
  };
  createOrderTx(order, items);
  res.status(201).json(shapeOrder(selectOrder.get(order.id), { includePrivate: true }));
}));

app.get('/api/orders', requireRole('kitchen', 'owner'), route((req, res) => {
  res.json(selectAllOrders.all().map((row) => shapeOrder(row, { includePrivate: true })));
}));

app.get('/api/orders/:id', route((req, res) => {
  const row = selectOrder.get(String(req.params.id).toUpperCase());
  if (!row) {
    res.status(404).json({ error: 'We couldn’t find that order.' });
    return;
  }
  res.json(shapeOrder(row, { includePrivate: false }));
}));

app.patch('/api/orders/:id/status', requireRole('kitchen'), route((req, res) => {
  const row = selectOrder.get(String(req.params.id).toUpperCase());
  if (!row) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  const status = String(req.body?.status || '');
  if (!statusFlows[row.order_type].includes(status)) {
    res.status(400).json({ error: `“${status}” is not a valid status for a ${row.order_type} order.` });
    return;
  }
  updateStatus.run(status, new Date().toISOString(), row.id);
  res.json(shapeOrder(selectOrder.get(row.id), { includePrivate: true }));
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

/* ---------- serve the built website in production ---------- */
const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
    return undefined;
  });
}

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, error);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

app.listen(port, () => {
  console.log(`7th Sky server running on http://localhost:${port}`);
});