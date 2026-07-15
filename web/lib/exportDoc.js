import PDFDocument from 'pdfkit';

// Shared CSV + PDF table builders for the downloadable reports.
// A column is { key, label, w? (pdf width), format? (value, row) => string }.

function cell(col, row) {
  const raw = row[col.key];
  if (col.format) return col.format(raw, row);
  if (raw === true) return 'Yes';
  if (raw === false) return 'No';
  if (raw === null || raw === undefined) return '';
  if (/_at$/.test(col.key) && raw) return new Date(raw).toLocaleString();
  return String(raw);
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(cols, rows, preamble = []) {
  const lines = preamble.map((p) => csvCell(p));
  lines.push(cols.map((c) => csvCell(c.label)).join(','));
  for (const r of rows) lines.push(cols.map((c) => csvCell(cell(c, r))).join(','));
  return lines.join('\n');
}

// Renders a paginated table. Returns a Promise<Buffer>.
export function buildTablePdf({ title, subtitle, cols, rows, landscape = true }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: landscape ? 'landscape' : 'portrait' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(title, { align: 'center' });
    if (subtitle) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#555').text(subtitle, { align: 'center' });
    }
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#777').text(
      `Generated ${new Date().toLocaleString()} · ${rows.length} row(s)`,
      { align: 'center' }
    );
    doc.moveDown(0.8).fillColor('#000');

    const startX = doc.x;
    let y = doc.y;
    const rowH = 16;
    const totalW = cols.reduce((a, c) => a + (c.w || 80), 0);

    function drawRow(values, opts = {}) {
      let x = startX;
      doc.fontSize(8).fillColor(opts.color || '#000');
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
      cols.forEach((c, i) => {
        doc.text(values[i] ?? '', x + 2, y + 4, {
          width: (c.w || 80) - 4, height: rowH, ellipsis: true, lineBreak: false,
        });
        x += c.w || 80;
      });
      y += rowH;
    }

    function header() {
      drawRow(cols.map((c) => c.label), { bold: true });
      doc.moveTo(startX, y + 2).lineTo(startX + totalW, y + 2).stroke();
      y += 4;
    }

    header();
    for (const r of rows) {
      if (y > doc.page.height - 40) {
        doc.addPage();
        y = doc.y;
        header();
      }
      const st = String(r.status || '').toLowerCase();
      drawRow(cols.map((c) => cell(c, r)), {
        color: st === 'denied' ? '#b00000' : st === 'absent' ? '#7c2d12' : '#000',
      });
    }
    doc.end();
  });
}

// Content-Disposition headers for a download response.
export const fileHeaders = (type, filename) => ({
  'Content-Type': type,
  'Content-Disposition': `attachment; filename="${filename}"`,
  'Cache-Control': 'no-store',
});

// Safe, readable filename stem for a class, e.g. "CS-301_A_Fall-2026".
export const slug = (...parts) =>
  parts.filter(Boolean).join('_').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
