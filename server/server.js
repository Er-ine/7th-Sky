
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { data } from './data-access.js';
import { normalizeOrderStatus, normalizeOrderType, orderStatusesForType } from '../shared/order-contract.js';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(root, '..', '.env') });

const port = Number(process.env.API_PORT || process.env.PORT || 3000);
const roles = ['kitchen', 'owner', 'reception'];
const tokenSecret = process.env.TOKEN_SECRET;

app.use(express.json({ limit: '1mb' }));

function dateInIndia(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === value;
}

function indiaDayStartUtc(date) {
  return new Date(`${date}T00:00:00+05:30`).toISOString();
}

function nextCalendarDate(date) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);

  return next.toISOString().slice(0, 10);
}

function sign(payload) {
  if (!tokenSecret) {
    throw new Error('TOKEN_SECRET is not configured in the project .env file.');
  }

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', tokenSecret)
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
}

function routeHandler(label, handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error(`${label} failed:`, error);

      if (res.headersSent) return next(error);

      return res.status(500).json({
        error: `${label} failed.`,
      });
    }
  };
}

function authenticate(allowedRoles) {
  return routeHandler('Staff authorization', (req, res, next) => {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required.',
      });
    }

    if (!tokenSecret) {
      return res.status(503).json({
        error: 'Staff authentication is temporarily unavailable.',
      });
    }

    const [body, signature] = token.split('.');

    const expected = crypto
      .createHmac('sha256', tokenSecret)
      .update(body || '')
      .digest();

    const supplied = Buffer.from(signature || '', 'base64url');

    if (
      supplied.length !== expected.length
      || !crypto.timingSafeEqual(supplied, expected)
    ) {
      return res.status(401).json({
        error: 'Invalid authentication token.',
      });
    }

    let payload;

    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch {
      return res.status(401).json({
        error: 'Invalid authentication token.',
      });
    }

    if (
      !payload
      || payload.expiresAt < Date.now()
      || !allowedRoles.includes(payload.role)
    ) {
      return res.status(403).json({
        error: 'You do not have access to this resource.',
      });
    }

    req.staff = payload;

    return next();
  });
}

