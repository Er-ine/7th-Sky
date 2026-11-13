import nodemailer from "nodemailer";

function settings() {
  const emailUser =
    process.env.ALERT_EMAIL_USER ||
    process.env.EMAIL_USER ||
    process.env.SMTP_USER ||
    "";

  const emailPass =
    process.env.ALERT_EMAIL_PASS ||
    process.env.EMAIL_PASS ||
    process.env.EMAIL_PASSWORD ||
    process.env.SMTP_PASS ||
    "";

  const emailTo =
    process.env.ALERT_EMAIL_TO ||
    process.env.EMAIL_TO ||
    process.env.NOTIFY_EMAIL ||
    "";

  const emailService = process.env.EMAIL_SERVICE || "gmail";

  const ntfyTopic = process.env.NTFY_TOPIC || "";
  const ntfyUrl = process.env.NTFY_URL || "";
  const ntfyServer = (
    process.env.NTFY_SERVER || "https://ntfy.sh"
  ).replace(/\/+$/, "");

  const ntfyToken = process.env.NTFY_TOKEN || "";

  let finalNtfyUrl = "";

  if (ntfyUrl) {
    finalNtfyUrl = ntfyUrl;
  } else if (ntfyTopic) {
    finalNtfyUrl = `${ntfyServer}/${ntfyTopic}`;
  }

  return {
    emailUser,
    emailPass,
    emailTo,
    emailService,
    ntfyUrl: finalNtfyUrl,
    ntfyToken,
  };
}

export function notificationStatus() {
  const config = settings();

  return {
    ntfy: Boolean(config.ntfyUrl),
    email: Boolean(
      config.emailUser &&
      config.emailPass &&
      config.emailTo
    ),
  };
}

async function sendNtfy(order) {
  const config = settings();

  if (!config.ntfyUrl) {
    return;
  }

  const orderId = order.orderId || order.id || "New Order";

  const message = [
    "New order received at 7th Sky!",
    "",
    `Order ID: ${orderId}`,
    `Customer: ${order.customerName || "Customer"}`,
    `Phone: ${order.phone || "Not provided"}`,
    `Order Type: ${order.orderType || order.mode || "Not specified"}`,
    `Total: ₹${order.total || 0}`,
  ].join("\n");

  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    Title: "7th Sky - New Order",
    Priority: "high",
    Tags: "bell,food",
  };

  if (config.ntfyToken) {
    headers.Authorization = `Bearer ${config.ntfyToken}`;
  }

  const response = await fetch(config.ntfyUrl, {
    method: "POST",
    headers,
    body: message,
  });

  if (!response.ok) {
    const responseText = await response.text();

    throw new Error(
      `ntfy failed: ${response.status} ${response.statusText} - ${responseText}`
    );
  }

  console.log(`[ntfy] Notification sent for order ${orderId}`);
}

async function sendEmail(order) {
  const config = settings();

  if (
    !config.emailUser ||
    !config.emailPass ||
    !config.emailTo
  ) {
    return;
  }

  let transporter;

  if (config.emailService.toLowerCase() === "gmail") {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.emailUser,
        pass: config.emailPass,
      },
    });
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: config.emailUser,
        pass: config.emailPass,
      },
    });
  }

  const orderId = order.orderId || order.id || "New Order";

  const items = Array.isArray(order.items)
    ? order.items
        .map((item) => {
          const name = item.name || item.itemName || "Item";
          const quantity = item.quantity || 1;
          const price = item.price || 0;

          return `${name} x ${quantity} - ₹${price * quantity}`;
        })
        .join("\n")
    : "Order items unavailable";

  const total = order.total || 0;

  const mailOptions = {
    from: `"7th Sky Restaurant" <${config.emailUser}>`,
    to: config.emailTo,
    subject: `New Order Received - ${orderId}`,
    text: `
A new order has been received at 7th Sky Restaurant.

ORDER DETAILS
----------------------------

Order ID: ${orderId}
Customer: ${order.customerName || "Not provided"}
Phone: ${order.phone || "Not provided"}
Order Type: ${order.orderType || order.mode || "Not specified"}

ITEMS
----------------------------

${items}

----------------------------
Total Amount: ₹${total}

Please check the 7th Sky kitchen dashboard for the complete order details.
`,
  };

  await transporter.sendMail(mailOptions);

  console.log(`[email] Notification sent for order ${orderId}`);
}

export async function notifyNewOrder(order) {
  const config = settings();
  const status = notificationStatus();

  if (!status.ntfy && !status.email) {
    console.warn("[notify] No notification channel is configured.");
    return;
  }

  const tasks = [];

  if (status.ntfy) {
    tasks.push(
      sendNtfy(order).catch((error) => {
        console.error("[ntfy] FAILED:", error.message);
      })
    );
  }

  if (status.email) {
    tasks.push(
      sendEmail(order).catch((error) => {
        console.error("[email] FAILED:", error.message);
      })
    );
  }

  await Promise.allSettled(tasks);
}