import type { OrderDetail, OrderLine } from '@shared/api.js';

import { site } from '../config/site.js';
import { CANCELLED } from './orderTotals.js';

export type PdfRole = 'buyer' | 'seller' | 'admin';

/**
 * An order as a PDF, laid out for whoever is downloading it.
 *
 * - The buyer gets a receipt: every book, the delivery address, what they pay.
 * - A seller gets a slip for their own books only: who ordered, where it goes
 *   (the area, as their order page shows it), and what they will be paid.
 * - An administrator gets everything.
 *
 * Drawn as HTML and photographed into the PDF rather than typeset by the PDF
 * library: titles are often Bangla, and only the browser shapes Bangla
 * correctly - a PDF font would print the letters unjoined. Both libraries are
 * loaded only when somebody asks for a PDF.
 */

const escape = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const taka = (amount: number): string => `৳${(Math.round(amount * 100) / 100).toFixed(2)}`;
const when = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const INK = '#111827';
const MUTED = '#6b7280';
const BRAND = '#6d28d9';
const LINE = '#e5e7eb';

const row = (cells: string[], { head = false, struck = false } = {}) =>
  `<tr>${cells
    .map(
      (cell, i) =>
        `<${head ? 'th' : 'td'} style="padding:9px 10px;border-bottom:1px solid ${LINE};text-align:${i === 0 ? 'left' : 'right'};${
          head ? `font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};` : `font-size:13px;color:${INK};`
        }${struck ? `text-decoration:line-through;color:${MUTED};` : ''}">${cell}</${head ? 'th' : 'td'}>`
    )
    .join('')}</tr>`;

const facts = (pairs: [string, string][]) =>
  pairs
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<div style="margin:0 0 6px;font-size:13px;"><span style="display:inline-block;min-width:118px;color:${MUTED};">${escape(label)}</span><span style="color:${INK};font-weight:600;">${escape(value)}</span></div>`
    )
    .join('');

const box = (title: string, inner: string) =>
  `<div style="flex:1;min-width:0;padding:14px 16px;border:1px solid ${LINE};border-radius:12px;">
  <div style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${BRAND};">${escape(title)}</div>${inner}</div>`;

const lineCells = (line: OrderLine, withSeller: boolean): string[] => {
  const quantity = Number(line.quantity) || 1;
  const price = Number(line.price) || 0;
  const cancelled = line.status === CANCELLED;
  return [
    `<strong>${escape(line.title || 'A book')}</strong><br><span style="color:${MUTED};font-size:12px;">${escape(line.author || '')}${
      withSeller ? ` · sold by ${escape(line.sellerEmail)}` : ''
    }${cancelled ? ' · cancelled' : ''}</span>`,
    String(quantity),
    taka(price),
    taka(price * quantity),
  ];
};

