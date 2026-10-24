import { t } from './language.js';

/**
 * How an order status reads to people. The status itself is data from the
 * server ('Order Confirmed', 'Shipped', 'Cancelled' ...): compare against the
 * raw value and show it through this. Anything unknown is shown as it came.
 */
export const statusLabel = (status: string | null | undefined): string => {
  switch (status) {
    case 'Order Confirmed':
      return t('Order Confirmed', 'অর্ডার নিশ্চিত');
    case 'Processing':
      return t('Processing', 'প্রস্তুত হচ্ছে');
    case 'Shipped':
      return t('Shipped', 'পাঠানো হয়েছে');
    case 'Out for Delivery':
      return t('Out for Delivery', 'ডেলিভারির পথে');
    case 'Delivered':
      return t('Delivered', 'ডেলিভারি হয়েছে');
    case 'Cancelled':
      return t('Cancelled', 'বাতিল');
    case 'Pending':
      return t('Pending', 'অপেক্ষমাণ');
    default:
      return status ?? '';
  }
};

/**
 * How a return request's status reads ('pending' | 'approved' | 'rejected').
 * The English is what the page has always shown, "Return pending" unless it
 * passes its own.
 */
export const returnStatusLabel = (status: string | null | undefined, english = `Return ${status ?? ''}`): string => {
  switch (status) {
    case 'pending':
      return t(english, 'ফেরতের অনুরোধ বিবেচনাধীন');
    case 'approved':
      return t(english, 'ফেরত অনুমোদিত');
    case 'rejected':
      return t(english, 'ফেরত গ্রহণ করা হয়নি');
    default:
      return english;
  }
};
