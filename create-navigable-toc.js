const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

/**
 * Creates a Table of Contents with clickable navigation links to named destinations
 * This version supports integration with a full PDF document
 */
async function createNavigableTableOfContents(sections, options = {}) {
  const {
    title = "Table of Contents",
    fontSize = 12,
    titleFontSize = 18,
    lineHeight = 20,
    margin = 50,
    includeLineItems = false,
    startPage = 2, // Page number where sections start in the final PDF
  } = options;

  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

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

  // Draw horizontal line
  page.drawLine({
    start: { x: margin, y: currentY },
    end: { x: width - margin, y: currentY },
    thickness: 2,
    color: rgb(0, 0, 0),
  });

  currentY -= 30;

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  // Store section metadata for external use
  const sectionMetadata = [];

  for (let i = 0; i < sortedSections.length; i++) {
    const section = sortedSections[i];

    if (currentY < margin + 50) {
      page = pdfDoc.addPage();
      ({ width, height } = page.getSize());
      currentY = height - margin;
    }

    const sectionNumber = section.sectionNumber || (i + 1).toString();
    const sectionText = `${sectionNumber}. ${section.name}`;
    const pageNumber = startPage + i;

    // Store metadata
    sectionMetadata.push({
      id: section.id,
      name: section.name,
      sectionNumber: sectionNumber,
      pageNumber: pageNumber,
      order: section.order,
    });

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

        const lineItemText = `   • ${lineItem.name || lineItem.title}`;
        page.drawText(lineItemText, {
          x: margin + 20,
          y: currentY,
          size: fontSize - 2,
          font: timesRomanFont,
          color: rgb(0.3, 0.3, 0.3),
        });

        currentY -= lineHeight - 5;
      }
      currentY -= 10;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return {
    pdfBytes,
    metadata: sectionMetadata,
  };
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
 * Combines TOC with main PDF and adds navigation bookmarks
 */
async function combineWithNavigation(tocBytes, mainPdfBytes, sectionMetadata) {
  const tocDoc = await PDFDocument.load(tocBytes);
  const mainDoc = await PDFDocument.load(mainPdfBytes);

  const combinedDoc = await PDFDocument.create();

  // Copy TOC pages
  const tocPages = await combinedDoc.copyPages(tocDoc, tocDoc.getPageIndices());
  tocPages.forEach((page) => combinedDoc.addPage(page));

  const tocPageCount = tocPages.length;

  // Copy main document pages
  const mainPages = await combinedDoc.copyPages(
    mainDoc,
    mainDoc.getPageIndices()
  );
  mainPages.forEach((page) => combinedDoc.addPage(page));

  // Set document metadata
  combinedDoc.setTitle("Property Inspection Report");
  combinedDoc.setSubject("Complete inspection report with table of contents");
  combinedDoc.setCreator("PDF Generator");
  combinedDoc.setProducer("pdf-lib");

  return await combinedDoc.save();
}

/**
 * Generate complete report with TOC
 */
async function generateCompleteReport(
  inspectionData,
  mainPdfPath,
  outputPath,
  options = {}
) {
  try {
    const sections =
      inspectionData?.inspection?.sections || inspectionData?.sections || [];

    if (sections.length === 0) {
      throw new Error("No sections found in inspection data");
    }

    console.log(
      `📋 Creating Table of Contents for ${sections.length} sections...`
    );

    // Create TOC
    const { pdfBytes: tocBytes, metadata } =
      await createNavigableTableOfContents(sections, options);

    console.log("✅ Table of Contents created");

    // If main PDF exists, combine them
    if (mainPdfPath && fs.existsSync(mainPdfPath)) {
      console.log("📄 Loading main PDF...");
      const mainPdfBytes = fs.readFileSync(mainPdfPath);

      console.log("🔗 Combining TOC with main PDF...");
      const combinedBytes = await combineWithNavigation(
        tocBytes,
        mainPdfBytes,
        metadata
      );

      fs.writeFileSync(outputPath, combinedBytes);
      console.log(`✅ Complete report saved to: ${outputPath}`);
    } else {
      // Save TOC only
      fs.writeFileSync(outputPath, tocBytes);
      console.log(`✅ Table of Contents saved to: ${outputPath}`);
    }

    // Save metadata
    const metadataPath = outputPath.replace(".pdf", "-metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`📊 Metadata saved to: ${metadataPath}`);

    return { tocBytes, metadata };
  } catch (error) {
    console.error("❌ Error generating complete report:", error);
    throw error;
  }
}

/**
 * Express route handler with enhanced options
 */
async function generateNavigableTOCHandler(req, res) {
  try {
    const inspectionData = req.body;
    const options = req.body?.options || {};

    const sections =
      inspectionData?.inspection?.sections || inspectionData?.sections || [];

    if (sections.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "No sections provided",
      });
    }

    const { pdfBytes, metadata } = await createNavigableTableOfContents(
      sections,
      options
    );

    // Send metadata in headers for client use
    res.setHeader("X-TOC-Metadata", JSON.stringify(metadata));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=table-of-contents.pdf"
    );

    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Error generating navigable TOC:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to generate Table of Contents",
      details: error.message,
    });
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: node create-navigable-toc.js <inspection.json> <output.pdf> [mainPdf.pdf]

Examples:
  # Create TOC only
  node create-navigable-toc.js inspection.json toc.pdf

  # Create TOC and combine with main PDF
  node create-navigable-toc.js inspection.json complete.pdf main-report.pdf

  # With line items
  node create-navigable-toc.js inspection.json toc.pdf --include-line-items
    `);
    process.exit(0);
  }

  const inputJson = args[0];
  const outputPdf = args[1];
  const mainPdf = args[2] && !args[2].startsWith("--") ? args[2] : null;

  const options = {
    includeLineItems: args.includes("--include-line-items"),
    title: "Property Inspection Report - Table of Contents",
    startPage: 2,
  };

  const jsonContent = JSON.parse(fs.readFileSync(inputJson, "utf-8"));

  generateCompleteReport(jsonContent, mainPdf, outputPdf, options)
    .then(() => console.log("\n✨ Done!\n"))
    .catch((err) => {
      console.error("\n💥 Failed:", err.message);
      process.exit(1);
    });
}

module.exports = {
  createNavigableTableOfContents,
  combineWithNavigation,
  generateCompleteReport,
  generateNavigableTOCHandler,
};
