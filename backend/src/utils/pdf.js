// Generates a clean PDF receipt for a booking.
// Uses pdfkit's built-in fonts only — no external font files needed.
//
// Streams the PDF directly to the response so we don't buffer the whole
// file in memory; works fine for typical receipt sizes (~5KB each).

const PDFDocument = require('pdfkit');

const BRAND_ORANGE = '#E85A1E';
const TEXT_DARK    = '#1a1a2e';
const TEXT_MUTED   = '#888888';
const RULE_COLOR   = '#e5e5e5';

/**
 * Stream a receipt PDF to the given Express response object.
 * @param {object} booking — joined booking row with all the fields below
 * @param {object} res — Express response (we set headers + pipe)
 */
function streamReceipt(booking, res) {
  const filename = `bookalocal-receipt-${booking.booking_ref}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  // ─── Header ─────────────────────────────────────────────────────────
  doc
    .fillColor(BRAND_ORANGE)
    .font('Helvetica-Bold').fontSize(24)
    .text('bookalocal', 50, 50);

  doc
    .fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
    .text('Local Guide Marketplace · Nepal', 50, 78);

  doc
    .fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(20)
    .text('RECEIPT', 400, 50, { width: 145, align: 'right' });

  doc
    .fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
    .text(`Ref: ${booking.booking_ref}`, 400, 75, { width: 145, align: 'right' })
    .text(`Issued: ${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}`, 400, 90, { width: 145, align: 'right' });

  doc.moveTo(50, 120).lineTo(545, 120).strokeColor(RULE_COLOR).stroke();

  // ─── Billed to ──────────────────────────────────────────────────────
  let y = 145;
  doc
    .fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
    .text('BILLED TO', 50, y);
  doc
    .fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(11)
    .text(`${booking.traveler_first} ${booking.traveler_last}`, 50, y + 14);
  doc
    .fillColor(TEXT_MUTED).font('Helvetica').fontSize(10)
    .text(booking.traveler_email || '', 50, y + 30);

  doc
    .fillColor(TEXT_MUTED).fontSize(9)
    .text('GUIDE', 320, y);
  doc
    .fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(11)
    .text(`${booking.guide_first} ${booking.guide_last}`, 320, y + 14);
  doc
    .fillColor(TEXT_MUTED).font('Helvetica').fontSize(10)
    .text(booking.city || 'Nepal', 320, y + 30);

  // ─── Experience details ─────────────────────────────────────────────
  y = 220;
  doc
    .fillColor(TEXT_MUTED).fontSize(9)
    .text('EXPERIENCE', 50, y);
  doc
    .fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(13)
    .text(booking.listing_title || 'Experience', 50, y + 14, { width: 495 });

  const detailY = y + 50;
  const details = [
    ['Date', booking.booking_date ? new Date(booking.booking_date).toLocaleDateString('en-GB', { dateStyle: 'long' }) : '—'],
    ['Persons', `${booking.num_persons} ${booking.num_persons === 1 ? 'person' : 'people'}`],
    ['Duration', formatDuration(booking)],
    ['Booking status', capitalize(booking.status || 'pending')],
    ['Payment status', capitalize(booking.payment_status || 'pending')],
  ];

  details.forEach(([label, value], i) => {
    const dy = detailY + i * 18;
    doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(10).text(label, 50, dy, { width: 130 });
    doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(10).text(value, 180, dy);
  });

  // ─── Charges ────────────────────────────────────────────────────────
  y = detailY + details.length * 18 + 30;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(RULE_COLOR).stroke();
  y += 15;

  doc.fillColor(TEXT_MUTED).fontSize(9).text('CHARGES', 50, y);
  y += 18;

  const total      = num(booking.total_amount);
  const platform   = num(booking.platform_commission);
  const guideShare = num(booking.guide_amount);

  const charges = [
    ['Experience price (total)', `NPR ${total.toLocaleString()}`, false],
    ['Platform fee (15%) — paid online', `NPR ${platform.toLocaleString()}`, false],
    ['Guide fee (85%) — paid in person', `NPR ${guideShare.toLocaleString()}`, false],
  ];

  charges.forEach(([label, value]) => {
    doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(10).text(label, 50, y);
    doc.text(value, 50, y, { width: 495, align: 'right' });
    y += 18;
  });

  y += 6;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(RULE_COLOR).stroke();
  y += 12;

  // Total paid online row (the part that's actually a receipt for money received)
  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(12)
    .text(booking.payment_status === 'paid' ? 'Paid online (this receipt)' : 'Due online', 50, y);
  doc.text(`NPR ${platform.toLocaleString()}`, 50, y, { width: 495, align: 'right' });
  y += 22;

  if (booking.payment_status === 'paid') {
    doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
      .text(`Charged via Stripe${booking.stripe_charge_id ? ` · ID: ${booking.stripe_charge_id}` : ''}`, 50, y);
    y += 14;
  }

  // ─── Footer ─────────────────────────────────────────────────────────
  const footerY = 770;
  doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor(RULE_COLOR).stroke();
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(8)
    .text('Bookalocal Pvt. Ltd. · Kathmandu, Nepal · support@bookalocal.com', 50, footerY + 8, { width: 495, align: 'center' })
    .text('This receipt is for the platform fee only. The guide fee is paid directly to the guide on the day of the experience.', 50, footerY + 22, { width: 495, align: 'center' });

  doc.end();
}

// ─── Helpers ──────────────────────────────────────────────────────────
function num(v) { return parseFloat(v || 0); }

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function formatDuration(b) {
  if (b.pricing_type === 'hourly')  return `${b.duration_hours || 1} hour${(b.duration_hours || 1) === 1 ? '' : 's'}`;
  if (b.pricing_type === 'daily')   return `${b.duration_days || 1} day${(b.duration_days || 1) === 1 ? '' : 's'}`;
  if (b.pricing_type === 'package') return 'Package';
  return '—';
}

module.exports = { streamReceipt };
