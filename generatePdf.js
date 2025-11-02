const { PDFDocument, StandardFonts, rgb, breakTextIntoLines } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const alpha = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
const lineItemContentStartX = 180;
const MINIMUM_SPACE_NEEDED = 50;
// Keep content above the footer (page number + TREC line). Increase if footer grows.
const FOOTER_BUFFER = 100;
// Default vertical space between image rows in the grid
const ROW_SPACING_DEFAULT = 24;
// Grid layout defaults
const GRID_COLUMNS_DEFAULT = 3; // target number of columns
const GRID_GUTTER = 12;         // horizontal spacing between cells
const GRID_MAX_CELL_HEIGHT = 240; // maximum image height per cell (without caption)
const RIGHT_MARGIN = 20;        // right page margin for content column

function intToRoman(num) {
  if (!Number.isFinite(num) || num <= 0) return '';
  const romans = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = Math.floor(num), res = '';
  for (const [val, sym] of romans) {
    while (n >= val) { res += sym; n -= val; }
  }
  return res;
}

async function addPageTemplate(page, font) {
  const { width, height } = page.getSize();
  const margin = 20;
  page.drawText('Report Identification: 1234 Main Street Denton Texas 76201 - 09/30/2021', {
    x: margin, y: height - 40, size: 12, font, color: rgb(0, 0, 0),
  });
  page.drawText('I=Inspected    NI=Not Inspected    NP=Not Present    D=Deficient', {
    x: margin, y: height - 60, size: 11, font, color: rgb(0, 0, 0),
  });
  page.drawRectangle({
    x: margin, y: height - 95, width: width - margin * 2, height: 26,
    borderColor: rgb(0, 0, 0), borderWidth: 2, color: rgb(1, 1, 1),
  });
  page.drawText('I    NI    NP    D', {
    x: margin + 12, y: height - 95 + 7, size: 10, font, color: rgb(0, 0, 0),
  });
  return height - 120;
}

async function checkAndCreateNewPage(doc, pos, currentPage, font) {
  const { height } = currentPage.getSize();
  if (pos.y < MINIMUM_SPACE_NEEDED) {
    const newPage = doc.addPage();
    const timesRomanFont = await doc.embedFont(StandardFonts.TimesRoman);
    pos.y = await addPageTemplate(newPage, timesRomanFont);
    return newPage;
  }
  return currentPage;
}

// Ensure there's enough vertical space left on the page for a block of content.
// If not, add a new page and return the possibly updated currentPage.
async function ensureSpace(doc, pos, currentPage, font, neededHeight) {
  if (pos.y - neededHeight < FOOTER_BUFFER) {
    currentPage = await checkAndCreateNewPage(doc, pos, currentPage, font);
  }
  return currentPage;
}

function addLineHeaderForLineItem(lineItem, page, font, margin, height, index) {
  const title = alpha[index % 26] + '. ' + (lineItem.title || lineItem.name);
  page.drawText(title, {
    x: lineItemContentStartX, y: height, size: 12, font, color: rgb(0, 0, 0),
  });
}

function addCheckBoxToLineItem(lineItem, page, form, margin, y) {
  const checkboxTypes = ['I', 'NI', 'NP', 'D'];
  const boxSize = 15, spacing = 40;
  checkboxTypes.forEach((type, index) => {
    const checkBox = form.createCheckBox(`lineItem.${lineItem.id}.${type}`);
    let isChecked = false;
    if (lineItem.isDeficient && type === 'D') isChecked = true;
    else if (!lineItem.isDeficient && type === lineItem.inspectionStatus) isChecked = true;
    checkBox.addToPage(page, {
      x: margin + (spacing * index), y, width: boxSize, height: boxSize,
      textColor: rgb(0, 0, 0), backgroundColor: rgb(1, 1, 1), borderColor: rgb(0, 0, 0), borderWidth: 1,
    });
    if (isChecked) checkBox.check();
  });
}

async function addCommentsTitleToLineItem(lineItem, page, font, margin, height, doc) {
  const italicFont = await doc.embedFont(StandardFonts.TimesRomanItalic);
  page.drawText('Comments: ', {
    x: lineItemContentStartX, y: height, size: 10, font: italicFont, color: rgb(0, 0, 0),
  });
}