/** The page to photograph. */
export const orderPdfHtml = (order: OrderDetail, role: PdfRole, viewerEmail?: string | null): string => {
  const all = order.books ?? [];
  const lines = role === 'seller' ? all.filter((line) => line.sellerEmail === viewerEmail) : all;
  const live = lines.filter((line) => line.status !== CANCELLED);
  const booksTotal = live.reduce((sum, line) => sum + (Number(line.price) || 0) * (Number(line.quantity) || 1), 0);
  const fee = Math.round(booksTotal * site.sellerFeePercent) / 100;

  const title = role === 'seller' ? 'Seller order slip' : role === 'admin' ? 'Order record' : 'Order receipt';
  const area = [order.deliveryDistrict, order.deliveryDivision].filter(Boolean).join(', ');
  const address = [order.deliveryAddress, area].filter(Boolean).join(', ');

  const people =
    role === 'seller'
      ? box('Buyer', facts([['Name', order.contactName ?? ''], ['E-mail', order.buyerEmail], ['Delivery area', area]]))
      : box(
          role === 'buyer' ? 'Deliver to' : 'Buyer and delivery',
          facts([
            ['Name', order.contactName ?? ''],
            ['Phone', order.contactPhone ?? ''],
            ...(role === 'admin' ? ([['E-mail', order.buyerEmail]] as [string, string][]) : []),
            ['Address', address],
          ])
        );

  // Totals as label and amount, the last one - what changes hands - in bold.
  const totals = (pairs: [string, string][], note = '') =>
    `<table style="width:100%;border-collapse:collapse;">${pairs
      .map(
        ([label, value], i) =>
          `<tr><td style="padding:4px 0;font-size:13px;color:${i === pairs.length - 1 ? INK : MUTED};${i === pairs.length - 1 ? 'font-weight:800;border-top:1px solid #ddd6fe;padding-top:8px;' : ''}">${escape(label)}</td><td style="padding:4px 0;text-align:right;font-size:${i === pairs.length - 1 ? 16 : 13}px;font-weight:${i === pairs.length - 1 ? 800 : 600};color:${INK};${i === pairs.length - 1 ? 'border-top:1px solid #ddd6fe;padding-top:8px;' : ''}">${escape(value)}</td></tr>`
      )
      .join('')}</table>${note ? `<div style="margin-top:8px;font-size:11px;color:${MUTED};">${escape(note)}</div>` : ''}`;

  const summary =
    role === 'seller'
      ? totals(
          [
            ['Your books', taka(booksTotal)],
            [`${site.name} fee (${site.sellerFeePercent}%)`, `- ${taka(fee)}`],
            ['You receive', taka(booksTotal - fee)],
          ],
          `Paid by bKash once it is delivered and the ${site.returns.windowDays}-day return window has closed.`
        )
      : totals([
          ['Books', taka(Number(order.booksTotal) || 0)],
          ['Delivery', Number(order.shippingCost) ? taka(Number(order.shippingCost)) : 'Free'],
          ...(Number(order.discount) ? ([[`Discount${order.promo ? ` (${order.promo})` : ''}`, `- ${taka(Number(order.discount))}`]] as [string, string][]) : []),
          [role === 'buyer' ? 'To pay on delivery' : 'Order total', taka(Number(order.totalCost) || 0)],
        ]);

  return `<div style="width:794px;box-sizing:border-box;padding:44px 48px;background:#fff;font-family:'Plus Jakarta Sans','Segoe UI','Noto Sans Bengali','Nirmala UI',Arial,sans-serif;color:${INK};">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:18px;border-bottom:3px solid ${BRAND};">
    <div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-.5px;">BookStore<span style="color:#ff5c35;">BD</span></div>
      <div style="margin-top:2px;font-size:12px;color:${MUTED};">${escape(site.tagline)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:800;color:${BRAND};">${escape(title)}</div>
      <div style="margin-top:4px;font-family:'Courier New',monospace;font-size:14px;font-weight:700;">#${escape(order.orderNumber)}</div>
    </div>
  </div>

  <div style="display:flex;gap:14px;margin:20px 0;">
    ${box('Order', facts([
      ['Placed on', when(order.createdAt)],
      ['Status', order.status || 'Order Confirmed'],
      ['Payment', order.paymentMethod || site.payment],
    ]))}
    ${people}
  </div>

  <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
    <thead>${row(['Book', 'Qty', 'Price', 'Total'], { head: true })}</thead>
    <tbody>${lines.map((line) => row(lineCells(line, role !== 'seller'), { struck: line.status === CANCELLED })).join('')}</tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin:0 0 18px;">
    <div style="width:380px;padding:14px 16px;border-radius:12px;background:#f3efff;">${summary}</div>
  </div>

  ${order.buyerNote ? `<div style="margin:0 0 18px;padding:12px 16px;border-radius:12px;background:#fff7ed;color:#9a3412;font-size:13px;"><strong>${role === 'buyer' ? 'Your note to the seller' : 'Note from the buyer'}:</strong> ${escape(order.buyerNote)}</div>` : ''}

  <div style="padding-top:14px;border-top:1px solid ${LINE};font-size:11px;line-height:1.6;color:${MUTED};">
    ${role === 'buyer' ? `Something wrong with a book? You can ask for a return within ${site.returns.windowDays} days of delivery, from your orders.<br>` : ''}
    ${escape(site.name)} · ${escape(site.location)} · ${escape(site.email)} · Downloaded ${escape(when(new Date().toISOString()))}
  </div>
</div>`;
};

/** Draws the order, photographs it and downloads it as a PDF. */
export const downloadOrderPdf = async (order: OrderDetail, role: PdfRole, viewerEmail?: string | null): Promise<void> => {
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);

  // Off screen, but laid out: the wrapper is moved away, the page inside it
  // is not, so its own styles - which are what gets photographed - stay put.
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;';
  holder.innerHTML = orderPdfHtml(order, role, viewerEmail);
  document.body.appendChild(holder);
  try {
    const page = holder.firstElementChild as HTMLElement;
    await document.fonts?.ready;
    const image = await toJpeg(page, { pixelRatio: 2, quality: 0.95, backgroundColor: '#ffffff' });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const picture = new Image();
    picture.src = image;
    await picture.decode();
    const height = (picture.height * pageWidth) / picture.width;

    // A long order runs on to further pages: the same picture, moved up.
    for (let offset = 0; offset < height; offset += pageHeight) {
      if (offset > 0) pdf.addPage();
      pdf.addImage(image, 'JPEG', 0, -offset, pageWidth, height);
    }
    pdf.setProperties({ title: `${site.name} order ${order.orderNumber}`, author: site.name });
    pdf.save(`${site.name}-order-${order.orderNumber}${role === 'seller' ? '-seller' : ''}.pdf`);
  } finally {
    holder.remove();
  }
};
