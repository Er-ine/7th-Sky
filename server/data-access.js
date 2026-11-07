import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { initialMenu } from '../src/data.js';
import { normalizeOrderStatus, normalizeOrderType } from '../shared/order-contract.js';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
dotenv.config({ path: path.join(directory, '..', '..', '.env') });
fs.mkdirSync(directory, { recursive: true });

const db = new Database(process.env.DATABASE_PATH || path.join(directory, '7thsky.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    order_type TEXT NOT NULL CHECK (order_type IN ('dine-in', 'takeaway', 'delivery')),
    table_number TEXT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT '',
    payment_status TEXT NOT NULL DEFAULT 'Not Paid',
    order_status TEXT NOT NULL DEFAULT 'Order Placed',
    total REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS menu (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    description TEXT NOT NULL,
    image TEXT NOT NULL DEFAULT '',
    available INTEGER NOT NULL DEFAULT 1
  );
`);

const normalizeLegacyOrders = db.prepare(`
  UPDATE orders SET order_type = ?, order_status = ?
  WHERE id = ? AND (order_type <> ? OR order_status <> ?)
`);
for (const order of db.prepare('SELECT id, order_type, order_status FROM orders').all()) {
  const orderType = normalizeOrderType(order.order_type);
  if (!orderType) continue;
  const status = normalizeOrderStatus(orderType, order.order_status);
  if (status && status !== order.order_status) {
    normalizeLegacyOrders.run(orderType, status, order.id, orderType, status);
  } else if (orderType !== order.order_type) {
    normalizeLegacyOrders.run(orderType, order.order_status, order.id, orderType, order.order_status);
  }
}

const orderColumns = new Set(db.pragma('table_info(orders)').map((column) => column.name));
if (!orderColumns.has('tracking_token_hash')) {
  db.exec('ALTER TABLE orders ADD COLUMN tracking_token_hash TEXT');
}
if (!orderColumns.has('checkout_attempt_id')) {
  db.exec('ALTER TABLE orders ADD COLUMN checkout_attempt_id TEXT');
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_attempt_idx
    ON orders(checkout_attempt_id) WHERE checkout_attempt_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);
  CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
  UPDATE orders SET payment_status = 'Pending', payment_method = ''
    WHERE payment_status IN ('Demo Paid', 'Demo Confirmed');
`);

if (db.prepare('SELECT COUNT(*) AS count FROM menu').get().count === 0) {
  const insert = db.prepare(`
    INSERT INTO menu (id, name, category, price, description, image, available)
    VALUES (@id, @name, @category, @price, @description, @image, @available)
  `);
  const seed = db.transaction((items) => items.forEach((item) => insert.run({
    ...item,
    available: item.available ? 1 : 0,
  })));
  seed(initialMenu);
}

const mapMenu = (item) => ({ ...item, available: Boolean(item.available) });
const mapOrder = (order) => {
  const orderType = normalizeOrderType(order.order_type) || order.order_type;
  const [deliveryAddress = '', ...instructionLines] = orderType === 'delivery' ? order.note.split('\n') : [];
  return {
    id: order.order_number,
    orderNumber: order.order_number,
    orderType,
    table: order.table_number || '',
    customerName: order.customer_name,
    phone: order.phone,
    note: order.note,
    instructions: orderType === 'delivery' ? instructionLines.join('\n') : order.note,
    deliveryAddress: orderType === 'delivery' ? deliveryAddress : '',
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    status: normalizeOrderStatus(orderType, order.order_status) || order.order_status,
    subtotal: order.total,
    total: order.total,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: order.items || [],
  };
};

function trackingTokenFor(checkoutAttemptId) {
  const secret = process.env.TOKEN_SECRET;
  return checkoutAttemptId && secret
    ? createHmac('sha256', secret).update(`7sky-tracking:${checkoutAttemptId}`).digest('base64url')
    : randomBytes(32).toString('base64url');
}

export const data = {
  health() {
    return db.prepare('SELECT 1 AS connected').get().connected === 1;
  },
  listMenu() {
    return db.prepare('SELECT * FROM menu ORDER BY rowid').all().map(mapMenu);
  },
  getMenuItem(id) {
    const item = db.prepare('SELECT * FROM menu WHERE id = ?').get(id);
    return item ? mapMenu(item) : null;
  },
  saveMenu(item) {
    db.prepare(`
      INSERT INTO menu (id, name, category, price, description, image, available)
      VALUES (@id, @name, @category, @price, @description, @image, @available)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category,
        price=excluded.price, description=excluded.description, image=excluded.image,
        available=excluded.available
    `).run({ ...item, available: item.available ? 1 : 0 });
    return this.listMenu().find((menuItem) => menuItem.id === item.id);
  },
  deleteMenu(id) {
    return db.prepare('DELETE FROM menu WHERE id = ?').run(id).changes > 0;
  },
  createOrder(order) {
    const now = new Date().toISOString();
    const orderNumber = `7S-${now.slice(2, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const trackingToken = trackingTokenFor(order.checkoutAttemptId);
    const insertOrder = db.prepare(`
      INSERT INTO orders (order_number, order_type, table_number, customer_name, phone,
        note, payment_method, payment_status, order_status, total, created_at, updated_at,
        tracking_token_hash, checkout_attempt_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Order Placed', ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, item_name, price, quantity) VALUES (?, ?, ?, ?)
    `);
    const create = db.transaction(() => {
      const result = insertOrder.run(
        orderNumber, order.orderType, order.table || null, order.customerName,
        order.phone || '', order.note || '', order.paymentMethod || '',
        order.paymentStatus, order.total, now, now,
        createHash('sha256').update(trackingToken).digest('hex'),
        order.checkoutAttemptId || null,
      );
      order.items.forEach((item) => insertItem.run(result.lastInsertRowid, item.name, item.price, item.quantity));
    });
    create();
    return { ...this.getOrder(orderNumber), trackingToken };
  },
  getOrderByCheckoutAttempt(checkoutAttemptId) {
    if (!checkoutAttemptId) return null;
    const existing = db.prepare('SELECT order_number FROM orders WHERE checkout_attempt_id = ?').get(checkoutAttemptId);
    if (!existing) return null;
    return { ...this.getOrder(existing.order_number), trackingToken: trackingTokenFor(checkoutAttemptId) };
  },
  getTrackedOrder(trackingToken) {
    const tokenHash = createHash('sha256').update(trackingToken).digest('hex');
    const orderNumber = db.prepare('SELECT order_number FROM orders WHERE tracking_token_hash = ?').get(tokenHash)?.order_number;
    const order = orderNumber ? this.getOrder(orderNumber) : null;
    if (!order) return null;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      table: order.table,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.total,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items,
    };
  },
  listOrders() {
    return db.prepare(`
      SELECT o.*, i.item_name AS itemName, i.price AS itemPrice, i.quantity AS itemQuantity
      FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
      ORDER BY o.created_at DESC, i.id
    `).all().reduce((orders, row) => {
      let order = orders.at(-1);
      if (!order || order.order_number !== row.order_number) {
        order = { ...row, items: [] };
        orders.push(order);
      }
      if (row.itemName !== null) order.items.push({
        id: `${row.order_number}-${order.items.length}`,
        name: row.itemName,
        price: row.itemPrice,
        quantity: row.itemQuantity,
      });
      return orders;
    }, []).map(mapOrder);
  },
  getOrder(orderNumber) {
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
    if (!order) return null;
    order.items = db.prepare('SELECT item_name AS name, price, quantity FROM order_items WHERE order_id = ? ORDER BY id').all(order.id)
      .map((item, index) => ({ ...item, id: `${orderNumber}-${index}` }));
    return mapOrder(order);
  },
  updateOrder(orderNumber, fields) {
    const assignments = [];
    const values = [];
    if (fields.status !== undefined) {
      assignments.push('order_status = ?');
      values.push(fields.status);
    }
    if (fields.paymentStatus !== undefined) {
      assignments.push('payment_status = ?');
      values.push(fields.paymentStatus);
    }
    if (fields.paymentMethod !== undefined) {
      assignments.push('payment_method = ?');
      values.push(fields.paymentMethod);
    }
    if (!assignments.length) return this.getOrder(orderNumber);
    assignments.push('updated_at = ?');
    values.push(new Date().toISOString(), orderNumber);
    const result = db.prepare(`UPDATE orders SET ${assignments.join(', ')} WHERE order_number = ?`).run(...values);
    return result.changes ? this.getOrder(orderNumber) : null;
  },
  recordPaymentSelection(orderNumber, paymentMethod, checkoutAttemptId) {
    const result = db.prepare(`
      UPDATE orders SET payment_method = ?, updated_at = ?
      WHERE order_number = ? AND checkout_attempt_id = ?
        AND order_type IN ('takeaway', 'delivery') AND payment_status = 'Pending'
    `).run(paymentMethod, new Date().toISOString(), orderNumber, checkoutAttemptId);
    if (result.changes) return this.getOrder(orderNumber);
    const existing = this.getOrder(orderNumber);
    return existing && ['takeaway', 'delivery'].includes(existing.orderType)
      && existing.paymentStatus === 'Pending' && existing.paymentMethod === paymentMethod
      && db.prepare('SELECT 1 FROM orders WHERE order_number = ? AND checkout_attempt_id = ?').get(orderNumber, checkoutAttemptId)
      ? existing
      : null;
  },
  getAnalytics({ start, end, todayStart, tomorrowStart }) {
    const today = db.prepare(`
      SELECT COUNT(*) AS orders,
        COALESCE(SUM(CASE WHEN payment_status = 'Paid' THEN total ELSE 0 END), 0) AS revenue,
        COALESCE(AVG(total), 0) AS averageOrderValue,
        COALESCE(SUM(CASE WHEN order_type = 'dine-in' THEN 1 ELSE 0 END), 0) AS dineIn,
        COALESCE(SUM(CASE WHEN order_type = 'takeaway' THEN 1 ELSE 0 END), 0) AS takeaway,
        COALESCE(SUM(CASE WHEN order_type = 'delivery' THEN 1 ELSE 0 END), 0) AS delivery
      FROM orders WHERE created_at >= ? AND created_at < ?
    `).get(todayStart, tomorrowStart);
    const orderTypes = db.prepare(`
      SELECT order_type AS type, COUNT(*) AS orders
      FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY order_type
    `).all(start, end);
    const hourly = db.prepare(`
      SELECT CAST(strftime('%H', created_at, '+330 minutes') AS INTEGER) AS hour,
        COUNT(*) AS orders
      FROM orders WHERE created_at >= ? AND created_at < ?
      GROUP BY hour ORDER BY hour
    `).all(start, end);
    const monthly = db.prepare(`
      SELECT strftime('%Y-%m', created_at, '+330 minutes') AS month, COUNT(*) AS orders
      FROM orders WHERE created_at >= ? AND created_at < ?
      GROUP BY month ORDER BY month
    `).all(start, end);
    return {
      today,
      orderTypes,
      hourly,
      monthly,
    };
  },
};