async function addCommentsToLineItem(comment, page, font, margin, pos, doc, commentIndex) {
  let currentPage = page;
  const romanFont = await doc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await doc.embedFont(StandardFonts.TimesRomanBold);
  const italicFont = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const drawWrapped = async (text, x, maxWidth, size = 10, lineH = 12, useFont = romanFont) => {
    if (!text) return 0;
    const widthFn = t => useFont.widthOfTextAtSize(t, size);
    const lines = breakTextIntoLines(text, [' '], maxWidth, widthFn);
    for (const line of lines) {
      currentPage = await ensureSpace(doc, pos, currentPage, font, lineH);
      currentPage.drawText(line, { x, y: pos.y, size, font: useFont, color: rgb(0,0,0) });
      pos.y -= lineH;
    }
    return lines.length;
  };

  const labelText = `${commentIndex + 1}. ${comment?.label || ''}`;
  // Space for label
  currentPage = await ensureSpace(doc, pos, currentPage, font, 12);
  currentPage.drawText(labelText, { x: lineItemContentStartX, y: pos.y, size: 10, font: boldFont, color: rgb(0,0,0) });
  pos.y -= 12;

  // Comment body text
  const body = comment?.content || comment?.text || comment.commentText || '';
  const contentWidth = currentPage.getSize().width - lineItemContentStartX - 20; // right margin 20
  await drawWrapped(body, lineItemContentStartX, contentWidth, 10, 12, romanFont);

  // Photos: draw in a grid (3 columns by default), scaling to fit each cell
  const photos = Array.isArray(comment.photos) ? comment.photos : [];
  if (photos.length > 0) {
    // Embed all images first
    const embedded = [];
    for (const p of photos) {
      try {
        const img = await fetchAndEmbedImage(p.url, doc);
        if (img) embedded.push({ img, caption: p.caption || '' });
      } catch {}
    }
    if (embedded.length > 0) {
      const columns = Math.min(GRID_COLUMNS_DEFAULT, embedded.length);
      const availW = currentPage.getSize().width - lineItemContentStartX - RIGHT_MARGIN;
      const cellW = Math.floor((availW - (columns - 1) * GRID_GUTTER) / columns);
      const rowSpacing = ROW_SPACING_DEFAULT;

      let i = 0;
      while (i < embedded.length) {
        const row = embedded.slice(i, i + columns);

        // Precompute scaled dims and row height
        const scaled = row.map(item => {
          const s = Math.min(cellW / item.img.width, GRID_MAX_CELL_HEIGHT / item.img.height, 1);
          return {
            img: item.img,
            w: Math.floor(item.img.width * s),
            h: Math.floor(item.img.height * s),
            caption: item.caption
          };
        });
        const captionH = scaled.some(it => it.caption) ? 12 : 0; // simple one-line caption per image
        const rowHeight = Math.max(...scaled.map(it => it.h)) + captionH;

        // Ensure there's space for this whole row; if not, start new page
        currentPage = await ensureSpace(doc, pos, currentPage, font, rowHeight + rowSpacing);

        // Draw the row
        for (let c = 0; c < scaled.length; c++) {
          const it = scaled[c];
          const xCell = lineItemContentStartX + c * (cellW + GRID_GUTTER);
          const xImg = xCell + Math.floor((cellW - it.w) / 2); // center horizontally in cell
          const yTop = pos.y;
          const yImg = yTop - it.h;
          currentPage.drawImage(it.img, { x: xImg, y: yImg, width: it.w, height: it.h });
          if (it.caption) {
            const capY = yImg - 10;
            currentPage.drawText(it.caption, { x: xCell, y: capY, size: 9, font: italicFont, color: rgb(0,0,0) });
          }
        }
        pos.y -= (rowHeight + rowSpacing);
        i += columns;
      }
    }
  }

  pos.y -= 8;
  return currentPage;
}

async function fetchAndEmbedImage(url, doc) {
  // Add a timeout so a slow image host doesn't hang the whole request
  const TIMEOUT_MS = 10000;
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode < 200 || statusCode >= 300) { res.resume(); return resolve(null); }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            const lower = url.toLowerCase();
            if (lower.endsWith('.png')) return resolve(await doc.embedPng(buffer));
            if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return resolve(await doc.embedJpg(buffer));
            try { return resolve(await doc.embedJpg(buffer)); } catch (e1) {
              try { return resolve(await doc.embedPng(buffer)); } catch (e2) { return resolve(null); }
            }
          } catch (err) { return resolve(null); }
        });
      });
      req.setTimeout(TIMEOUT_MS, () => { try { req.destroy(new Error('timeout')); } catch {} });
      req.on('error', () => resolve(null));
    } catch { return resolve(null); }
  });
}

