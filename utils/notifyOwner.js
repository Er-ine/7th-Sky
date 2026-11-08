import nodemailer from 'nodemailer';
import twilio from 'twilio';

function buildMessage(order) {
  const items = (order.items || [])
    .map((i) => {
      const qty = i.quantity ?? i.qty ?? 1;
      return `• ${i.name} x${qty} - ₹${(i.price ?? 0) * qty}`;
    })
    .join('\n');

  return [
    `New Order ${order.orderNumber || order.id || ''}`.trim(),
    order.orderType ? `Type: ${order.orderType}` : null,
    order.table ? `Table: ${order.table}` : null,
    `Customer: ${order.customerName || 'N/A'}${order.phone ? ` (${order.phone})` : ''}`,
    order.deliveryAddress ? `Address: ${order.deliveryAddress}` : null,
    '',
    items,
    '',
    `Total: ₹${order.total ?? order.subtotal ?? 'N/A'}`,
    order.paymentMethod ? `Payment: ${order.paymentMethod} (${order.paymentStatus || 'N/A'})` : null,
    order.instructions || order.note ? `Note: ${order.instructions || order.note}` : null,
  ].filter((line) => line !== null).join('\n');
}

async function sendEmail(order, text) {
  const { ALERT_EMAIL_USER, ALERT_EMAIL_PASS, ALERT_EMAIL_TO } = process.env;
  if (!ALERT_EMAIL_USER || !ALERT_EMAIL_PASS || !ALERT_EMAIL_TO) return false;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: ALERT_EMAIL_USER,
      pass: ALERT_EMAIL_PASS.replace(/\s+/g, ''), // app passwords are shown with spaces
    },
  });

  await transporter.sendMail({
    from: `7th Sky Orders <${ALERT_EMAIL_USER}>`,
    to: ALERT_EMAIL_TO,
    subject: `New ${order.orderType || ''} order ${order.orderNumber || order.id || ''} - ₹${order.total ?? order.subtotal ?? ''}`,
    text,
  });
  return true;
}

async function sendPush(order, text) {
  const { NTFY_TOPIC } = process.env;
  if (!NTFY_TOPIC) return false;

  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(NTFY_TOPIC)}`, {
    method: 'POST',
    headers: {
      Title: `New order ${order.orderNumber || order.id || ''}`.trim(),
      Priority: 'high',
      Tags: 'shopping_cart',
    },
    body: text,
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`);
  return true;
}

async function sendTwilio(text) {
  const { TWILIO_SID, TWILIO_TOKEN, TWILIO_WHATSAPP_FROM, OWNER_WHATSAPP } = process.env;
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WHATSAPP_FROM || !OWNER_WHATSAPP) return false;

  await twilio(TWILIO_SID, TWILIO_TOKEN).messages.create({
    from: TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${OWNER_WHATSAPP}`,
    body: text,
  });
  return true;
}

export async function notifyOwner(order) {
  const text = buildMessage(order);
  const results = await Promise.allSettled([
    sendEmail(order, text),
    sendPush(order, text),
    sendTwilio(text),
  ]);

  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('Order alert failed:', r.reason?.message || r.reason));

  if (!results.some((r) => r.status === 'fulfilled' && r.value)) {
    console.warn('No order alert was sent: check your alert settings.');
  }
}