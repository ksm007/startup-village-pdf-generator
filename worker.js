// Synchronous single PDF generator for all sections
const { PDFDocument, StandardFonts, rgb ,breakTextIntoLines} = require('pdf-lib');
const path = require('path');
const fs = require('fs');
// Use built-in http/https for downloading images (avoid ESM node-fetch)
const http = require('http');
const https = require('https');

let pageHeaderBytes=null;

function intToRoman(num) {
  if (!Number.isFinite(num) || num <= 0) return ''
  const romans = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let n = Math.floor(num)
  let res = ''
  for (const [val, sym] of romans) {
    while (n >= val) {
      res += sym
      n -= val
    }
  }
  return res
}

const alpha = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

// Move line items a bit to the left to reduce gap from checkboxes
const lineItemContentStartX=130;
const MINIMUM_SPACE_NEEDED = 50; // Minimum space needed at bottom of page
const CHECKBOX_SIZE = 14;
const CHECKBOX_COUNT = 4;
const CHECKBOX_MIN_SPACING = 6;
const CHECKBOX_MAX_SPACING = 14;
// Keep content well above the footer. Increase if footer layout changes.
const FOOTER_BUFFER = 100;

async function addPageTemplate(page, font) {
  const { width, height } = page.getSize();
  const margin = 20;

  // Report identification (left)
  const reportId = 'Report Identification: 1234 Main Street Denton Texas 76201 - 09/30/2021';
  const reportIdSize = 12;
  page.drawText(reportId, {
    x: margin,
    y: height - 40,
    size: reportIdSize,
    font: font,
    color: rgb(0, 0, 0),
  });

  // Legend centered
  const legend = 'I=Inspected    NI=Not Inspected    NP=Not Present    D=Deficient';
  const legendSize = 11;
  page.drawText(legend, {
    x: margin,
    y: height - 60,
    size: legendSize,
    font: font,
    color: rgb(0, 0, 0),
  });

  // Large bordered box with I NI NP D labels inside
  const boxX = margin;
  const boxWidth = width - margin * 2;
  const boxHeight = 26;
  const boxY = height - 95;
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2,
    color: rgb(1, 1, 1),
  });

  // Labels inside the box centered over checkbox columns
  const keys = ['I','NI','NP','D'];
  const xs = getCheckboxXs(width, margin);
  const keysSize = 10;
  const keysY = boxY + (boxHeight - keysSize) / 2 - 2;
  for (let i = 0; i < keys.length; i++) {
    const label = keys[i];
    const labelWidth = font.widthOfTextAtSize(label, keysSize);
    const centerX = xs[i] + CHECKBOX_SIZE / 2 - labelWidth / 2;
    page.drawText(label, { x: centerX, y: keysY, size: keysSize, font: font, color: rgb(0,0,0) });
  }

  return height - 120; // Return the starting Y position for content
}

async function checkAndCreateNewPage(doc, pos, currentPage, font, forceNewPage = false) {
  const { height } = currentPage.getSize();
  if (forceNewPage || pos.y < MINIMUM_SPACE_NEEDED) {
    const newPage = doc.addPage();
    const timesRomanFont = await doc.embedFont(StandardFonts.TimesRoman);
    
    // Add the template to the new page
    const contentStartY = await addPageTemplate(newPage, timesRomanFont);
    pos.y = contentStartY; // Set Y position below the template header
    
    return newPage;
  }
  return currentPage;
}

function addLineHeaderForLineItem(lineItem, page, font, margin, height, index) {
  const title = alpha[index%26]+". "+(lineItem.title || lineItem.name);
  page.drawText(title, {
    x: lineItemContentStartX, // Position after the checkboxes
    y: height,
    size: 12,
    font: font,
    color: rgb(0, 0, 0),
  });
}

function getCheckboxXs(pageWidth, margin) {
  const available = Math.max(40, lineItemContentStartX - margin - 10);
  let spacing = Math.floor((available - CHECKBOX_COUNT * CHECKBOX_SIZE) / (CHECKBOX_COUNT - 1));
  spacing = Math.min(CHECKBOX_MAX_SPACING, Math.max(CHECKBOX_MIN_SPACING, spacing));
  const xs = [];
  for (let i = 0; i < CHECKBOX_COUNT; i++) xs.push(margin + i * (CHECKBOX_SIZE + spacing));
  return xs;
}

