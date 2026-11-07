# 7th Sky Restaurant

React + Vite website with an Express + SQLite server. Orders are stored in a real database,
so the customer's phone, The Kitchen and the Owner desk all see the same live data.

## Run it

```sh
npm install
npm run dev
```

- Website: http://localhost:5173 (also reachable from phones on the same Wi-Fi at `http://<your-computer-ip>:5173`)
- API: http://localhost:3001 (started automatically by `npm run dev`)

Production: `npm run build` then `npm start` (Express serves the built site and the API on `PORT`).

## Staff logins

Defaults (change them for a real restaurant by copying `.env.example` to `.env`):

| Portal  | Username | Password   |
| ------- | -------- | ---------- |
| Kitchen | kitchen  | kitchen123 |
| Owner   | owner    | owner123   |

## How orders work

- Dine-in (via the table QR code): placed straight away, payment status **Not Paid**.
- Takeaway and delivery: customer picks card, UPI or QR and pays; the order is saved as **Paid**.
- The Kitchen changes the status from a dropdown. The options depend on the order type:
  - Dine-in: Placed, Preparing, Ready, Delivered, Completed
  - Delivery: Placed, Preparing, Ready, On the way, Completed
  - Takeaway: Placed, Preparing, Ready, At reception, Completed
- The customer's order page (`/order/<order number>`, or **Track order** in the menu) refreshes every
  4 seconds and shows the status (for example "At reception" shows as "Ready for pickup").
- The Owner desk shows all orders read-only.

## Notes

- The database file lives in `server/data/` (set `DATA_DIR` to use a different folder). When deploying,
  use a host with a persistent disk, otherwise the file is wiped on each restart.
- Payment is an in-app step only. No real payment gateway is connected, so no money is processed.
- Menu edits made on the Owner desk are still stored in that browser only.