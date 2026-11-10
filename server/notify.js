import nodemailer from 'nodemailer';

/* Reads settings from environment variables each time, so a .env change only needs a server restart.
   Accepted names (first one found wins):
     ntfy : NTFY_URL (full URL incl. topic)  or  NTFY_TOPIC (+ optional NTFY_SERVER, default https://ntfy.sh)
     email: EMAIL_USER, EMAIL_PASS | EMAIL_PASSWORD | SMTP_PASS, EMAIL_TO | NOTIFY_EMAIL
            optional EMAIL_SERVICE (default gmail), or EMAIL_HOST / EMAIL_PORT / EMAIL_SECURE for other providers */
const pick = (...names) => names.map((name) => (process.env[name] || '').trim()).find(Boolean) || '';

function settings() {
  const topic = pick('NTFY_TOPIC');
  const ntfyUrl = pick('NTFY_URL') || (topic ? `${(pick('NTFY_SERVER') || 'https://ntfy.sh').replace(/\/+$/, '')}/${encodeURIComponent(topic)}` : '');
  return {
    ntfyUrl,
    ntfyToken: pick('NTFY_TOKEN'),
    emailUser: pick('EMAIL_USER', 'SMTP_USER'),
    emailPass: pick('EMAIL_PASS', 'EMAIL_PASSWORD', 'SMTP_PASS').replace(/\s+/g, ''),
    emailTo: pick('EMAIL_TO', 'NOTIFY_EMAIL'),
    emailHost: pick('EMAIL_HOST'),
    emailPort: Number(pick('EMAIL_PORT')) || 0,
    emailSecure: pick('EMAIL_SECURE') === 'true',
    emailService: pick('EMAIL_SERVICE') || 'gmail',
  };
}

export function notificationStatus() {
  const config = settings();
  return {
    ntfy: Boolean(config.ntfyUrl),
    email: Boolean(config.emailUser && config.emailPass && config.emailTo),
  };
}

const rupees = (value) => `Rs. ${Number(value).toLocaleString('en-IN')}`;

function describe(order) {
  const where = order.orderType === 'dine-in' ? `Dine-in, Table ${order.table}` : order.orderType === 'delivery' ? 'Delivery' : 'Takeaway';
  const lines = order.items.map((item) => `${item.quantity} x ${item.name}`);
  const body = [
    `${where}`,
    ...lines,
    `Total: ${rupees(order.subtotal)}`,
    `Payment: ${order.paymentStatus}`,
    order.orderType === 'dine-in' ? '' : `Customer: ${order.customerName} (${order.phone})`,
    order.deliveryAddress ? `Address: ${order.deliveryAddress}` : '',
    order.instructions ? `Note: ${order.instructions}` : '',
  ].filter(Boolean).join('\n');
  return { where, body };
}

async function sendNtfy(config, order) {
  const { where, body } = describe(order);
  const response = await fetch(config.ntfyUrl, {
    method: 'POST',
    headers: {
      Title: `New order ${order.orderNumber} - ${where}`,
      Priority: 'high',
      Tags: 'bell',
      ...(config.ntfyToken ? { Authorization: `Bearer ${config.ntfyToken}` } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`ntfy replied ${response.status} ${response.statusText}`);
}

async function sendEmail(config, order) {
  const { where, body } = describe(order);
  const transport = nodemailer.createTransport(
    config.emailHost
      ? { host: config.emailHost, port: config.emailPort || 587, secure: config.emailSecure, auth: { user: config.emailUser, pass: config.emailPass }, tls: { rejectUnauthorized: false } }
      : { service: config.emailService, auth: { user: config.emailUser, pass: config.emailPass } },
  );
  await transport.sendMail({
    from: `"7th Sky orders" <${config.emailUser}>`,
    to: config.emailTo,
    subject: `New order ${order.orderNumber} - ${where}`,
    text: `${body}\n\nOrder number: ${order.orderNumber}`,
  });
}

/* Never throws and never blocks the order: failures are only logged. */
export async function notifyNewOrder(order) {
  const config = settings();
  const status = notificationStatus();
  if (!status.ntfy && !status.email) {
    console.warn(`[notify] No notification channel is configured, so order ${order.orderNumber} sent no alert.`);
    return;
  }
  const jobs = [];
  if (status.ntfy) jobs.push(['ntfy', sendNtfy(config, order)]);
  if (status.email) jobs.push(['email', sendEmail(config, order)]);
  const results = await Promise.allSettled(jobs.map(([, job]) => job));
  results.forEach((result, index) => {
    const channel = jobs[index][0];
    if (result.status === 'fulfilled') console.log(`[notify] ${channel} sent for order ${order.orderNumber}`);
    else console.error(`[notify] ${channel} FAILED for order ${order.orderNumber}: ${result.reason?.message || result.reason}`);
  });
}