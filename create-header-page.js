import fs from "fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ---- File paths ------------------------------------------------------------
const JSON_PATH = "./inspection.json";
const OUTPUT_PATH = "./TREC_Header_Page.pdf";
const LOGO_PATH = "./assets/image.png"; // Optional: path to TREC logo if available

// ---- Page Layout Constants -------------------------------------------------
const PAGE_WIDTH = 612; // 8.5 inches
const PAGE_HEIGHT = 792; // 11 inches
const MARGIN = 50; // ~0.875 inches

// ---- Colors ----------------------------------------------------------------
const BLACK = rgb(0, 0, 0);
const GRAY_BORDER = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY_BG = rgb(0.95, 0.95, 0.95);

// ---- Helper Functions ------------------------------------------------------
const drawLine = (page, x1, y1, x2, y2, thickness = 1, color = BLACK) => {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness,
    color,
  });
};

const drawBox = (
  page,
  x,
  y,
  width,
  height,
  borderColor = GRAY_BORDER,
  borderWidth = 1.5
) => {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor,
    borderWidth,
  });
};

const drawText = (
  page,
  text,
  x,
  y,
  size,
  font,
  color = BLACK,
  options = {}
) => {
  page.drawText(text || "", {
    x,
    y,
    size,
    font,
    color,
    ...options,
  });
};

