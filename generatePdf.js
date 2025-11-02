
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const fs = require('fs')
const path = require('path')
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require('node:worker_threads');
const SimpleCache = require('./cache');



function generatePdfForSection(section){
  return new Promise((resolve, reject) => {
    const worker = new Worker("./worker.js", {
      workerData: section
    });
    worker.on('message', ()=>{
      console.log('Worker finished processing section:');
      resolve();
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0)
        reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

function generatePdfForSections(sections){
  return Promise.all(sections.map(section => generatePdfForSection(section)));
}

async function createPdf(req,res) {

  const sections=req?.body?.inspection?.sections || [];
  const cacheValuePageSectionStart = SimpleCache.get('pageSectionStart');
  if(!cacheValuePageSectionStart){
    const pageSectionStartBytes = await pageSectionStart();
    SimpleCache.set('pageSectionStart', pageSectionStartBytes, true);
  } 

  console.log("Cache value for pageSectionStart is",SimpleCache.get('pageSectionStart'));
  // console.log('Received sections:', sections);
 
   await generatePdfForSections(sections);
 
  //  console.log("Cache value for pageSectionStart is 2",SimpleCache.get('pageSectionStart'));
   
  // get the header/template bytes (single-page document)
  // const pageSectionStartBytes = await pageSectionStart();

  // load the header doc and create a new document to assemble the final PDF
  // const headerDoc = await PDFDocument.load(pageSectionStartBytes)
  // const timesRomanFont = await headerDoc.embedFont(StandardFonts.TimesRoman)
  // const pages = headerDoc.getPages();
  // const firstPage = pages[0];
  // const bodyFontSize = 12
  // const margin = 20
  // firstPage.drawText('Creating PDFs in JavaScript is awesome!', {
  //   x: margin,
  //   y: 100,
  //   size: bodyFontSize,
  //   font: timesRomanFont,
  //   color: rgb(0, 0.53, 0.71),
  // })



  // // save assembled PDF
  // const finalPdfBytes = await headerDoc.save()

  // // write to disk for inspection
  // try {
  //   const outPath = path.join(__dirname, 'combined.pdf')
  //   fs.writeFileSync(outPath, finalPdfBytes)
  //   console.log('Wrote combined PDF to', outPath)
  // } catch (err) {
  //   console.error('Failed to write combined PDF file', err)
  // }

  // return finalPdfBytes
}

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

function generatePdf(req, res) {
  // basic handler: create a PDF, log incoming body and return a simple JSON response
  createPdf(req,res)
    .then((bytes) => {
      // console.log('generatePdf called — body:', req.body)
      // for now we don't send the PDF bytes; respond with success
      res.json({ ok: true, message: 'generatePdf handler received the request' })
    })
    .catch((err) => {
      console.error('createPdf error', err)
      res.status(500).json({ ok: false, error: 'Failed to create PDF' })
    })
}

module.exports = generatePdf;