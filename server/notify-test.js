import { notificationStatus, notifyNewOrder } from './notify.js';

try {
  process.loadEnvFile();
} catch {
  console.log('No .env file found in this folder; using the normal environment only.');
}
console.log('Channels configured:', notificationStatus());
await notifyNewOrder({
  orderNumber: '7S-TEST-0001',
  orderType: 'dine-in',
  table: '5',
  customerName: 'Test guest',
  phone: '',
  deliveryAddress: '',
  instructions: '',
  paymentStatus: 'Not Paid',
  subtotal: 450,
  items: [{ name: 'Chicken Biriyani', quantity: 1, price: 450 }],
});
console.log('Done. Check your phone (ntfy) and your inbox, including spam.');