function addCheckBoxToLineItem(lineItem, page, form, margin, y) {
  const checkboxTypes = ['I', 'NI', 'NP', 'D'];
  const xs = getCheckboxXs(page.getSize().width, margin);
  checkboxTypes.forEach((type, index) => {
    const checkBox = form.createCheckBox(`lineItem.${lineItem.id}.${type}`);
    let isChecked = false;
    if (lineItem.isDeficient && type === 'D') {
      isChecked = true;
    } else if (!lineItem.isDeficient && type === lineItem.inspectionStatus) {
      isChecked = true;
    }
    checkBox.addToPage(page, {
      x: xs[index],
      y: y,
      width: CHECKBOX_SIZE,
      height: CHECKBOX_SIZE,
      textColor: rgb(0, 0, 0),
      backgroundColor: rgb(1, 1, 1),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    if (isChecked) checkBox.check();
  });
}


async function addCommentsTitleToLineItem(lineItem, page, font, margin, height, doc) {
    const italicFont = await doc.embedFont(StandardFonts.TimesRomanItalic);
    page.drawText('Comments: ', {
    x: lineItemContentStartX,
    y: height,
    size: 10,
    font: italicFont,
    color: rgb(0, 0, 0),
  });


}


const RIGHT_MARGIN = 20; // right page margin for content column

async function addCommentsToLineItem(comment, page, font, margin, pos, doc, commentIndex) {
    let currentPage = page;
    const boldFont = await doc.embedFont(StandardFonts.TimesRomanBold);
    const italicFont = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const SEPARATOR_GAP = 10;
  const LINE_THICKNESS = 1;
    
    // Calculate space needed for this comment
    const labelText = (commentIndex+1)+". "+(comment?.label || "");
    const commentText = comment?.content || comment?.text || comment.commentText || "";
    
    // Make sure we have enough space for at least the label and first line
  if (pos.y < MINIMUM_SPACE_NEEDED + 40) { // 40 pixels for label + first line
    currentPage = await checkAndCreateNewPage(doc, pos, currentPage, font);
    }
    
  // Prepare geometry for bottom separator (single line after comment)
  const pageWidth = currentPage.getSize().width;
  const lineStartX = lineItemContentStartX;
  const lineWidth = pageWidth - lineStartX - RIGHT_MARGIN;

  // Draw comment number and label
    currentPage.drawText(labelText, {
        x: lineItemContentStartX,
        y: pos.y,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
    });
    pos.y -= 12; // Reduced space after label

    const romanFont = await doc.embedFont(StandardFonts.TimesRoman);
    const textWidth = (t) => romanFont.widthOfTextAtSize(t, 10);
    const lines = breakTextIntoLines(commentText, [" "], 400, textWidth);

    // Draw each line of text, creating new pages as needed
    for (let i = 0; i < lines.length; i++) {
        // Check if we need a new page before each line
        if (pos.y < MINIMUM_SPACE_NEEDED + 12) { // 12 pixels per line minimum
            currentPage = await checkAndCreateNewPage(doc, pos, currentPage, font);
        }
        
        currentPage.drawText(lines[i], {
            x: lineItemContentStartX, // Slightly reduced indent
            y: pos.y,
            size: 10,
            font: romanFont,
            color: rgb(0, 0, 0),
        });
        pos.y -= 12; // Standard line height
    }

    // If there are photos, add them after the comment text
  if (comment.photos && comment.photos.length > 0) {
    pos.y -= 20; // Add more space before photos
    // If not enough room for a reasonable image block, start on a fresh page
    const MIN_IMAGE_BLOCK = 260; 
    if (pos.y - MIN_IMAGE_BLOCK < FOOTER_BUFFER) {
      currentPage = await checkAndCreateNewPage(doc, pos, currentPage, font, true);
    }

        for (const photo of comment.photos) {
            try {
                const embeddedImage = await fetchAndEmbedImage(photo.url, doc);
                
                if (embeddedImage) {
                    // Calculate image dimensions while maintaining aspect ratio
                    const maxWidth = 400; // Maximum width for images
                    const maxHeight = 300; // Maximum height for images
                    
                    let width = embeddedImage.width;
                    let height = embeddedImage.height;
                    
                    // Scale image if it's too large
                    if (width > maxWidth) {
                        const scale = maxWidth / width;
                        width = maxWidth;
                        height = height * scale;
                    }
                    if (height > maxHeight) {
                        const scale = maxHeight / height;
                        height = maxHeight;
                        width = width * scale;
                    }

          // Reserve space above the footer before drawing caption+image
          const captionSpace = photo.caption ? 15 : 0;
          const bottomBuffer = 20; // space below image
          // Compute available vertical space above the footer buffer
          let availVert = pos.y - FOOTER_BUFFER;
          // If item is larger than available space, scale down to fit (but keep minimum reasonable size)
          if (height + captionSpace + bottomBuffer > availVert) {
            const scaleDown = (availVert - captionSpace - bottomBuffer) / height;
            if (scaleDown <= 0) {
              // not enough space on this page at all -> create new page
              currentPage = await checkAndCreateNewPage(doc, pos, currentPage, font, true);
              availVert = pos.y - FOOTER_BUFFER;
            } else {
              height = Math.max(40, Math.floor(height * scaleDown));
              width = Math.floor(width * scaleDown);
            }
          }

          // If still not enough space, move to a new page
          if (pos.y - (height + captionSpace + bottomBuffer) < FOOTER_BUFFER) {
            currentPage = await checkAndCreateNewPage(doc, pos, currentPage, font, true);
          }

          // Draw caption if present
          if (photo.caption) {
            currentPage.drawText(photo.caption, {
              x: lineItemContentStartX,
              y: pos.y,
              size: 9,
              font: italicFont,
              color: rgb(0, 0, 0),
            });
            pos.y -= captionSpace; // reserve caption height
          }

          // Final ensure there is still space for the image, else add a page
          if (pos.y - (height + bottomBuffer) < FOOTER_BUFFER) {
            currentPage = await checkAndCreateNewPage(doc, pos, currentPage, font, true);
          }

          // Draw the image
          const imageY = pos.y - height;
          currentPage.drawImage(embeddedImage, {
            x: lineItemContentStartX,
            y: imageY,
            width: width,
            height: height
          });

          // Move cursor below the image
          pos.y = imageY - bottomBuffer;
                }
            } catch (error) {
                console.error('Error embedding image:', error);
                // Add error message in the PDF if image fails to embed
                currentPage.drawText(`[Error: Unable to embed image from ${photo.url}]`, {
                    x: lineItemContentStartX,
                    y: pos.y,
                    size: 8,
                    font: italicFont,
                    color: rgb(1, 0, 0), // Red color for error
                });
                pos.y -= 15;
            }
        }
    }
    
    // Bottom separator with equal gap
    pos.y -= SEPARATOR_GAP;
    if (pos.y < MINIMUM_SPACE_NEEDED + LINE_THICKNESS) {
      currentPage = await checkAndCreateNewPage(doc, pos, currentPage, font);
    }
    currentPage.drawRectangle({ x: lineStartX, y: pos.y, width: lineWidth, height: LINE_THICKNESS, color: rgb(0.85, 0.85, 0.85) });
    pos.y -= SEPARATOR_GAP;
    return currentPage;
}

async function sectionPdfWorker(section) {
    if(pageHeaderBytes==null){
        pageHeaderBytes = await pageSectionStart();
    }
    const pageSectionStartBytes = pageHeaderBytes;
    
    // load the header doc and create a new document to assemble the final PDF
    const headerDoc = await PDFDocument.load(pageSectionStartBytes)
    const timesRomanFont = await headerDoc.embedFont(StandardFonts.TimesRoman)
    const pages = headerDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize()
    const bodyFontSize = 12
    const margin = 20
    
    firstPage.drawText(intToRoman(section.order+1) + ' ' + section.name, {
        x: width / 2 - timesRomanFont.widthOfTextAtSize(section.name, bodyFontSize) / 2,
        y: height - 120,
        size: bodyFontSize,
        font: timesRomanFont,
        color: rgb(0, 0, 0),
    })
    
    const checkBox = headerDoc.getForm().createCheckBox('some.checkBox.field');
    let currentY = height - 160; // Starting Y position for the first line item
    const pos = {y: currentY}
    let currentPage = firstPage;
  
    for(const [index,lineItem] of section?.lineItems?.entries() || [].entries()){
        // Make sure we have enough space for the line item header and checkboxes
        if (pos.y < MINIMUM_SPACE_NEEDED + 60) { // Need at least 60 pixels for header section
            currentPage = await checkAndCreateNewPage(headerDoc, pos, currentPage, timesRomanFont);
        }
        
        // Add line item header and checkboxes
        addCheckBoxToLineItem(lineItem, currentPage, headerDoc.getForm(), margin, pos.y);
        addLineHeaderForLineItem(lineItem, currentPage, timesRomanFont, margin, pos.y+7, index);
        pos.y -= 5; // Reduced space after header

        // Add comments section for all line items
        const defaultComments = [
            {
                label: "General Observation",
                content: "No specific issues or concerns were observed during the inspection of this item."
            },
            {
                label: "Maintenance Note",
                content: "Regular maintenance and periodic inspection is recommended to ensure optimal performance and longevity."
            }
        ];

        // Check space for comments title
      if (pos.y < MINIMUM_SPACE_NEEDED + 20) {
        currentPage = await checkAndCreateNewPage(headerDoc, pos, currentPage, timesRomanFont);
        }
        
        await addCommentsTitleToLineItem(lineItem, currentPage, timesRomanFont, margin, pos.y, headerDoc);
        pos.y -= 12; // Reduced space after comments title

        // Use actual comments if they exist, otherwise use default comments
        const commentsToUse = lineItem?.comments?.length > 0 ? lineItem.comments : defaultComments;

        // Process comments (either actual or default)
        for(const [commentIndex, comment] of commentsToUse.entries()){
            // Estimate space needed for this comment
            const commentText = comment?.content || comment?.text || comment.commentText || "";
            const estimatedLines = Math.ceil(commentText.length / 60); // More conservative estimate
            const estimatedHeight = (estimatedLines * 12) + 20; // Reduced spacing

            // Create new page if needed
      if (pos.y < (estimatedHeight + MINIMUM_SPACE_NEEDED)) {
        currentPage = await checkAndCreateNewPage(headerDoc, pos, currentPage, timesRomanFont);
            }
            
            currentPage = await addCommentsToLineItem(comment, currentPage, timesRomanFont, margin, pos, headerDoc, commentIndex);
        }
        
        pos.y -= 15; // Reduced space between line items
    }



  // save assembled PDF
  const finalPdfBytes = await headerDoc.save()

  // write to disk for inspection
  try {
    const outPath = path.join(__dirname, 'pdfs', `section-${section?.name||'default'}.pdf`)
    fs.writeFileSync(outPath, finalPdfBytes)
    console.log('Wrote combined PDF to', outPath)
  } catch (err) {
    console.error('Failed to write combined PDF file', err)
  }

 parentPort.postMessage({sectionId: section?.id || 'default', pdfBytes: finalPdfBytes});

}


// MAIN FUNCTION: Generate a single PDF for all sections
async function generateInspectionPdf() {
  const inspectionPath = path.join(__dirname, 'inspection.json');
  const raw = fs.readFileSync(inspectionPath, 'utf8');
  const data = JSON.parse(raw);
  const sections = data?.inspection?.sections || [];

  // Create a single PDF document
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const form = pdfDoc.getForm();

  // Start with a single page
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  let pos = { y: await addPageTemplate(page, timesRomanFont) };
  let currentPage = page;
  const margin = 20;

  for (const [sectionIdx, section] of sections.entries()) {
    // Section header
    if (pos.y < MINIMUM_SPACE_NEEDED + 40) {
      currentPage = await checkAndCreateNewPage(pdfDoc, pos, currentPage, timesRomanFont);
    }
    currentPage.drawText(intToRoman(sectionIdx + 1) + ' ' + section.name, {
      x: width / 2 - timesRomanFont.widthOfTextAtSize(section.name, 12) / 2,
      y: pos.y,
      size: 12,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });
    pos.y -= 30;

    for (const [index, lineItem] of (section.lineItems || []).entries()) {
      // Space for line item header and checkboxes
      if (pos.y < MINIMUM_SPACE_NEEDED + 60) {
        currentPage = await checkAndCreateNewPage(pdfDoc, pos, currentPage, timesRomanFont);
      }
      addCheckBoxToLineItem(lineItem, currentPage, form, margin, pos.y);
      addLineHeaderForLineItem(lineItem, currentPage, timesRomanFont, margin, pos.y + 7, index);
      pos.y -= 5;

      // Comments title
      if (pos.y < MINIMUM_SPACE_NEEDED + 20) {
        currentPage = await checkAndCreateNewPage(pdfDoc, pos, currentPage, timesRomanFont);
      }
      await addCommentsTitleToLineItem(lineItem, currentPage, timesRomanFont, margin, pos.y, pdfDoc);
      pos.y -= 12;

      // Use actual comments if they exist, otherwise use default comments
      const defaultComments = [
        {
          label: "General Observation",
          content: "No specific issues or concerns were observed during the inspection of this item."
        },
        {
          label: "Maintenance Note",
          content: "Regular maintenance and periodic inspection is recommended to ensure optimal performance and longevity."
        }
      ];
      const commentsToUse = lineItem?.comments?.length > 0 ? lineItem.comments : defaultComments;

      for (const [commentIndex, comment] of commentsToUse.entries()) {
        // Estimate space needed for this comment
        const commentText = comment?.content || comment?.text || comment.commentText || "";
        const estimatedLines = Math.ceil(commentText.length / 60);
        const estimatedHeight = (estimatedLines * 12) + 20;
        if (pos.y < (estimatedHeight + MINIMUM_SPACE_NEEDED)) {
          currentPage = await checkAndCreateNewPage(pdfDoc, pos, currentPage, timesRomanFont);
        }
        currentPage = await addCommentsToLineItem(comment, currentPage, timesRomanFont, margin, pos, pdfDoc, commentIndex);
      }
      pos.y -= 15;
    }
    pos.y -= 20;
  }

  // Save assembled PDF
  const finalPdfBytes = await pdfDoc.save();
  const outPath = path.join(__dirname, 'pdfs', 'inspection-report.pdf');
  fs.writeFileSync(outPath, finalPdfBytes);
  console.log('Wrote combined PDF to', outPath);
}

// Run if called directly
if (require.main === module) {
  generateInspectionPdf();
}


async function fetchAndEmbedImage(url, doc) {
  // Download using built-in http/https and embed into pdf-lib doc with a timeout to avoid hangs
  const TIMEOUT_MS = 10000;
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode < 200 || statusCode >= 300) {
          console.error('HTTP status', statusCode, 'for', url);
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            const lower = url.toLowerCase();
            if (lower.endsWith('.png')) {
              return resolve(await doc.embedPng(buffer));
            }
            if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
              return resolve(await doc.embedJpg(buffer));
            }
            // fallback: try jpg then png
            try {
              return resolve(await doc.embedJpg(buffer));
            } catch (e1) {
              try {
                return resolve(await doc.embedPng(buffer));
              } catch (e2) {
                console.error('Failed to embed as JPG or PNG for', url, e1.message, e2.message);
                return resolve(null);
              }
            }
          } catch (err) {
            console.error('Error embedding downloaded image:', err);
            return resolve(null);
          }
        });
      });
      req.setTimeout(TIMEOUT_MS, () => { try { req.destroy(new Error('timeout')); } catch {} });
      req.on('error', (err) => {
        console.error('HTTP(s) get error for', url, err);
        return resolve(null);
      });
    } catch (outerErr) {
      console.error('Unexpected error downloading image', url, outerErr);
      return resolve(null);
    }
  });
}

async function pageSectionStart(){
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    
    const page = pdfDoc.addPage();
    await addPageTemplate(page, timesRomanFont);

    // pdf-lib's save() returns the PDF bytes
    const pageSectionStartBytes = await pdfDoc.save();
    return pageSectionStartBytes;
}