function validMenu(item) {
  return item
    && typeof item.id === 'string'
    && item.id.trim()
    && typeof item.name === 'string'
    && item.name.trim()
    && typeof item.category === 'string'
    && item.category.trim()
    && Number.isFinite(Number(item.price))
    && Number(item.price) > 0
    && typeof item.description === 'string'
    && typeof item.image === 'string'
    && typeof item.available === 'boolean';
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get('/api/health', routeHandler('Health check', (_req, res) => {
  const databaseConnected = data.health();

  if (!databaseConnected) {
    return res.status(503).json({
      ok: false,
      database: 'disconnected',
    });
  }

  return res.json({
    ok: true,
    database: 'connected',
  });
}));

// --------------------------------------------------
// STAFF LOGIN
// --------------------------------------------------

app.post('/api/login', routeHandler('Staff login', (req, res) => {
  const { username, password, role } = req.body || {};

  if (!roles.includes(role)) {
    return res.status(400).json({
      error: 'Choose a valid staff role.',
    });
  }

  const configuredUsername = process.env[`${role.toUpperCase()}_USERNAME`];
  const configuredPassword = process.env[`${role.toUpperCase()}_PASSWORD`];

  if (!tokenSecret || !configuredUsername || !configuredPassword) {
    console.error(`Staff login is not configured for role "${role}". Check .env.`);

    return res.status(503).json({
      error: 'Staff sign-in is temporarily unavailable.',
    });
  }

  if (
    username !== configuredUsername
    || password !== configuredPassword
  ) {
    return res.status(401).json({
      error: 'The supplied sign-in details are not valid.',
    });
  }

  return res.json({
    token: sign({
      role,
      username,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    }),
    user: {
      role,
      username,
    },
  });
}));

// --------------------------------------------------
// MENU
// --------------------------------------------------

app.get('/api/menu', routeHandler('Menu listing', (_req, res) => {
  res.json(data.listMenu());
}));

app.post('/api/menu', authenticate(['owner']), routeHandler('Menu creation', (req, res) => {
  if (!validMenu(req.body)) {
    return res.status(400).json({
      error: 'Menu item is invalid.',
    });
  }

  return res.status(201).json(data.saveMenu(req.body));
}));

app.patch('/api/menu/:id', authenticate(['owner']), routeHandler('Menu update', (req, res) => {
  const item = {
    ...req.body,
    id: req.params.id,
  };

  if (!validMenu(item)) {
    return res.status(400).json({
      error: 'Menu item is invalid.',
    });
  }

  return res.json(data.saveMenu(item));
}));

app.delete('/api/menu/:id', authenticate(['owner']), routeHandler('Menu deletion', (req, res) => {
  if (!data.deleteMenu(req.params.id)) {
    return res.status(404).json({
      error: 'Menu item not found.',
    });
  }

  return res.status(204).end();
}));

// --------------------------------------------------
// CREATE ORDER
// --------------------------------------------------

app.post('/api/orders', routeHandler('Order creation', (req, res) => {
  const order = { ...(req.body || {}) };

  order.orderType = normalizeOrderType(order.orderType);

  const checkoutAttemptId = order.checkoutAttemptId;

  if (
    !order.orderType
    || !Array.isArray(order.items)
    || !order.items.length
    || !order.items.every((item) =>
      typeof item.id === 'string'
      && item.id.trim()
      && typeof item.name === 'string'
      && item.name.trim()
      && Number.isFinite(Number(item.price))
      && Number(item.price) > 0
      && Number.isInteger(Number(item.quantity))
      && Number(item.quantity) > 0
    )
    || typeof order.customerName !== 'string'
    || !order.customerName.trim()
    || (
      order.phone !== undefined
      && (typeof order.phone !== 'string' || order.phone.length > 32)
    )
    || typeof checkoutAttemptId !== 'string'
    || checkoutAttemptId.length < 8
    || checkoutAttemptId.length > 100
    || (
      order.orderType !== 'dine-in'
      && !['card', 'upi'].includes(order.paymentMethod)
    )
    || (
      order.orderType !== 'dine-in'
      && !/^[6-9]\d{9}$/.test(order.phone || '')
    )
  ) {
    return res.status(400).json({
      error: 'Order details are invalid.',
    });
  }

  if (!tokenSecret) {
    return res.status(503).json({
      error: 'Secure order tracking is unavailable: TOKEN_SECRET is not configured.',
    });
  }

  const items = order.items.map((item) => {
    const menuItem = data.getMenuItem(item.id);

    if (!menuItem || !menuItem.available) return null;

    if (
      menuItem.price !== Number(item.price)
      || menuItem.name !== item.name
    ) {
      return null;
    }

    return {
      ...item,
      name: menuItem.name,
      price: menuItem.price,
    };
  });

  if (items.some((item) => !item)) {
    return res.status(409).json({
      error: 'A menu item changed or is no longer available. Refresh the menu and try again.',
    });
  }

  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  if (Number(order.total) !== total) {
    return res.status(400).json({
      error: 'Order total does not match its items.',
    });
  }

  if (
    order.orderType === 'dine-in'
    && !String(order.table || '').trim()
  ) {
    return res.status(400).json({
      error: 'A table number is required for dine-in orders.',
    });
  }

  const existing = data.getOrderByCheckoutAttempt(checkoutAttemptId);

  const created = existing
    ? (
      order.orderType !== 'dine-in'
      && existing.paymentStatus === 'Pending'
      && existing.paymentMethod !== order.paymentMethod
        ? data.recordPaymentSelection(
          existing.id,
          order.paymentMethod,
          checkoutAttemptId
        ) || existing
        : existing
    )
    : data.createOrder({
      ...order,
      items,
      total,
      paymentStatus: order.orderType === 'dine-in' ? 'Not Paid' : 'Pending',
    });

  const publicOrder = {
    id: created.id,
    orderNumber: created.orderNumber,
    orderType: created.orderType,
    table: created.table,
    status: created.status,
    paymentStatus: created.paymentStatus,
    total: created.total,
    items: created.items,
  };

  return res.status(existing ? 200 : 201).json({
    order: publicOrder,
    trackingToken: created.trackingToken,
  });
}));

// --------------------------------------------------
// ORDER LIST AND LOOKUP
// --------------------------------------------------

app.get('/api/orders', authenticate(roles), routeHandler('Order listing', (_req, res) => {
  return res.json(data.listOrders());
}));

app.get('/api/orders/:id', authenticate(roles), routeHandler('Order lookup', (req, res) => {
  const order = data.getOrder(req.params.id);

  if (!order) {
    return res.status(404).json({
      error: 'Order not found.',
    });
  }

  return res.json(order);
}));

// --------------------------------------------------
// PUBLIC ORDER TRACKING
// --------------------------------------------------

app.get('/api/track/:token', routeHandler('Order tracking', (req, res) => {
  res.set('Cache-Control', 'no-store');

  if (!/^[A-Za-z0-9_-]{43}$/.test(req.params.token)) {
    return res.status(404).json({
      error: 'Tracking link is invalid or expired.',
    });
  }

  const order = data.getTrackedOrder(req.params.token);

  if (!order) {
    return res.status(404).json({
      error: 'Tracking link is invalid or expired.',
    });
  }

  return res.json(order);
}));

// --------------------------------------------------
// ORDER STATUS UPDATE
// --------------------------------------------------

app.patch(
  '/api/orders/:id/status',
  authenticate(['kitchen', 'reception']),
  routeHandler('Order status update', (req, res) => {
    const order = data.getOrder(req.params.id);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found.',
      });
    }

    const { status } = req.body || {};

    const transitions = {
      'dine-in': {
        'Order Placed': ['Confirmed'],
        'Confirmed': ['Preparing'],
        'Preparing': ['Ready to Serve'],
        'Ready to Serve': ['Served'],
      },

      takeaway: {
        'Order Placed': ['Confirmed'],
        'Confirmed': ['Preparing'],
        'Preparing': ['Ready for Pickup'],
        'Ready for Pickup': ['Completed'],
      },

      delivery: {
        'Order Placed': ['Confirmed'],
        'Confirmed': ['Preparing'],
        'Preparing': ['Ready for Dispatch'],
        'Ready for Dispatch': ['Out for Delivery'],
        'Out for Delivery': ['Delivered'],
      },
    };

    const currentStatus = normalizeOrderStatus(order.status);
    const requestedStatus = normalizeOrderStatus(status);
    const orderType = normalizeOrderType(order.orderType);

    if (!orderType || !transitions[orderType]) {
      return res.status(400).json({
        error: 'Invalid order type.',
      });
    }

    if (!transitions[orderType][currentStatus]?.includes(requestedStatus)) {
      return res.status(409).json({
        error: `Cannot change order status from ${currentStatus} to ${requestedStatus}.`,
      });
    }

    // Kitchen handles preparation and all delivery updates.
    const kitchenStatuses = {
      'dine-in': [
        'Confirmed',
        'Preparing',
        'Ready to Serve',
      ],

      takeaway: [
        'Confirmed',
        'Preparing',
        'Ready for Pickup',
      ],

      delivery: [
        'Confirmed',
        'Preparing',
        'Ready for Dispatch',
        'Out for Delivery',
        'Delivered',
      ],
    };

    if (req.staff.role === 'kitchen') {
      if (!kitchenStatuses[orderType].includes(requestedStatus)) {
        return res.status(403).json({
          error: 'Kitchen cannot perform this status update.',
        });
      }
    }

    // Reception handles the final dine-in and takeaway stages.
    if (req.staff.role === 'reception') {
      const receptionStatuses = {
        'dine-in': ['Served'],
        takeaway: ['Completed'],
        delivery: [],
      };

      if (!receptionStatuses[orderType].includes(requestedStatus)) {
        return res.status(403).json({
          error: 'Reception cannot perform this status update.',
        });
      }
    }

    return res.json(
      data.updateOrder(req.params.id, {
        status: requestedStatus,
      })
    );
  })
);

