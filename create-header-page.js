import fs from "fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ---- File paths ------------------------------------------------------------
const JSON_PATH = "./inspection.json";
const OUTPUT_PATH = "./TREC_Header_Page.pdf";
const LOGO_PATH = "./assets/image.  png"; // Optional: path to TREC logo if available

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

// Helper to check if we need a new page and create one
const checkAndAddNewPage = (pdfDoc, cursorY, font, boldFont, italicFont) => {
  const MIN_Y = MARGIN + 30; // Minimum Y position before adding new page
  if (cursorY < MIN_Y) {
    const newPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const newCursorY = PAGE_HEIGHT - MARGIN;

    // Add footer to the new page
    const footerY = MARGIN - 10;
    newPage.drawText("REI 7-6 (8/9/2021)", {
      x: MARGIN,
      y: footerY,
      size: 8,
      font: font,
      color: BLACK,
    });

    const footerText =
      "Promulgated by the Texas Real Estate Commission • (512) 936-3000 • www.trec.texas.gov";
    const footerTextWidth = font.widthOfTextAtSize(footerText, 8);
    newPage.drawText(footerText, {
      x: (PAGE_WIDTH - footerTextWidth) / 2,
      y: footerY,
      size: 8,
      font: font,
      color: BLACK,
    });

    return { page: newPage, cursorY: newCursorY };
  }
  return null;
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
    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const smallFont = await pdfDoc.embedFont(StandardFonts.Helvetica, 8);
    const boldAndUnderlineFont = await pdfDoc.embedFont(
      StandardFonts.HelveticaBoldOblique
    );
    const underlineFont = await pdfDoc.embedFont(
      StandardFonts.HelveticaOblique
    );
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
    const titleX = logoX + logoWidth;
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
    const boxY = cursorY - 120; // change this to vary the height
    const boxWidth = PAGE_WIDTH - 2 * MARGIN;
    const boxHeight = 140;

    // Draw outer box
    drawBox(page, boxX, boxY, boxWidth, boxHeight, BLACK, 2);

    // Draw vertical divider (middle)
    const middleX = boxX + boxWidth / 2;
    // drawLine(page, middleX, boxY, middleX, boxY + boxHeight, 2, BLACK);

    // Get data from JSON with dummy data fallback
    const clientName = inspection.clientInfo?.name || "[Dummy Client Name]";
    const inspectionDate = inspection.schedule?.date
      ? new Date(inspection.schedule.date).toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "[Dummy Date - 01/01/2025, 9:00 AM]";
    const propertyAddress =
      inspection.address?.fullAddress ||
      "[Dummy Address - 123 Main St, City, ST 12345]";
    const inspectorName =
      inspection.inspector?.name || account.name || "[Dummy Inspector Name]";
    const inspectorLicense =
      inspection.inspector?.license ||
      inspection.inspector?.id ||
      "[Dummy License #12345]";
    const sponsorName = account.companyName || "[Dummy Company Name]";
    const sponsorLicense = account.id || "[Dummy Sponsor License #67890]";

    // Left column fields
    let fieldY = boxY + boxHeight - 30;
    const leftFieldX = boxX + 10;
    const leftValueX = boxX + 10;
    const leftLabelSize = 9;
    const headerFontSize = 9;
    const leftValueSize = 11;
    const fieldSpacing = 25;

    // Field 1: Buyer Name
    drawText(page, clientName, leftValueX, fieldY, headerFontSize, font);
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
    drawText(page, propertyAddress, leftValueX, fieldY, headerFontSize, font);
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
    drawText(page, inspectorName, leftValueX, fieldY, headerFontSize, font);
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
    drawText(page, sponsorName, leftValueX, fieldY, headerFontSize, font);
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
    drawText(page, inspectionDate, rightValueX, fieldY, headerFontSize, font);
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
      headerFontSize,
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
    drawText(page, sponsorLicense, rightValueX, fieldY, headerFontSize, font);
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

    // Check if we need a new page before section header
    let pageCheck = checkAndAddNewPage(
      pdfDoc,
      cursorY - 30,
      font,
      boldFont,
      italicFont
    );
    if (pageCheck) {
      page = pageCheck.page;
      cursorY = pageCheck.cursorY;
    }

    drawText(
      page,
      "RESPONSIBILITY OF THE INSPECTOR",
      MARGIN,
      cursorY,
      11,
      boldFont
    );
    cursorY -= 18;

    const inspectorResponsibilityText = [
      "This inspection is governed by the Texas Real Estate Commission (TREC) Standards of Practice (SOPs), which dictates the",
      "minimum requirements for a real estate inspection.",
      "",
      "The inspector IS required to:",
      "•    use this Property Inspection Report form for the inspection;",
      "•    inspect only those components and conditions that are present, visible, and accessible at the time of the inspection;",
      "•    indicate whether each item was inspected, not inspected, or not present;",
      "•    indicate an item as Deficient (D) if a condition exists that adversely and materially affects the performance of a system or",
      "     component OR constitutes a hazard to life, limb or property as specified by the SOPs; and",
      "•    explain the inspector's findings in the corresponding section in the body of the report form.",
      "",
      "The inspector IS NOT required to:",
      "•    identify all potential hazards;",
      "•    turn on decommissioned equipment, systems, utilities, or apply an open flame or light a pilot to operate any appliance;",
      "•    climb over obstacles, move furnishings or stored items;",
      "•    prioritize or emphasize the importance of one deficiency over another;",
      "•    provide follow-up services to verify that proper repairs have been made; or",
      "•    inspect system or component listed under the optional section of the SOPs (22 TAC 535.233).",
    ];

    inspectorResponsibilityText.forEach((line) => {
      // Check if we need a new page
      const pageCheck = checkAndAddNewPage(
        pdfDoc,
        cursorY,
        font,
        boldFont,
        italicFont
      );
      if (pageCheck) {
        page = pageCheck.page;
        cursorY = pageCheck.cursorY;
      }

      drawText(page, line, MARGIN, cursorY, 9, font);
      cursorY -= 12;
    });

    cursorY -= 8;

    // ========================================================================
    // RESPONSIBILITY OF THE CLIENT SECTION
    // ========================================================================

    // Check if we need a new page before section header
    pageCheck = checkAndAddNewPage(
      pdfDoc,
      cursorY - 30,
      font,
      boldFont,
      italicFont
    );
    if (pageCheck) {
      page = pageCheck.page;
      cursorY = pageCheck.cursorY;
    }

    drawText(
      page,
      "RESPONSIBILITY OF THE CLIENT",
      MARGIN,
      cursorY,
      11,
      boldFont
    );
    cursorY -= 18;

    const clientResponsibilityText = [
      "While items identified as Deficient (D) in an inspection report DO NOT obligate any party to make repairs or take other actions, in",
      "the event that any further evaluations are needed, it is the responsibility of the client to obtain further evaluations and/or cost",
      "estimates from qualified service professionals regarding any items reported as Deficient (D). It is recommended that any further",
      "evaluations and/or cost estimates take place prior to the expiration of any contractual time limitations, such as option periods.",
      "",
      "Please Note: Evaluations performed by service professionals in response to items reported as Deficient (D) on the report may lead",
      "to the discovery of additional deficiencies that were not present, visible, or accessible at the time of the inspection. Any repairs",
      "made after the date of the inspection may render information contained in this report obsolete or invalid.",
    ];

    clientResponsibilityText.forEach((line) => {
      // Check if we need a new page
      pageCheck = checkAndAddNewPage(
        pdfDoc,
        cursorY,
        font,
        boldFont,
        italicFont
      );
      if (pageCheck) {
        page = pageCheck.page;
        cursorY = pageCheck.cursorY;
      }

      drawText(page, line, MARGIN, cursorY, 9, font);
      cursorY -= 12;
    });

    cursorY -= 8;

    // ========================================================================
    // REPORT LIMITATIONS SECTION
    // ========================================================================

    // Check if we need a new page before section header
    pageCheck = checkAndAddNewPage(
      pdfDoc,
      cursorY - 30,
      font,
      boldFont,
      italicFont
    );
    if (pageCheck) {
      page = pageCheck.page;
      cursorY = pageCheck.cursorY;
    }

    drawText(page, "REPORT LIMITATIONS", MARGIN, cursorY, 11, boldFont);
    cursorY -= 18;

    const reportLimitationsText = [
      "This report is provided for the benefit of the named client and is based on observations made by the named inspector on the date the",
      "inspection was performed (indicated above).",
      "",
      "ONLY those items specifically noted as being inspected on the report were inspected.",
      "",
      "This inspection IS NOT:",
      "•    a technically exhaustive inspection of the structure, its systems, or its components and may not reveal all deficiencies;",
      "•    an inspection to verify compliance with any building codes;",
      "•    an inspection to verify compliance with manufacturer's installation instructions for any system or component and DOES NOT",
      "     imply insurability or warrantability of the structure or its components.",
    ];

    reportLimitationsText.forEach((line) => {
      // Check if we need a new page
      pageCheck = checkAndAddNewPage(
        pdfDoc,
        cursorY,
        font,
        boldFont,
        italicFont
      );
      if (pageCheck) {
        page = pageCheck.page;
        cursorY = pageCheck.cursorY;
      }

      drawText(page, line, MARGIN, cursorY, 9, font);
      cursorY -= 12;
    });

    cursorY -= 8;

    // ========================================================================
    // NOTICE CONCERNING HAZARDOUS CONDITIONS SECTION
    // ========================================================================

    // Check if we need a new page before section header
    pageCheck = checkAndAddNewPage(
      pdfDoc,
      cursorY - 30,
      font,
      boldFont,
      italicFont
    );
    if (pageCheck) {
      page = pageCheck.page;
      cursorY = pageCheck.cursorY;
    }

    drawText(
      page,
      "NOTICE CONCERNING HAZARDOUS CONDITIONS, DEFICIENCIES, AND CONTRACTUAL AGREEMENTS",
      MARGIN,
      cursorY,
      10,
      boldAndUnderlineFont
    );
    cursorY -= 18;

    const hazardousConditionsText = [
      "Conditions may be present in your home that did not violate building codes or common practices in effect when the home",
      "was constructed but are considered hazardous by today's standards. Such conditions that were part of the home prior to the",
      "adoption of any current codes prohibiting them may not be required to be updated to meet current code requirements.",
      "However, if it can be reasonably determined that they are present at the time of the inspection, the potential for injury or",
      "property loss from these conditions is significant enough to require inspectors to report them as Deficient (D). Examples of",
      "such hazardous conditions include:",
      "",
      "•    malfunctioning, improperly installed, or missing ground fault circuit protection (GFCI) devices and arc-fault (AFCI) devices;",
      "•    ordinary glass in locations where modern construction techniques call for safety glass;",
      "•    malfunctioning or lack of fire safety features such as smoke alarms, fire-rated doors in certain locations, and functional",
      "     emergency escape and rescue openings in bedrooms;",
      "•    malfunctioning carbon monoxide alarms;",
      "•    excessive spacing between balusters on stairways and porches;",
      "•    improperly installed appliances;",
      "•    improperly installed or defective safety devices;",
      "•    lack of electrical bonding and grounding; and",
      "•    lack of bonding on gas piping, including corrugated stainless steel tubing (CSST).",
      "",
      "Please Note: items identified as Deficient (D) in an inspection report DO NOT obligate any party to make repairs or take other",
      "actions. The decision to correct a hazard or any deficiency identified in an inspection report is left up to the parties to the contract",
      "for the sale or purchase of the home.",
      "",
      "This property inspection report may include an inspection agreement (contract), addenda, and other information related to property",
      "conditions.",
      "",
      'INFORMATION INCLUDED UNDER "ADDITIONAL INFORMATION PROVIDED BY INSPECTOR", OR PROVIDED AS',
      "AN ATTACHMENT WITH THE STANDARD FORM, IS NOT REQUIRED BY THE COMMISSION AND MAY CONTAIN",
      "CONTRACTUAL TERMS BETWEEN THE INSPECTOR AND YOU, AS THE CLIENT. THE COMMISSION DOES NOT",
      "REGULATE CONTRACTUAL TERMS BETWEEN PARTIES. IF YOU DO NOT UNDERSTAND THE EFFECT OF ANY",
      "CONTRACTUAL TERM CONTAINED IN THIS SECTION OR ANY ATTACHMENTS, CONSULT AN ATTORNEY.",
    ];

    hazardousConditionsText.forEach((line) => {
      // Check if we need a new page
      pageCheck = checkAndAddNewPage(
        pdfDoc,
        cursorY,
        font,
        boldFont,
        italicFont
      );
      if (pageCheck) {
        page = pageCheck.page;
        cursorY = pageCheck.cursorY;
      }

      drawText(page, line, MARGIN, cursorY, 9, underlineFont);
      cursorY -= 12;
    });

    const doubleUnderlineY = cursorY - 10;
    drawLine(
      page,
      MARGIN,
      doubleUnderlineY,
      PAGE_WIDTH - MARGIN,
      doubleUnderlineY,
      1,
      BLACK
    );
    drawLine(
      page,
      MARGIN,
      doubleUnderlineY - 2,
      PAGE_WIDTH - MARGIN,
      doubleUnderlineY - 2,
      1,
      BLACK
    );

    cursorY -= 8;

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
