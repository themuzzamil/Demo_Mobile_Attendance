import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fetchRecords } from '@/lib/reports';

export const runtime = 'nodejs';

function buildPdf(rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Attendance Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#555').text(
      `Generated ${new Date().toLocaleString()}  |  ${rows.length} record(s)`,
      { align: 'center' }
    );
    doc.moveDown(0.8).fillColor('#000');

    const cols = [
      { key: 'created_at', label: 'Date/Time', w: 110 },
      { key: 'student_name', label: 'Student', w: 100 },
      { key: 'roll_no', label: 'Roll No', w: 60 },
      { key: 'subject', label: 'Subject', w: 90 },
      { key: 'section', label: 'Sec', w: 35 },
      { key: 'status', label: 'Status', w: 55 },
      { key: 'ip_ok', label: 'IP Match', w: 55 },
      { key: 'ip_address', label: 'IP Address', w: 95 },
      { key: 'reason', label: 'Reason', w: 120 },
    ];

    const startX = doc.x;
    let y = doc.y;
    const rowH = 16;

    function drawRow(values, opts = {}) {
      let x = startX;
      doc.fontSize(8).fillColor(opts.color || '#000');
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
      cols.forEach((c, idx) => {
        let v = values[idx];
        if (v === true) v = 'Yes';
        if (v === false) v = 'No';
        if (c.key === 'created_at' && v) v = new Date(v).toLocaleString();
        doc.text(v == null ? '' : String(v), x + 2, y + 4, {
          width: c.w - 4, height: rowH, ellipsis: true, lineBreak: false,
        });
        x += c.w;
      });
      y += rowH;
    }

    drawRow(cols.map((c) => c.label), { bold: true });
    doc.moveTo(startX, y + 2).lineTo(startX + cols.reduce((a, c) => a + c.w, 0), y + 2).stroke();
    y += 4;

    for (const r of rows) {
      if (y > doc.page.height - 40) {
        doc.addPage();
        y = doc.y;
        drawRow(cols.map((c) => c.label), { bold: true });
        y += 4;
      }
      drawRow(cols.map((c) => r[c.key]), {
        color: r.status === 'denied' ? '#b00000' : '#000',
      });
    }
    doc.end();
  });
}

export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const rows = await fetchRecords(user, searchParams);
  await audit(request, user.id, 'report.pdf', { count: rows.length });

  const pdf = await buildPdf(rows);
  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="attendance.pdf"',
    },
  });
}
