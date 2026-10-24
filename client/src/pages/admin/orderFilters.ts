import { t } from '../../utils/language.js';
import { statusLabel } from '../../utils/orderStatus.js';

/**
 * The status and sort choices every order list offers, in the API's spelling.
 * Each `label` is a getter, so it is worded in the language shown when it is
 * read, not the one the page first loaded in.
 */
const status = (value: string) => ({
  value,
  get label() {
    return statusLabel(value);
  },
});

export const ORDER_STATUS_FILTER = [
  {
    value: '',
    get label() {
      return t('Any status', 'যেকোনো অবস্থা');
    },
  },
  status('Order Confirmed'),
  status('Processing'),
  status('Shipped'),
  status('Out for Delivery'),
  status('Delivered'),
  status('Cancelled'),
];

export const ORDER_SORTS = [
  {
    value: 'newest',
    get label() {
      return t('Newest first', 'নতুন আগে');
    },
  },
  {
    value: 'oldest',
    get label() {
      return t('Oldest first', 'পুরোনো আগে');
    },
  },
  {
    value: 'totalHigh',
    get label() {
      return t('Total: high to low', 'মোট: বেশি থেকে কম');
    },
  },
  {
    value: 'totalLow',
    get label() {
      return t('Total: low to high', 'মোট: কম থেকে বেশি');
    },
  },
];