// --------------------------------------------------
// PAYMENT UPDATE
// --------------------------------------------------

app.patch(
  '/api/orders/:id/payment',
  authenticate(['reception', 'owner']),
  routeHandler('Order payment update', (req, res) => {
    const order = data.getOrder(req.params.id);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found.',
      });
    }

    const { paymentMethod } = req.body || {};

    if (
      order.orderType !== 'dine-in'
      || normalizeOrderStatus(order.status) !== 'Served'
      || !['Cash', 'Card', 'UPI'].includes(paymentMethod)
    ) {
      return res.status(409).json({
        error: 'Payment can be recorded only for a served dine-in order.',
      });
    }

    return res.json(
      data.updateOrder(req.params.id, {
        paymentMethod,
        paymentStatus: 'Paid',
      })
    );
  })
);

// --------------------------------------------------
// OWNER ANALYTICS
// --------------------------------------------------

app.get(
  '/api/owner/analytics',
  authenticate(['owner']),
  routeHandler('Owner analytics', (req, res) => {
    const today = dateInIndia(new Date());

    const { range, from, to } = req.query;

    let firstDate;
    let lastDate;

    if (range === '7d' || range === '30d' || range === '12m') {
      if (range === '12m') {
        const first = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);

        first.setUTCMonth(first.getUTCMonth() - 11);

        firstDate = first.toISOString().slice(0, 10);
        lastDate = today;
      } else {
        const days = Number(range.slice(0, -1));
        const first = new Date(`${today}T00:00:00.000Z`);

        first.setUTCDate(first.getUTCDate() - days + 1);

        firstDate = first.toISOString().slice(0, 10);
        lastDate = today;
      }
    } else if (
      range === 'custom'
      && isCalendarDate(from)
      && isCalendarDate(to)
      && from <= to
    ) {
      const span = (
        Date.parse(`${to}T00:00:00.000Z`)
        - Date.parse(`${from}T00:00:00.000Z`)
      ) / 86400000 + 1;

      if (span > 366) {
        return res.status(400).json({
          error: 'Custom ranges cannot exceed 366 days.',
        });
      }

      firstDate = from;
      lastDate = to;
    } else {
      return res.status(400).json({
        error: 'Choose a valid 7-day, 30-day, 12-month, or custom date range.',
      });
    }

    if (lastDate > today) {
      return res.status(400).json({
        error: 'Analytics dates cannot be in the future.',
      });
    }

    const tomorrow = nextCalendarDate(today);

    const result = data.getAnalytics({
      start: indiaDayStartUtc(firstDate),
      end: indiaDayStartUtc(nextCalendarDate(lastDate)),
      todayStart: indiaDayStartUtc(today),
      tomorrowStart: indiaDayStartUtc(tomorrow),
    });

    const days = (
      Date.parse(`${lastDate}T00:00:00.000Z`)
      - Date.parse(`${firstDate}T00:00:00.000Z`)
    ) / 86400000 + 1;

    return res.json({
      timeZone: 'Asia/Kolkata',
      range: {
        from: firstDate,
        to: lastDate,
        days,
      },
      ...result,
    });
  })
);

