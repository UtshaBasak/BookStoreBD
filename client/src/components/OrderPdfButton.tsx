import { useState } from 'react';
import { FaFilePdf } from 'react-icons/fa';

import type { OrderDetail } from '@shared/api.js';

import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { t } from '../utils/language.js';
import type { PdfRole } from '../utils/orderPdf.js';

/** Downloads the order as a PDF laid out for the person looking (utils/orderPdf.ts). */
export default function OrderPdfButton({
  order,
  role,
  className = 'btn btn-ghost',
}: {
  order: OrderDetail;
  role: PdfRole;
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { downloadOrderPdf } = await import('../utils/orderPdf.js');
      await downloadOrderPdf(order, role, getUserEmail());
    } catch {
      toast.error(t('Could not make the PDF. Please try again.', 'PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={() => void download()} disabled={busy}>
      <FaFilePdf aria-hidden="true" />
      {busy ? t('Preparing PDF...', 'PDF তৈরি হচ্ছে...') : t('Download PDF', 'PDF ডাউনলোড করুন')}
    </button>
  );
}
