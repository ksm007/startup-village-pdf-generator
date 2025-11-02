const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

/**
 * Creates a Table of Contents PDF with navigation links
 * @param {Array} sections - Array of section objects from inspection.json
 * @param {Object} options - Configuration options (sectionPageMap for actual page numbers)
 * @returns {Promise<Uint8Array>} - PDF bytes
 */
async function createTableOfContents(sections, options = {}) {
  const {
    title = "Table of Contents",
    fontSize = 12,
    titleFontSize = 18,
    lineHeight = 20,
    margin = 50,
    includeLineItems = false,
    sectionPageMap = {}, // Map of section numbers to actual page numbers
  } = options;

  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // Add first page
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  let currentY = height - margin;

  // Draw title
  const titleWidth = timesRomanBold.widthOfTextAtSize(title, titleFontSize);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: currentY,
    size: titleFontSize,
    font: timesRomanBold,
    color: rgb(0, 0, 0),
  });

  currentY -= titleFontSize + 30;

  // Draw horizontal line under title
  page.drawLine({
    start: { x: margin, y: currentY },
    end: { x: width - margin, y: currentY },
    thickness: 2,
    color: rgb(0, 0, 0),
  });

  currentY -= 30;

  // Sort sections by order
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  // Process each section
  for (let i = 0; i < sortedSections.length; i++) {
    const section = sortedSections[i];

    // Check if we need a new page
    if (currentY < margin + 50) {
      page = pdfDoc.addPage();
      ({ width, height } = page.getSize());
      currentY = height - margin;
    }

    // Section number and name
    const sectionNumber = section.sectionNumber || (i + 1).toString();
    const sectionText = `${sectionNumber}. ${section.name}`;

    // Use actual page number from map if available, otherwise estimate
    const pageNumber = sectionPageMap[sectionNumber] || i + 3; // +3 for cover + TOC + first section

    // Draw section name (clickable)
    const sectionTextWidth = timesRomanBold.widthOfTextAtSize(
      sectionText,
      fontSize
    );

    page.drawText(sectionText, {
      x: margin,
      y: currentY,
      size: fontSize,
      font: timesRomanBold,
      color: rgb(0, 0.2, 0.8),
    });

    // Draw dotted line
    const dotsStartX = margin + sectionTextWidth + 10;
    const pageNumText = pageNumber.toString();
    const pageNumWidth = timesRomanFont.widthOfTextAtSize(
      pageNumText,
      fontSize
    );
    const dotsEndX = width - margin - pageNumWidth - 10;

    drawDottedLine(page, dotsStartX, currentY + 3, dotsEndX, currentY + 3);

    // Draw page number
    page.drawText(pageNumText, {
      x: width - margin - pageNumWidth,
      y: currentY,
      size: fontSize,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    currentY -= lineHeight;

    // Include line items if requested
    if (includeLineItems && section.lineItems && section.lineItems.length > 0) {
      for (const lineItem of section.lineItems) {
        if (currentY < margin + 30) {
          page = pdfDoc.addPage();
          ({ width, height } = page.getSize());
          currentY = height - margin;
        }

        const lineItemText = `   • ${lineItem.name}`;
        page.drawText(lineItemText, {
          x: margin + 20,
          y: currentY,
          size: fontSize - 2,
          font: timesRomanFont,
          color: rgb(0.3, 0.3, 0.3),
        });

        currentY -= lineHeight - 5;
      }
      currentY -= 10; // Extra space after line items
    }
  }

  // Save and return PDF bytes
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Helper function to draw a dotted line
 */
function drawDottedLine(page, x1, y, x2, y2) {
  const dotSpacing = 5;
  const dotSize = 1;

  for (let x = x1; x < x2; x += dotSpacing) {
    page.drawCircle({
      x: x,
      y: y,
      size: dotSize,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
}

/**
 * Generate Table of Contents from inspection JSON file
 * @param {string} jsonFilePath - Path to inspection.json
 * @param {string} outputPath - Path to save the TOC PDF
 * @param {Object} options - Configuration options
 */
async function generateTableOfContentsFromFile(
  jsonFilePath,
  outputPath,
  options = {}
) {
  try {
    // Read and parse JSON file
    const jsonContent = fs.readFileSync(jsonFilePath, "utf-8");
    const data = JSON.parse(jsonContent);

    if (!data.inspection || !data.inspection.sections) {
      throw new Error("Invalid JSON structure: missing inspection.sections");
    }

    // Create TOC
    const pdfBytes = await createTableOfContents(
      data.inspection.sections,
      options
    );

    // Write to file
    fs.writeFileSync(outputPath, pdfBytes);
    console.log(
      `✅ Table of Contents PDF created successfully at: ${outputPath}`
    );

    return pdfBytes;
  } catch (error) {
    console.error("❌ Error generating Table of Contents:", error);
    throw error;
  }
}

/**
 * Express route handler for generating TOC
 */
async function generateTableOfContentsHandler(req, res) {
  try {
    const sections = req?.body?.inspection?.sections || [];
    const options = req?.body?.options || {};

    if (sections.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "No sections provided in request body",
      });
    }

    const pdfBytes = await createTableOfContents(sections, options);

    // Send PDF as response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=table-of-contents.pdf"
    );
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Error generating Table of Contents:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to generate Table of Contents",
      details: error.message,
    });
  }
}

// If run directly from command line
if (require.main === module) {
  const inputFile = process.argv[2] || path.join(__dirname, "inspection.json");
  const outputFile =
    process.argv[3] || path.join(__dirname, "table-of-contents.pdf");

  console.log(`📄 Reading from: ${inputFile}`);
  console.log(`📝 Writing to: ${outputFile}`);

  const options = {
    includeLineItems: process.argv.includes("--include-line-items"),
  };

  generateTableOfContentsFromFile(inputFile, outputFile, options)
    .then(() => {
      console.log("✨ Done!");
    })
    .catch((error) => {
      console.error("💥 Failed:", error.message);
      process.exit(1);
    });
}

module.exports = {
  createTableOfContents,
  generateTableOfContentsFromFile,
  generateTableOfContentsHandler,
};
