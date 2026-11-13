
function settings() {
  return {
    apiKey: process.env.RESEND_API_KEY || "",
    from: process.env.RESEND_FROM || "",
    recipients: (process.env.RESEND_TO || "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean),
  };
}

export function notificationStatus() {
  const config = settings();

  return {
    ntfy: false,
    email: Boolean(
      config.apiKey &&
      config.from &&
      config.recipients.length
    ),
  };
}

async function sendEmail(order) {
  const config = settings();

  if (!config.apiKey || !config.from || !config.recipients.length) {
    throw new Error("Resend environment variables are missing.");
  }

  const orderId = order.orderId || order.id || "New Order";

  const items = Array.isArray(order.items)
    ? order.items.map((item) => {
        const name = item.name || item.itemName || "Item";
        const quantity = item.quantity || 1;
        const price = Number(item.price || 0);

        return `${name} x ${quantity} - ₹${price * quantity}`;
      }).join("\n")
    : "Order items unavailable";

  const message = `
A new order has been received at 7th Sky Restaurant!

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
Total Amount: ₹${order.total || 0}

Please check the 7th Sky kitchen dashboard.
`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: config.recipients,
      subject: `New Order Received - ${orderId}`,
      text: message,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Resend API ${response.status}: ${
        result.message || JSON.stringify(result)
      }`
    );
  }

  console.log(
    `[email] Resend accepted order ${orderId}. Email ID: ${result.id}`
  );
}

export async function notifyNewOrder(order) {
  if (!notificationStatus().email) {
    console.warn("[notify] Resend email is not configured.");
    return;
  }

  try {
    await sendEmail(order);
  } catch (error) {
    console.error("[email] FAILED:", error.message);
  }
}
