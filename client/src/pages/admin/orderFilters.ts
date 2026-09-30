/** The status and sort choices every order list offers, in the API's spelling. */
export const ORDER_STATUS_FILTER = [
  { value: '', label: 'Any status' },
  { value: 'Order Confirmed', label: 'Order Confirmed' },
  { value: 'Processing', label: 'Processing' },
  { value: 'Shipped', label: 'Shipped' },
  { value: 'Out for Delivery', label: 'Out for Delivery' },
  { value: 'Delivered', label: 'Delivered' },
  { value: 'Cancelled', label: 'Cancelled' },
];

export const ORDER_SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'totalHigh', label: 'Total: high to low' },
  { value: 'totalLow', label: 'Total: low to high' },
];