async function createPdf(req, res) {
  const sections = req?.body?.inspection?.sections || [];
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const form = pdfDoc.getForm();
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  let pos = { y: await addPageTemplate(page, timesRomanFont) };
  let currentPage = page;
  const margin = 20;
  for (const [sectionIdx, section] of sections.entries()) {
    // Ensure space for section header
    currentPage = await ensureSpace(pdfDoc, pos, currentPage, timesRomanFont, 40);
    currentPage.drawText(intToRoman(sectionIdx + 1) + ' ' + section.name, {
      x: width / 2 - timesRomanFont.widthOfTextAtSize(section.name, 12) / 2,
      y: pos.y, size: 12, font: timesRomanFont, color: rgb(0, 0, 0),
    });
    pos.y -= 30;
    for (const [index, lineItem] of (section.lineItems || []).entries()) {
      // Ensure space for line-item header + checkboxes
      currentPage = await ensureSpace(pdfDoc, pos, currentPage, timesRomanFont, 70);
      addCheckBoxToLineItem(lineItem, currentPage, form, margin, pos.y);
      addLineHeaderForLineItem(lineItem, currentPage, timesRomanFont, margin, pos.y + 7, index);
      pos.y -= 5;
      // Ensure space for Comments: label
      currentPage = await ensureSpace(pdfDoc, pos, currentPage, timesRomanFont, 20);
      await addCommentsTitleToLineItem(lineItem, currentPage, timesRomanFont, margin, pos.y, pdfDoc);
      pos.y -= 12;
      const defaultComments = [
        { label: 'General Observation', content: 'No specific issues or concerns were observed during the inspection of this item.' },
        { label: 'Maintenance Note', content: 'Regular maintenance and periodic inspection is recommended to ensure optimal performance and longevity.' }
      ];
      const commentsToUse = lineItem?.comments?.length > 0 ? lineItem.comments : defaultComments;
      for (const [commentIndex, comment] of commentsToUse.entries()) {
        const commentText = comment?.content || comment?.text || comment.commentText || '';
        const estimatedLines = Math.ceil(commentText.length / 60);
        const estimatedHeight = (estimatedLines * 12) + 20;
        currentPage = await ensureSpace(pdfDoc, pos, currentPage, timesRomanFont, Math.max(estimatedHeight, 40));
        currentPage = await addCommentsToLineItem(comment, currentPage, timesRomanFont, margin, pos, pdfDoc, commentIndex);
      }
      pos.y -= 15;
    }
    pos.y -= 20;
  }
  // Add footer to every page
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  const footerFont = timesRomanFont;
  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    // Page number centered, smaller font
    page.drawText(`Page ${i + 1} of ${totalPages}`, {
      x: width / 2 - footerFont.widthOfTextAtSize(`Page ${i + 1} of ${totalPages}`, 12) / 2,
      y: 35,
      size: 12,
      font: footerFont,
      color: rgb(0, 0, 0),
    });
    // Left footer (aligned)
    page.drawText('REI 7-6 (8/9/2021)', {
      x: 40,
      y: 20,
      size: 9,
      font: footerFont,
      color: rgb(0, 0, 0),
    });
    // Right footer (aligned)
    const footerTextLeft = 'Promulgated by the Texas Real Estate Commission - (512) 936-3000 - ';
    const footerTextRight = 'www.trec.texas.gov';
    const leftTextWidth = footerFont.widthOfTextAtSize(footerTextLeft, 9);
    const rightTextWidth = footerFont.widthOfTextAtSize(footerTextRight, 9);
    const totalFooterWidth = leftTextWidth + rightTextWidth;
    const startX = width / 2 - totalFooterWidth / 2;
    // Draw left part of footer
    page.drawText(footerTextLeft, {
      x: startX,
      y: 20,
      size: 9,
      font: footerFont,
      color: rgb(0, 0, 0),
    });
    // Draw www.trec.texas.gov as a clickable link
    page.drawText(footerTextRight, {
      x: startX + leftTextWidth,
      y: 20,
      size: 9,
      font: footerFont,
      color: rgb(0, 0, 1), // blue for link
      underline: true,
      link: 'https://www.trec.texas.gov',
    });
  }
  const finalPdfBytes = await pdfDoc.save();
  fs.writeFileSync(path.join(process.cwd(), 'finalPdf.pdf'), finalPdfBytes);
  res.json({ ok: true, message: 'pdf created successfully' });
}

function generatePdf(req, res) {
  createPdf(req, res).catch((err) => {
    console.error('createPdf error', err);
    res.status(500).json({ ok: false, error: 'Failed to create PDF' });
  });
}

module.exports = generatePdf;