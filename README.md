# 7th Sky restaurant demo

A responsive restaurant ordering demo built from an initially empty repository
with React, Vite, and React Router.

## Run locally

```sh
npm install
npm run dev
```

Create a production bundle with `npm run build`; preview it with
`npm run preview`.

## Demo features

- Homepage slideshow and takeaway/dine-in choice.
- Searchable menu with Biriyani and Mandi categories, availability, quantities,
  a persistent cart, and the restaurant’s current eight seeded dishes.
- Eight seeded dishes with uploaded food photographs and demo prices in rupees.
- Cart editing and a validated, explicitly labelled demo payment page with
  simulated card and UPI flows, ten-digit Indian mobile validation, and a
  dedicated payment-success page. No payment is collected or processed;
  payable QR payments require a verified payment-gateway integration.
- Kitchen and owner demo dashboards with browser-local demo sign-in.
- Kitchen order status summaries and step actions, plus owner menu editing,
  order overview, status filters, and configurable table QR-code generation.
- Menu, cart, chosen order type, orders, and menu edits stored in this browser's
  local storage.
- Homepage-specific header and footer styling, with a shared dark-green header
  and footer on other customer pages. Kitchen and owner routes use separate
  operational headers and do not display customer navigation or footers.
- Client-side checkout locking and per-attempt identifiers prevent repeat
  submissions from creating duplicate orders in the same browser session.

## Demo logins

- Kitchen: `kitchen` / `kitchen123`
- Owner: `owner` / `owner123`

These are public demo credentials. Authentication and role checks exist only in
the frontend and browser storage; they are **not secure and must not be used in
production**. There is no backend, shared database, server-side authorization,
or real-time service. Orders are visible only in the same browser profile.

## Restaurant brand, menu, and photos

- The transparent wordmark in `public/images/restaurant/wordmark.png` is used
  in the homepage, customer page headers and footers, and the separate
  operations header. It is cropped from the supplied `logo.jpg.jpeg` source,
  which is preserved unchanged.
- The homepage slideshow uses only the four remaining restaurant images,
  `hero-01.jpg.png` through `hero-04.jpg.png`. They are displayed from their
  original files without fallbacks or upscaling; their native dimensions are
  recorded in the restaurant asset README.
- The homepage delivery tile uses the uploaded Chicken Biriyani photo, and the
  “Make an evening” story section uses the uploaded Beef Mandi photo.
- The menu data, categories, prices, descriptions, and image paths live in
  `src/data.js`. Prices are examples, not verified restaurant prices.
- Uploaded photos are used for all eight seeded menu dishes. See
  `public/images/menu/README.md` for the photo manifest.

## Demo ordering limitations

- Dine-in table numbers are detected from `/?table=<number>` URLs and retained
  in the browser’s local storage. Owner users can configure up to 50 tables and
  download/print a separate QR code for each one.
- Completed demo orders appear only in the same browser’s local kitchen board.
  Cross-device kitchen delivery requires a shared backend and database.
- Card and UPI entry are validated demo simulations only. Values are not sent
  to a payment provider or saved with orders. A real gateway, server-side
  payment verification, and configured merchant account are required for live
  payments. Payment QR codes are intentionally unavailable until that
  integration exists; table-order QR codes are not payment QR codes.

- Business address, phone, opening hours, and social links have been omitted
  rather than invented.

## Before production

This is a local demonstration, not a production ordering or payment system.
Add a backend and database; validate all inputs and enforce role-based access on
the server; configure managed authentication without public privileged
registration; create idempotent server-side orders; integrate a payment gateway
and verify payment signatures server-side; and add shared order updates,
deployment secrets, monitoring, privacy/security review, and production tests.
Never collect raw card numbers, CVVs, UPI PINs, or banking passwords in this
app.