// ---- Main ------------------------------------------------------------------
(async () => {
  try {
    console.log("📖 Reading inspection data...");
    const jsonStr = await fs.readFile(JSON_PATH, "utf8");
    const data = JSON.parse(jsonStr);
    const inspection = data.inspection || {};
    const account = data.account || {};

    console.log("✅ Parsed JSON data");

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    console.log("✅ Embedded fonts");

    let cursorY = PAGE_HEIGHT - MARGIN;

    // ========================================================================
    // LOGO & TITLE SECTION
    // ========================================================================

    // Try to load TREC logo if available
    let logoImage = null;
    try {
      const logoBytes = await fs.readFile(LOGO_PATH);
      logoImage = await pdfDoc.embedPng(logoBytes);
      console.log("✅ Loaded TREC logo");
    } catch (e) {
      console.log("⚠️  TREC logo not found, drawing text placeholder");
    }

    // Draw TREC logo or placeholder
    const logoX = MARGIN;
    const logoY = cursorY - 70;
    const logoWidth = 120;
    const logoHeight = 100;

    if (logoImage) {
      page.drawImage(logoImage, {
        x: logoX,
        y: logoY,
        width: logoWidth,
        height: logoHeight,
      });
    } else {
      // Draw TREC text placeholder with border
      drawBox(page, logoX, logoY, logoWidth, logoHeight, GRAY_BORDER, 1.5);
      drawText(page, "TREC", logoX + 35, logoY + 45, 24, boldFont);
      drawText(page, "TEXAS REAL ESTATE", logoX + 10, logoY + 25, 8, font);
      drawText(page, "COMMISSION", logoX + 25, logoY + 15, 8, font);
    }

    // Draw main title
    const titleX = logoX + logoWidth ;
    const titleY = cursorY - 35;
    drawText(
      page,
      "PROPERTY INSPECTION REPORT FORM",
      titleX,
      titleY,
      20,
      boldFont
    );

    cursorY = logoY - 20;

    // ========================================================================
    // MAIN INFO BOX
    // ========================================================================

    const boxX = MARGIN;
    const boxY = cursorY - 120;  // change this to vary the height
    const boxWidth = PAGE_WIDTH - 2 * MARGIN;
    const boxHeight = 140;

    // Draw outer box
    drawBox(page, boxX, boxY, boxWidth, boxHeight, BLACK, 2);

    // Draw vertical divider (middle)
    const middleX = boxX + boxWidth / 2;
    // drawLine(page, middleX, boxY, middleX, boxY + boxHeight, 2, BLACK);

    // Get data from JSON
    const clientName = inspection.clientInfo?.name || "";
    const inspectionDate = inspection.schedule?.date
      ? new Date(inspection.schedule.date).toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "";
    const propertyAddress = inspection.address?.fullAddress || "";
    const inspectorName = inspection.inspector?.name || account.name || "";
    const inspectorLicense =
      inspection.inspector?.license || inspection.inspector?.id || "";
    const sponsorName = account.companyName || "";
    const sponsorLicense = account.id || "";

    // Left column fields
    let fieldY = boxY + boxHeight - 30;
    const leftFieldX = boxX + 10;
    const leftValueX = boxX + 10;
    const leftLabelSize = 9;
    const leftValueSize = 11;
    const fieldSpacing = 25;

    // Field 1: Buyer Name
    drawText(page, clientName, leftValueX, fieldY, leftValueSize, font);
    drawLine(
      page,
      leftFieldX,
      fieldY - 2,
      middleX - 10,
      fieldY - 2,
      0.5,
      BLACK
    );
    drawText(page, "Name of Client", leftFieldX, fieldY - 10, 8, italicFont);
    fieldY -= fieldSpacing;

    // Field 2: Property Address
    drawText(page, propertyAddress, leftValueX, fieldY, leftValueSize, font);
    drawLine(
      page,
      leftFieldX,
      fieldY - 2,
      boxX + boxWidth - 10,
      fieldY - 2,
      0.5,
      BLACK
    );
    drawText(
      page,
      "Address of Inspected Property",
      leftFieldX,
      fieldY - 10,
      8,
      italicFont
    );
    fieldY -= fieldSpacing;

    // Field 3: Inspector Name
    drawText(page, inspectorName, leftValueX, fieldY, leftValueSize, font);
    drawLine(
      page,
      leftFieldX,
      fieldY - 2,
      middleX - 10,
      fieldY - 2,
      0.5,
      BLACK
    );
    drawText(page, "Name of Inspector", leftFieldX, fieldY - 10, 8, italicFont);
    fieldY -= fieldSpacing;

    // Field 4: Sponsor Name
    drawText(page, sponsorName, leftValueX, fieldY, leftValueSize, font);
    drawLine(
      page,
      leftFieldX,
      fieldY - 2,
      middleX - 10,
      fieldY - 2,
      0.5,
      BLACK
    );
    drawText(
      page,
      "Name of Sponsor (if applicable)",
      leftFieldX,
      fieldY - 10,
      8,
      italicFont
    );

    // Right column fields
    fieldY = boxY + boxHeight - 30;
    const rightFieldX = middleX + 10;
    const rightValueX = middleX + 10;

    // Field 1: Inspection Date
    drawText(page, inspectionDate, rightValueX, fieldY, leftValueSize, font);
    drawLine(
      page,
      rightFieldX,
      fieldY - 2,
      boxX + boxWidth - 10,
      fieldY - 2,
      0.5,
      BLACK
    );
    drawText(
      page,
      "Date of Inspection",
      rightFieldX,
      fieldY - 10,
      8,
      italicFont
    );
    fieldY -= fieldSpacing;

    // Empty space (matches left side address field)
    fieldY -= fieldSpacing;

    // Field 2: TREC License #
    drawText(
      page,
      `TREC license # ${inspectorLicense}`,
      rightValueX,
      fieldY,
      leftValueSize,
      font
    );
    drawLine(
      page,
      rightFieldX,
      fieldY - 2,
      boxX + boxWidth - 10,
      fieldY - 2,
      0.5,
      BLACK
    );
    drawText(page, "TREC License #", rightFieldX, fieldY - 10, 8, italicFont);
    fieldY -= fieldSpacing;

    // Field 3: Sponsor License
    drawText(page, sponsorLicense, rightValueX, fieldY, leftValueSize, font);
    drawLine(
      page,
      rightFieldX,
      fieldY - 2,
      boxX + boxWidth - 10,
      fieldY - 2,
      0.5,
      BLACK
    );
    drawText(page, "TREC License #", rightFieldX, fieldY - 10, 8, italicFont);

    cursorY = boxY - 20;

    // ========================================================================
    // PURPOSE OF INSPECTION SECTION
    // ========================================================================

    drawText(page, "PURPOSE OF INSPECTION", MARGIN, cursorY, 11, boldFont);
    cursorY -= 18;

    const purposeText = [
      "A real estate inspection is a visual survey of a structure and a basic performance evaluation of the systems and components of a",
      "building. It provides information regarding the general condition of a residence at the time the inspection was conducted.",
      "It is important that you carefully read ALL of this information. Ask the inspector to clarify any items or comments that are unclear.",
    ];

    purposeText.forEach((line) => {
      drawText(page, line, MARGIN, cursorY, 9, font);
      cursorY -= 12;
    });

    cursorY -= 8;

    // ========================================================================
    // RESPONSIBILITY OF THE INSPECTOR SECTION
    // ========================================================================

    drawText(
      page,
      "RESPONSIBILITY OF THE INSPECTOR",
      MARGIN,
      cursorY,
      11,
      boldFont
    );
    cursorY -= 18;

    const respText = [
      "This inspection is governed by the Texas Real Estate Commission (TREC) Standards of Practice (SOPs), which dictates the",
      "minimum requirements for a real estate inspection.",
    ];

    respText.forEach((line) => {
      drawText(page, line, MARGIN, cursorY, 9, font);
      cursorY -= 12;
    });

    cursorY -= 8;

    drawText(page, "The inspector IS required to:", MARGIN, cursorY, 9, font);
    cursorY -= 16;

    const bulletPoints = [
      "use this Property Inspection Report form for the inspection;",
      "inspect only those components and conditions that are present, visible, and accessible at the time of the inspection;",
      "indicate whether each item was inspected, not inspected, or not present;",
      "indicate an item as Deficient (D) if a condition exists that adversely and materially affects the performance of a system or",
      "component OR constitutes a hazard to life, limb or property as specified by the SOPs; and",
      "explain the inspector's findings in the corresponding section in the body of the report form.",
    ];

    const bulletX = MARGIN + 15;
    bulletPoints.forEach((line) => {
      drawText(page, "•", MARGIN + 5, cursorY + 1, 9, font);

      // Handle multi-line bullet points
      if (line.length > 100) {
        const words = line.split(" ");
        let currentLine = "";

        words.forEach((word) => {
          const testLine = currentLine + (currentLine ? " " : "") + word;
          if (
            font.widthOfTextAtSize(testLine, 9) <
            PAGE_WIDTH - bulletX - MARGIN
          ) {
            currentLine = testLine;
          } else {
            drawText(page, currentLine, bulletX, cursorY, 9, font);
            cursorY -= 12;
            currentLine = word;
          }
        });

        if (currentLine) {
          drawText(page, currentLine, bulletX, cursorY, 9, font);
        }
      } else {
        drawText(page, line, bulletX, cursorY, 9, font);
      }

      cursorY -= 12;
    });

    // ========================================================================
    // FOOTER - Page number area
    // ========================================================================

    const footerY = MARGIN - 10;
    drawText(page, "REI 7-6 (8/9/2021)", MARGIN, footerY, 8, font);

    const footerText =
      "Promulgated by the Texas Real Estate Commission • (512) 936-3000 • www.trec.texas.gov";
    const footerTextWidth = font.widthOfTextAtSize(footerText, 8);
    drawText(
      page,
      footerText,
      (PAGE_WIDTH - footerTextWidth) / 2,
      footerY,
      8,
      font
    );

    // Save PDF
    console.log("💾 Saving PDF...");
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(OUTPUT_PATH, pdfBytes);
    console.log(`✅ Successfully saved: ${OUTPUT_PATH}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
