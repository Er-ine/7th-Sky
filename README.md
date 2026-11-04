# 7th Sky Restaurant

A responsive restaurant website built with React, Vite, and React Router.

## Run locally

```sh
npm install
npm run dev
```

Create a production bundle with `npm run build`; preview it with
`npm run preview`.

## Website features

- Restaurant homepage with a full-width photo slideshow and ordering options.
- Searchable Biriyani and Mandi menu with availability controls, quantities,
  food photography, and a persistent cart.
- Dine-in table selection through table QR codes, plus takeaway and delivery
  ordering.
- Customer checkout and order confirmation pages.
- Separate kitchen and owner dashboards for order status, menu management,
  and table QR code generation.
- Menu, cart, chosen order type, table number, orders, and menu edits stored in
  the current browser.

## Restaurant identity and photographs

- The transparent wordmark at `public/images/restaurant/wordmark.png` is used
  throughout the website.
- The homepage slideshow uses the four supplied restaurant photographs listed
  in `public/images/restaurant/README.md`.
- The menu photographs and their dish matches are listed in
  `public/images/menu/README.md`.
- Menu items, categories, prices, descriptions, and image paths are maintained
  in `src/data.js`.

## Ordering and payment information

- Orders are saved in the current browser only. They are not shared with a
  restaurant server or other devices.
- Sign-in and role checks run in the browser and are not server-protected.
- The in-app payment step marks takeaway and delivery orders as Paid when
  placed. Dine-in orders remain Not Paid and are associated with their table.
- Payment statuses are stored with browser-local orders; no external payment
  provider or financial transaction is configured.
- Payment QR codes are unavailable. Table QR codes only open the ordering page
  with a table number.
- No business address, phone number, opening hours, or social accounts have
  been supplied for publication.

Connect a secure backend, server-side authentication, shared order storage,
verified payment processing, and the restaurant's confirmed contact details
before using this website to accept live online orders.
