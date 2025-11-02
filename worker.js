const {parentPort, workerData} = require('worker_threads');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const path = require('path');
const fs = require('fs');



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


function addLineHeaderForLineItem(lineItem, page, font, margin, height) {
  const title = lineItem.title || lineItem.name;
  page.drawText(title, {
    x: margin + 160, // Position after the checkboxes
    y: height,
    size: 12,
    font: font,
    color: rgb(0, 0, 0),
  });
}

function addCheckBoxToLineItem(lineItem, page, form, margin, y) {
  const checkboxTypes = ['I', 'NI', 'NP', 'D'];
  const boxSize = 15;
  const spacing = 40; // Space between checkboxes
  
  checkboxTypes.forEach((type, index) => {
    const checkBox = form.createCheckBox(`lineItem.${lineItem.id}.${type}`);
    
    // Determine if this checkbox should be checked based on inspectionStatus and isDeficient
    let isChecked = false;
    if (lineItem.isDeficient && type === 'D') {
      isChecked = true;
    } else if (!lineItem.isDeficient && type === lineItem.inspectionStatus) {
      isChecked = true;
    }
    
    checkBox.addToPage(page, {
      x: margin + (spacing * index),
      y: y,
      width: boxSize,
      height: boxSize,
      textColor: rgb(0, 0, 0),
      backgroundColor: rgb(1, 1, 1),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    if (isChecked) {
      checkBox.check();
    }
 });
}

async function sectionPdfWorker(section) {

  const pageSectionStartBytes = await pageSectionStart();
//    console.log("pageSectionBytes inside worker thread is",pageSectionStartBytes);
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
  
  for(const lineItem of section?.lineItems || []){
    addCheckBoxToLineItem(lineItem, firstPage, headerDoc.getForm(), margin, currentY);
    addLineHeaderForLineItem(lineItem, firstPage, timesRomanFont, margin, currentY);
    currentY -= 30; // Move down for the next line item
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

sectionPdfWorker(workerData);


async function pageSectionStart(){
  const pdfDoc = await PDFDocument.create()
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  
  const page = pdfDoc.addPage()
  const { width, height } = page.getSize()
  // Header/template area
  const margin = 20

  // Report identification (left)
  const reportId = 'Report Identification: 1234 Main Street Denton Texas 76201 - 09/30/2021'
  const reportIdSize = 12
  page.drawText(reportId, {
    x: margin,
    y: height - 40,
    size: reportIdSize,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  })

  // Legend centered
  const legend = 'I=Inspected    NI=Not Inspected    NP=Not Present    D=Deficient'
  const legendSize = 11
  const legendWidth = timesRomanFont.widthOfTextAtSize(legend, legendSize)
  page.drawText(legend, {
    x: margin,
    y: height - 60,
    size: legendSize,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  })

  // Large bordered box with I NI NP D labels inside
  const boxX = margin
  const boxWidth = width - margin * 2
  const boxHeight = 26
  const boxY = height - 95
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2,
    color: rgb(1, 1, 1),
  })

  // Labels inside the box (left-aligned)
  const keysText = 'I    NI    NP    D'
  const keysSize = 10
  // vertically center the text inside the box
  const keysY = boxY + (boxHeight - keysSize) / 2 - 2
  page.drawText(keysText, {
    x: boxX + 12,
    y: keysY,
    size: keysSize,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  })

  // Small spacer before body content
  const bodyStartY = boxY - 100

  // Example body text (moved down under header)
  const bodyFontSize = 12
  // page.drawText('Creating PDFs in JavaScript is awesome!', {
  //   x: margin,
  //   y: bodyStartY,
  //   size: bodyFontSize,
  //   font: timesRomanFont,
  //   color: rgb(0, 0.53, 0.71),
  // })

  // pdf-lib's save() returns the PDF bytes; it doesn't write to disk by itself.
  const pageSectionStartBytes = await pdfDoc.save()

  // write to a file in the project directory for quick local testing
  // try {
  //   const outPath = path.join(__dirname, 'test.pdf')
  //   fs.writeFileSync(outPath, pdfBytes)
  //   console.log('Wrote PDF to', outPath)
  // } catch (err) {
  //   console.error('Failed to write PDF file', err)
  // }

  return pageSectionStartBytes;
}
