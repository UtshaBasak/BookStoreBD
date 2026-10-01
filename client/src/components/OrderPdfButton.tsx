import { useState } from 'react';
import { FaFilePdf } from 'react-icons/fa';

import type { OrderDetail } from '@shared/api.js';

import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
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
      toast.error('Could not make the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={() => void download()} disabled={busy}>
      <FaFilePdf aria-hidden="true" />
      {busy ? 'Preparing PDF...' : 'Download PDF'}
    </button>
  );
}
