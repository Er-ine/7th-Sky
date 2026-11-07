
export const ORDER_STATUSES = {
  'dine-in': [
    'Order Placed',
    'Confirmed',
    'Preparing',
    'Ready to Serve',
    'Served',
  ],

  takeaway: [
    'Order Placed',
    'Confirmed',
    'Preparing',
    'Ready for Pickup',
    'Completed',
  ],

  delivery: [
    'Order Placed',
    'Confirmed',
    'Preparing',
    'Ready for Dispatch',
    'Out for Delivery',
    'Delivered',
  ],
};

export function normalizeOrderType(value) {
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  if (['dinein', 'diningin', 'eatin', 'restaurant'].includes(key)) {
    return 'dine-in';
  }

  if (['takeaway', 'pickup'].includes(key)) {
    return 'takeaway';
  }

  if (key === 'delivery') {
    return 'delivery';
  }

  return null;
}

export function normalizeOrderStatus(orderTypeValue, value) {
  const orderType = normalizeOrderType(orderTypeValue);

  const rawStatus = String(value ?? '').trim();

  const key = rawStatus
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const common = {
    orderplaced: 'Order Placed',
    placed: 'Order Placed',
    new: 'Order Placed',
    neworder: 'Order Placed',
    confirmed: 'Confirmed',
    accepted: 'Confirmed',
    preparing: 'Preparing',
  };

  if (common[key]) {
    return common[key];
  }

  if (orderType === 'dine-in') {
    if (['ready', 'readytoserve'].includes(key)) {
      return 'Ready to Serve';
    }

    if (['served', 'delivered', 'completed'].includes(key)) {
      return 'Served';
    }
  }

  if (orderType === 'takeaway') {
    if (['ready', 'atreception', 'readyforpickup'].includes(key)) {
      return 'Ready for Pickup';
    }

    if (['completed', 'pickedup'].includes(key)) {
      return 'Completed';
    }
  }

  if (orderType === 'delivery') {
    if (['ready', 'readyfordispatch'].includes(key)) {
      return 'Ready for Dispatch';
    }

    if (['ontheway', 'outfordelivery'].includes(key)) {
      return 'Out for Delivery';
    }

    if (['delivered', 'completed'].includes(key)) {
      return 'Delivered';
    }
  }

  return rawStatus;
}

export function orderStatusesForType(value) {
  const orderType = normalizeOrderType(value);

  return orderType ? ORDER_STATUSES[orderType] : [];
}