// --------------------------------------------------
// FALLBACK ROUTES AND ERROR HANDLING
// --------------------------------------------------

app.use(
  '/api',
  routeHandler('API route lookup', (_req, res) => {
    return res.status(404).json({
      error: 'API route not found.',
    });
  })
);

app.use(express.static(path.join(root, '..', 'dist')));

app.get('*', routeHandler('Frontend route', (_req, res, next) => {
  res.sendFile(
    path.join(root, '..', 'dist', 'index.html'),
    (error) => {
      if (error) next(error);
    }
  );
}));

app.use((error, _req, res, _next) => {
  console.error('Request failed:', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
    status: error.status,
    type: error.type,
    code: error.code,
    stack: error instanceof Error ? error.stack : undefined,
  });

  const status = Number.isInteger(error.status)
    && error.status >= 400
    && error.status < 500
      ? error.status
      : error instanceof SyntaxError && 'body' in error
        ? 400
        : 500;

  const message = status === 400 && error instanceof SyntaxError
    ? 'The request body contains invalid JSON.'
    : status === 413
      ? 'The request body is too large.'
      : status < 500
        ? 'The request could not be accepted.'
        : 'The server could not complete the request.';

  res.status(status).json({
    error: message,
  });
});

export const server = app.listen(port, () => {
  console.log(`7th Sky server listening on port ${port}`);
});
