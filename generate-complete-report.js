const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

/**
 * Complete Inspection Report Generator
 * Generates a full PDF report with:
 * - Table of Contents
 * - Sections with line items
 * - Comments with formatting
 * - Images embedded at the end of each section
 */

// Sanitize text for PDF (remove unsupported characters)
function sanitizeText(text) {
  if (!text) return "";

  // Replace special characters that WinAnsi cannot encode
  return text
    .replace(/[\r\n]+/g, " ") // Replace newlines with spaces
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .replace(/[^\x20-\x7E]/g, "") // Remove non-ASCII characters
    .trim();
}

// Text wrapping utility
function wrapText(text, font, fontSize, maxWidth) {
  // First, sanitize the text
  const cleanText = sanitizeText(text);

  const words = cleanText.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);

    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// Download image from URL with caching
const imageCache = new Map();

function downloadImage(url) {
  // Return cached image if available
  if (imageCache.has(url)) {
    return Promise.resolve(imageCache.get(url));
  }

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;

    const timeout = setTimeout(() => {
      reject(new Error("Download timeout"));
    }, 5000); // Reduced to 5 second timeout for faster failure

    const request = protocol
      .get(
        url,
        {
          timeout: 5000,
          headers: {
            "User-Agent": "Mozilla/5.0", // Some servers require a user agent
          },
        },
        (response) => {
          clearTimeout(timeout);

          if (response.statusCode !== 200) {
            reject(
              new Error(`Failed to download image: ${response.statusCode}`)
            );
            return;
          }

          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const buffer = Buffer.concat(chunks);
            imageCache.set(url, buffer); // Cache the result
            resolve(buffer);
          });
          response.on("error", reject);
        }
      )
      .on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

    request.on("timeout", () => {
      request.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

// Pre-download all images in parallel
async function preloadAllImages(inspectionData) {
  const imageUrls = new Set();

  // Collect cover image
  const inspection = inspectionData?.inspection || inspectionData;
  if (inspection.headerImageUrl) {
    imageUrls.add(inspection.headerImageUrl);
  }

  // Collect all comment images
  const sections =
    inspectionData?.inspection?.sections || inspectionData?.sections || [];
  for (const section of sections) {
    for (const lineItem of section.lineItems || []) {
      for (const comment of lineItem.comments || []) {
        // Add photos
        if (comment.photos && comment.photos.length > 0) {
          for (const photo of comment.photos) {
            if (photo.url) {
              imageUrls.add(photo.url);
            }
          }
        }
      }
    }
  }

  // Download all images in parallel with maximum concurrency
  const urls = Array.from(imageUrls);

  // Download all at once for maximum speed
  await Promise.allSettled(urls.map((url) => downloadImage(url)));

  return imageUrls.size;
}

// Create a video placeholder (blue rectangle with play icon text)
async function createVideoPlaceholder(pdfDoc, width, height) {
  const placeholderPage = pdfDoc.addPage([width, height]);

  // Draw blue background
  placeholderPage.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: height,
    color: rgb(0.2, 0.4, 0.7),
  });

  // Draw play icon circle
  const centerX = width / 2;
  const centerY = height / 2;
  const circleRadius = Math.min(width, height) / 6;

  placeholderPage.drawCircle({
    x: centerX,
    y: centerY,
    size: circleRadius,
    borderColor: rgb(1, 1, 1),
    borderWidth: 3,
  });

  // Add "VIDEO" text
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = Math.min(width, height) / 8;
  const text = "VIDEO";
  const textWidth = font.widthOfTextAtSize(text, fontSize);

  placeholderPage.drawText(text, {
    x: centerX - textWidth / 2,
    y: centerY - fontSize / 3,
    size: fontSize,
    font: font,
    color: rgb(1, 1, 1),
  });

  return placeholderPage;
}

// Create cover page with property image and details
async function createCoverPage(pdfDoc, inspectionData, options = {}) {
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const margin = 50;

  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const inspection = inspectionData.inspection || inspectionData;

  // Add header image if available
  let currentY = height - 80;

  if (inspection.headerImageUrl) {
    try {
      const imageBytes = await downloadImage(inspection.headerImageUrl);

      let image;
      if (inspection.headerImageUrl.toLowerCase().includes(".png")) {
        image = await pdfDoc.embedPng(imageBytes);
      } else {
        image = await pdfDoc.embedJpg(imageBytes);
      }

      const imgDims = image.scale(0.5);
      const maxImgWidth = width - margin * 2;
      const maxImgHeight = 300;

      let imgWidth = imgDims.width;
      let imgHeight = imgDims.height;

      if (imgWidth > maxImgWidth) {
        const scale = maxImgWidth / imgWidth;
        imgWidth = maxImgWidth;
        imgHeight = imgHeight * scale;
      }

      if (imgHeight > maxImgHeight) {
        const scale = maxImgHeight / imgHeight;
        imgHeight = maxImgHeight;
        imgWidth = imgWidth * scale;
      }

      // Center the image
      const imgX = (width - imgWidth) / 2;

      page.drawImage(image, {
        x: imgX,
        y: currentY - imgHeight,
        width: imgWidth,
        height: imgHeight,
      });

      currentY -= imgHeight + 40;
      console.log("  ✅ Cover image added");
    } catch (error) {
      console.error("  ❌ Failed to load cover image:", error.message);
      currentY -= 20;
    }
  }

  // Draw title
  const title = "PROPERTY INSPECTION REPORT";
  const titleSize = 24;
  const titleWidth = timesRomanBold.widthOfTextAtSize(title, titleSize);

  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: currentY,
    size: titleSize,
    font: timesRomanBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  currentY -= 50;

  // Draw horizontal line
  page.drawLine({
    start: { x: margin, y: currentY },
    end: { x: width - margin, y: currentY },
    thickness: 2,
    color: rgb(0.3, 0.3, 0.3),
  });

  currentY -= 40;

  // Property Address
  if (inspection.address) {
    const addressLabel = "Property Address:";
    page.drawText(addressLabel, {
      x: margin,
      y: currentY,
      size: 14,
      font: timesRomanBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    currentY -= 25;

    const addressText =
      inspection.address.fullAddress ||
      `${inspection.address.street}, ${inspection.address.city}, ${inspection.address.state} ${inspection.address.zipcode}`;

    page.drawText(sanitizeText(addressText), {
      x: margin + 10,
      y: currentY,
      size: 12,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    currentY -= 45;
  }

  // Two-column layout for Inspector and Agent
  const columnWidth = (width - margin * 2 - 30) / 2;
  const leftColumnX = margin;
  const rightColumnX = margin + columnWidth + 30;
  let leftColumnY = currentY;
  let rightColumnY = currentY;

  // Left Column: Inspector Information
  if (inspection.inspector) {
    page.drawText("Inspector:", {
      x: leftColumnX,
      y: leftColumnY,
      size: 14,
      font: timesRomanBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    leftColumnY -= 25;

    const inspectorName = sanitizeText(inspection.inspector.name || "N/A");
    page.drawText(inspectorName, {
      x: leftColumnX + 10,
      y: leftColumnY,
      size: 12,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    leftColumnY -= 18;

    if (inspection.inspector.email) {
      page.drawText(`Email: ${sanitizeText(inspection.inspector.email)}`, {
        x: leftColumnX + 10,
        y: leftColumnY,
        size: 10,
        font: timesRomanFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      leftColumnY -= 18;
    }

    if (inspection.inspector.phone) {
      page.drawText(`Phone: ${sanitizeText(inspection.inspector.phone)}`, {
        x: leftColumnX + 10,
        y: leftColumnY,
        size: 10,
        font: timesRomanFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      leftColumnY -= 18;
    }
  }

  // Right Column: Agent Information
  if (inspection.agents && inspection.agents.length > 0) {
    const agent = inspection.agents[0].agent;

    page.drawText("Agent:", {
      x: rightColumnX,
      y: rightColumnY,
      size: 14,
      font: timesRomanBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    rightColumnY -= 25;

    const agentName = sanitizeText(agent.name || "N/A");
    page.drawText(agentName, {
      x: rightColumnX + 10,
      y: rightColumnY,
      size: 12,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    rightColumnY -= 18;

    if (agent.email) {
      page.drawText(`Email: ${sanitizeText(agent.email)}`, {
        x: rightColumnX + 10,
        y: rightColumnY,
        size: 10,
        font: timesRomanFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      rightColumnY -= 18;
    }

    if (agent.phone) {
      page.drawText(`Phone: ${sanitizeText(agent.phone)}`, {
        x: rightColumnX + 10,
        y: rightColumnY,
        size: 10,
        font: timesRomanFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      rightColumnY -= 18;
    }

    if (agent.company && agent.company.name) {
      page.drawText(`Company: ${sanitizeText(agent.company.name)}`, {
        x: rightColumnX + 10,
        y: rightColumnY,
        size: 10,
        font: timesRomanFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      rightColumnY -= 18;
    }
  }

  // Use the lower of the two columns for the next Y position
  currentY = Math.min(leftColumnY, rightColumnY) - 25;

  // Client Information
  if (inspection.clientInfo) {
    page.drawText("Client:", {
      x: margin,
      y: currentY,
      size: 14,
      font: timesRomanBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    currentY -= 25;

    const clientName = sanitizeText(inspection.clientInfo.name || "N/A");
    page.drawText(clientName, {
      x: margin + 10,
      y: currentY,
      size: 12,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    currentY -= 18;

    if (inspection.clientInfo.email) {
      page.drawText(`Email: ${sanitizeText(inspection.clientInfo.email)}`, {
        x: margin + 10,
        y: currentY,
        size: 10,
        font: timesRomanFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      currentY -= 18;
    }

    if (inspection.clientInfo.phone) {
      page.drawText(`Phone: ${sanitizeText(inspection.clientInfo.phone)}`, {
        x: margin + 10,
        y: currentY,
        size: 10,
        font: timesRomanFont,
        color: rgb(0.3, 0.3, 0.3),
      });
    }
  }

  // Add inspection date at bottom
  if (inspection.schedule && inspection.schedule.date) {
    const date = new Date(inspection.schedule.date);
    const dateStr = date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    page.drawText(`Inspection Date: ${dateStr}`, {
      x: margin,
      y: 50,
      size: 10,
      font: timesRomanFont,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  return pdfDoc;
}

// Create header template for each page with page numbers
async function createPageHeader(page, pdfDoc, options = {}) {
  const { reportId = "Property Inspection Report", pageNumber = null } =
    options;

  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const { width, height } = page.getSize();
  const margin = 20;

  // Report identification
  page.drawText(reportId, {
    x: margin,
    y: height - 30,
    size: 9,
    font: timesRomanFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Add page number on the right
  if (pageNumber !== null) {
    const pageText = `Page ${pageNumber}`;
    const pageTextWidth = timesRomanFont.widthOfTextAtSize(pageText, 9);
    page.drawText(pageText, {
      x: width - margin - pageTextWidth,
      y: height - 30,
      size: 9,
      font: timesRomanFont,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Draw line
  page.drawLine({
    start: { x: margin, y: height - 40 },
    end: { x: width - margin, y: height - 40 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });

  return height - 60; // Return Y position where content can start
}

// Generate section page (without checkboxes)
async function generateSectionPage(pdfDoc, section, options = {}) {
  const {
    margin = 20,
    fontSize = 12, // Increased from 10
    lineHeight = 16, // Increased from 14
    includeImages = true,
  } = options;
  let { pageNumber } = options;

  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  let currentY = await createPageHeader(page, pdfDoc, {
    ...options,
    pageNumber,
  });

  // Helper function to create new page with incremented page number
  const createNewPage = async () => {
    page = pdfDoc.addPage();
    ({ width, height } = page.getSize());
    pageNumber = pageNumber ? pageNumber + 1 : null;
    currentY = await createPageHeader(page, pdfDoc, { ...options, pageNumber });
    return currentY;
  };

  // Section title with background - CENTERED, BOLD, CAPS, BIGGER
  const sectionTitle = `${section.name}`.toUpperCase();
  const titleSize = 20; // Increased from 16
  const titlePadding = 10;

  // Calculate centered position
  const titleWidth = timesRomanBold.widthOfTextAtSize(sectionTitle, titleSize);
  const titleX = (width - titleWidth) / 2;

  // Draw background rectangle for section title
  const rectWidth = width - margin * 2;
  const rectHeight = titleSize + titlePadding * 2;

  page.drawRectangle({
    x: margin,
    y: currentY - titleSize - titlePadding,
    width: rectWidth,
    height: rectHeight,
    color: rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 0.5,
  });

  // Draw centered text - vertically centered in the rectangle
  const textY = currentY - titlePadding - titleSize / 2;

  page.drawText(sectionTitle, {
    x: titleX,
    y: textY,
    size: titleSize,
    font: timesRomanBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  currentY -= rectHeight + 20;

  // Process line items
  for (const lineItem of section.lineItems || []) {
    // Check if line item has any content to display
    const hasSelectedOptions =
      lineItem.selectedOptions && lineItem.selectedOptions.length > 0;
    const hasComments =
      lineItem.comments &&
      lineItem.comments.length > 0 &&
      lineItem.comments.some((comment) => {
        const hasText = comment.text || comment.content || comment.commentText;
        const hasLocation = comment.location && comment.location.trim() !== "";
        const hasCommentOptions =
          comment.selectedOptions && comment.selectedOptions.length > 0;
        const hasPhotos = comment.photos && comment.photos.length > 0;
        const hasVideos = comment.videos && comment.videos.length > 0;
        const hasRecommendation =
          comment.recommendation && comment.recommendation.trim() !== "";
        return (
          hasText ||
          hasLocation ||
          hasCommentOptions ||
          hasPhotos ||
          hasVideos ||
          hasRecommendation
        );
      });

    // Skip line item entirely if it has no content
    if (!hasSelectedOptions && !hasComments) {
      continue;
    }

    // Check if we need a new page
    if (currentY < margin + 100) {
      currentY = await createNewPage();
    }

    // Line item number and title (SUBHEADING - smaller than section title)
    const lineItemTitle = `${sanitizeText(lineItem.name || lineItem.title)}`;

    // Add line item title with indentation (SUBHEADING SIZE)
    page.drawText(lineItemTitle, {
      x: margin + 10,
      y: currentY,
      size: fontSize + 2, // Subheading: 14pt (section is 20pt)
      font: timesRomanBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    currentY -= lineHeight + 8;

    // Process comments
    if (
      lineItem.comments &&
      lineItem.comments != [] &&
      lineItem.comments.length > 0
    ) {
      for (const comment of lineItem.comments) {
        // Skip empty comments - check ALL possible content
        const hasText = comment.text || comment.content || comment.commentText;
        const hasLocation = comment.location && comment.location.trim() !== "";
        const hasSelectedOptions =
          comment.selectedOptions && comment.selectedOptions.length > 0;
        const hasTag = comment.tag;
        const hasPhotos = comment.photos && comment.photos.length > 0;
        const hasVideos = comment.videos && comment.videos.length > 0;
        const hasRecommendation =
          comment.recommendation && comment.recommendation.trim() !== "";

        // Check if comment has ANY displayable content
        const hasAnyContent =
          hasText ||
          hasLocation ||
          hasSelectedOptions ||
          hasPhotos ||
          hasVideos ||
          hasRecommendation;

        // Skip if no content at all (even if it has a tag or label)
        if (!hasAnyContent) {
          continue; // Skip this comment entirely
        }

        // Check if we need a new page
        if (currentY < margin + 150) {
          currentY = await createNewPage();
        }

        // Prepare all tags to display on the same line (right-aligned)
        const tagsToDisplay = [];

        // Add main tag if exists
        if (comment.tag) {
          const mainTag = sanitizeText(comment.tag).toUpperCase();
          tagsToDisplay.push({
            text: mainTag,
            type: "tag",
          });
        }

        // Add recommendation tag if exists AND it's not already in the main tag
        if (hasRecommendation) {
          const mainTagText = comment.tag
            ? sanitizeText(comment.tag).toUpperCase()
            : "";
          // Only add RECOMMENDATION tag if the main tag doesn't already contain "RECOMMENDATION"
          if (!mainTagText.includes("RECOMMENDATION")) {
            tagsToDisplay.push({
              text: "RECOMMENDATION",
              type: "recommendation",
            });
          }
        }

        // Calculate total width needed for all tags
        const tagColors = {
          "MAINTENANCE ITEM": { bg: rgb(0.2, 0.5, 0.9), text: rgb(1, 1, 1) },
          "MAINTENANCE-ITEM": { bg: rgb(0.2, 0.5, 0.9), text: rgb(1, 1, 1) },
          RECOMMENDATION: { bg: rgb(0, 0.6, 0.2), text: rgb(1, 1, 1) },
          "SAFETY HAZARD": { bg: rgb(0.8, 0, 0), text: rgb(1, 1, 1) },
          "SAFETY-HAZARD": { bg: rgb(0.8, 0, 0), text: rgb(1, 1, 1) },
          REPAIR: { bg: rgb(0.9, 0.4, 0), text: rgb(1, 1, 1) },
          OTHER: { bg: rgb(0.5, 0.5, 0.5), text: rgb(1, 1, 1) },
        };

        const tagPadding = 5;
        const tagSpacing = 8;
        let totalTagsWidth = 0;

        // Calculate total width of all tags
        for (const tag of tagsToDisplay) {
          const tagWidth =
            timesRomanBold.widthOfTextAtSize(tag.text, fontSize - 1) +
            tagPadding * 4;
          totalTagsWidth += tagWidth + tagSpacing;
        }

        // Comment header - use label field with comment number beside it (MAKE IT CAPS)
        const commentLabel = sanitizeText(
          comment.label || `Comment ${comment.commentNumber || ""}`
        ).toUpperCase(); // Make comment header UPPERCASE
        const commentNumberText = comment.commentNumber
          ? ` ${comment.commentNumber}`
          : "";
        const fullCommentHeader = commentNumberText + " " + commentLabel;

        // Calculate maximum width for header text (leave space for tags)
        const headerMaxWidth = width - margin * 2 - 30 - totalTagsWidth - 20; // 20px buffer

        // Wrap header if it's too long
        const headerLines = wrapText(
          fullCommentHeader,
          timesRomanBold,
          fontSize + 3,
          headerMaxWidth
        );

        // Draw header (possibly wrapped)
        for (let i = 0; i < headerLines.length; i++) {
          page.drawText(headerLines[i], {
            x: margin + 15,
            y: currentY,
            size: fontSize + 3,
            font: timesRomanBold,
            color: rgb(0, 0, 0),
          });

          // Only draw tags on the first line
          if (i === 0 && tagsToDisplay.length > 0) {
            let currentTagX = width - margin - 15;
            const tagHeight = fontSize + tagPadding * 2;
            const cornerRadius = 4; // Radius for rounded corners

            // Draw tags from right to left
            for (let j = tagsToDisplay.length - 1; j >= 0; j--) {
              const tag = tagsToDisplay[j];
              const tagText = tag.text;

              // Find matching color or use default
              let tagColor = tagColors["OTHER"]; // default
              for (const [key, color] of Object.entries(tagColors)) {
                if (tagText.includes(key) || tagText === key) {
                  tagColor = color;
                  break;
                }
              }

              const tagWidth =
                timesRomanBold.widthOfTextAtSize(tagText, fontSize - 1) +
                tagPadding * 4;

              const tagX = currentTagX - tagWidth;
              const tagY = currentY - tagPadding;

              // Draw rounded rectangle for badge using multiple shapes
              // Main rectangle (center)
              page.drawRectangle({
                x: tagX + cornerRadius,
                y: tagY,
                width: tagWidth - cornerRadius * 2,
                height: tagHeight,
                color: tagColor.bg,
                borderWidth: 0,
              });

              // Top and bottom bars (horizontal)
              page.drawRectangle({
                x: tagX,
                y: tagY + cornerRadius,
                width: tagWidth,
                height: tagHeight - cornerRadius * 2,
                color: tagColor.bg,
                borderWidth: 0,
              });

              // Draw 4 circles for rounded corners
              page.drawCircle({
                x: tagX + cornerRadius,
                y: tagY + cornerRadius,
                size: cornerRadius,
                color: tagColor.bg,
                borderWidth: 0,
              });
              page.drawCircle({
                x: tagX + tagWidth - cornerRadius,
                y: tagY + cornerRadius,
                size: cornerRadius,
                color: tagColor.bg,
                borderWidth: 0,
              });
              page.drawCircle({
                x: tagX + cornerRadius,
                y: tagY + tagHeight - cornerRadius,
                size: cornerRadius,
                color: tagColor.bg,
                borderWidth: 0,
              });
              page.drawCircle({
                x: tagX + tagWidth - cornerRadius,
                y: tagY + tagHeight - cornerRadius,
                size: cornerRadius,
                color: tagColor.bg,
                borderWidth: 0,
              });

              // Draw tag text
              page.drawText(tagText, {
                x: tagX + tagPadding * 2,
                y: currentY + 2,
                size: fontSize - 1,
                font: timesRomanBold,
                color: tagColor.text,
              });

              currentTagX = tagX - tagSpacing;
            }
          }

          currentY -= lineHeight + (i === 0 ? 5 : 0);
        }

        currentY -= 5;

        // Comment location (if exists) - show it prominently
        if (comment.location) {
          page.drawText(`Location: ${sanitizeText(comment.location)}`, {
            x: margin + 15,
            y: currentY,
            size: fontSize,
            font: timesRomanBold,
            color: rgb(0, 0, 0),
          });
          currentY -= lineHeight + 3;
        }

        // Show selected options if available
        if (comment.selectedOptions && comment.selectedOptions.length > 0) {
          const selectedText = `Selected: ${comment.selectedOptions
            .map((opt) => sanitizeText(opt))
            .join(", ")}`;
          page.drawText(selectedText, {
            x: margin + 15,
            y: currentY,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0, 0, 0),
          });
          currentY -= lineHeight + 3;
        }

        // Comment text (wrapped) - Style keywords
        const commentText =
          comment.text || comment.content || comment.commentText || "";

        // Check if we have a single image to place beside the text
        const hasSingleImage =
          includeImages && comment.photos && comment.photos.length === 1;
        const textMaxWidth = hasSingleImage
          ? width - margin * 2 - 200
          : width - margin * 2 - 30; // Reserve space for image on right

        // Split text by lines to handle keyword styling
        const textLines = commentText.split("\n");

        // Track the starting Y position for single image placement
        const textStartY = currentY;
        let textEndY = currentY;

        // Render text (will be on left if single image)
        if (commentText && commentText.trim() !== "") {
          for (const textLine of textLines) {
            const wrappedLines = wrapText(
              textLine,
              timesRomanFont,
              fontSize,
              textMaxWidth
            );

            for (const line of wrappedLines) {
              if (currentY < margin + 30) {
                currentY = await createNewPage();
              }

              // Check for special keywords and make them bold (but keep black color)
              const keywords = [
                "Maintenance",
                "Recommendation",
                "Safety Hazard",
                "Immediate Attention",
                "Monitor",
                "Repair",
                "Replace",
              ];

              let hasKeyword = false;
              for (const keyword of keywords) {
                if (line.includes(keyword)) {
                  hasKeyword = true;
                  // Draw with bold font but black color
                  page.drawText(line, {
                    x: margin + 15,
                    y: currentY,
                    size: fontSize,
                    font: timesRomanBold,
                    color: rgb(0, 0, 0),
                  });
                  break;
                }
              }

              if (!hasKeyword) {
                page.drawText(line, {
                  x: margin + 15,
                  y: currentY,
                  size: fontSize,
                  font: timesRomanFont,
                  color: rgb(0, 0, 0),
                });
              }

              currentY -= lineHeight;
            }
          }
          textEndY = currentY;
        }

        // Recommendation details (if exists) - show who to contact
        if (comment.recommendation && comment.recommendation.trim() !== "") {
          page.drawText(
            `Recommendation: Contact ${sanitizeText(comment.recommendation)}`,
            {
              x: margin + 15,
              y: currentY,
              size: fontSize,
              font: timesRomanFont,
              color: rgb(0, 0, 0),
            }
          );
          currentY -= lineHeight + 3;
        }

        // Display photos and videos with smart grid layout
        if (
          includeImages &&
          ((comment.photos && comment.photos.length > 0) ||
            (comment.videos && comment.videos.length > 0))
        ) {
          const numPhotos = comment.photos ? comment.photos.length : 0;
          const numVideos = comment.videos ? comment.videos.length : 0;
          const totalMedia = numPhotos + numVideos;

          // For single image: place beside comment text on the RIGHT side (aligned with text start)
          if (totalMedia === 1 && numPhotos === 1) {
            try {
              const photo = comment.photos[0];
              const imageBytes = await downloadImage(photo.url);

              let image;
              if (photo.url.toLowerCase().includes(".png")) {
                image = await pdfDoc.embedPng(imageBytes);
              } else {
                image = await pdfDoc.embedJpg(imageBytes);
              }

              // Single image sizing - for side placement
              const imgDims = image.scale(0.25);
              const maxImgWidth = 170;
              const maxImgHeight = 200;

              let imgWidth = imgDims.width;
              let imgHeight = imgDims.height;

              if (imgWidth > maxImgWidth) {
                const scale = maxImgWidth / imgWidth;
                imgWidth = maxImgWidth;
                imgHeight = imgHeight * scale;
              }

              if (imgHeight > maxImgHeight) {
                const scale = maxImgHeight / imgHeight;
                imgHeight = maxImgHeight;
                imgWidth = imgWidth * scale;
              }

              // Draw the image on the right side, aligned with text start
              const imageX = width - margin - imgWidth - 15;
              const imageY = textStartY; // Align with text top

              page.drawImage(image, {
                x: imageX,
                y: imageY - imgHeight,
                width: imgWidth,
                height: imgHeight,
              });

              // Add short caption below the image
              const shortName = `Photo ${comment.commentNumber || ""}`;
              page.drawText(shortName, {
                x: imageX,
                y: imageY - imgHeight - 12,
                size: fontSize - 2,
                font: timesRomanFont,
                color: rgb(0.5, 0.5, 0.5),
              });

              // Adjust currentY to be below both text and image
              const imageBottom = imageY - imgHeight - 25;
              currentY = Math.min(textEndY, imageBottom);
            } catch (imgError) {
              console.error(
                `  ⚠️  Failed to load image for comment ${comment.commentNumber}:`,
                imgError.message
              );
            }
          }
          // For 2 images/videos: 2-column grid (enlarged)
          else if (totalMedia === 2) {
            const gridSpacing = 15;
            const availableWidth = width - margin * 2 - 30;
            const imgBoxWidth = (availableWidth - gridSpacing) / 2;

            // Combine photos and videos
            const mediaItems = [];
            if (comment.photos) {
              comment.photos.forEach((photo) =>
                mediaItems.push({ type: "photo", data: photo })
              );
            }
            if (comment.videos) {
              comment.videos.forEach((video) =>
                mediaItems.push({ type: "video", data: video })
              );
            }

            let maxRowHeight = 0;

            for (let i = 0; i < Math.min(2, mediaItems.length); i++) {
              try {
                const mediaItem = mediaItems[i];
                const isVideo = mediaItem.type === "video";

                let image;
                let imgWidth, imgHeight;

                if (isVideo) {
                  // Create video placeholder with standard size
                  const videoWidth = 320;
                  const videoHeight = 240;
                  await createVideoPlaceholder(pdfDoc, videoWidth, videoHeight);

                  // Create a blue rectangle as video placeholder
                  const placeholderHeight = 200;
                  const placeholderWidth = imgBoxWidth;

                  imgWidth = placeholderWidth;
                  imgHeight = placeholderHeight;
                } else {
                  const imageBytes = await downloadImage(mediaItem.data.url);

                  if (mediaItem.data.url.toLowerCase().includes(".png")) {
                    image = await pdfDoc.embedPng(imageBytes);
                  } else {
                    image = await pdfDoc.embedJpg(imageBytes);
                  }

                  const imgDims = image.scale(0.35); // Enlarged from 0.25
                  const maxImgHeight = 200; // Enlarged from 150

                  imgWidth = imgDims.width;
                  imgHeight = imgDims.height;

                  if (imgWidth > imgBoxWidth) {
                    const scale = imgBoxWidth / imgWidth;
                    imgWidth = imgBoxWidth;
                    imgHeight = imgHeight * scale;
                  }

                  if (imgHeight > maxImgHeight) {
                    const scale = maxImgHeight / imgHeight;
                    imgHeight = maxImgHeight;
                    imgWidth = imgWidth * scale;
                  }
                }

                maxRowHeight = Math.max(maxRowHeight, imgHeight);

                // Check if we need a new page
                if (currentY < imgHeight + 50) {
                  currentY = await createNewPage();
                  maxRowHeight = 0;
                }

                // Position in grid
                const imgX = margin + 15 + i * (imgBoxWidth + gridSpacing);

                if (isVideo) {
                  // Draw video placeholder rectangle
                  const videoRect = page.drawRectangle({
                    x: imgX,
                    y: currentY - imgHeight,
                    width: imgWidth,
                    height: imgHeight,
                    color: rgb(0.2, 0.4, 0.7),
                  });

                  // Add clickable link annotation for video using pdf-lib API
                  if (mediaItem.data.url) {
                    const PDFLib = require("pdf-lib");
                    const linkAnnotation = page.doc.context.obj({
                      Type: "Annot",
                      Subtype: "Link",
                      Rect: [
                        imgX,
                        currentY - imgHeight,
                        imgX + imgWidth,
                        currentY,
                      ],
                      Border: [0, 0, 0],
                      A: {
                        S: "URI",
                        URI: PDFLib.PDFString.of(mediaItem.data.url),
                      },
                    });

                    const annotsArray = page.node.Annots();
                    if (annotsArray) {
                      annotsArray.push(linkAnnotation);
                    } else {
                      page.node.set(
                        PDFLib.PDFName.of("Annots"),
                        page.doc.context.obj([linkAnnotation])
                      );
                    }
                  }

                  // Draw play icon
                  const centerX = imgX + imgWidth / 2;
                  const centerY = currentY - imgHeight / 2;
                  const circleRadius = Math.min(imgWidth, imgHeight) / 8;

                  page.drawCircle({
                    x: centerX,
                    y: centerY,
                    size: circleRadius,
                    borderColor: rgb(1, 1, 1),
                    borderWidth: 3,
                  });

                  // Add "VIDEO" text
                  const videoFontSize = 14;
                  const videoText = "VIDEO";
                  const videoTextWidth = timesRomanBold.widthOfTextAtSize(
                    videoText,
                    videoFontSize
                  );

                  page.drawText(videoText, {
                    x: centerX - videoTextWidth / 2,
                    y: centerY - videoFontSize / 3,
                    size: videoFontSize,
                    font: timesRomanBold,
                    color: rgb(1, 1, 1),
                  });
                } else {
                  page.drawImage(image, {
                    x: imgX,
                    y: currentY - imgHeight,
                    width: imgWidth,
                    height: imgHeight,
                  });
                }

                // Short caption
                const shortName = isVideo ? `Video ${i + 1}` : `Photo ${i + 1}`;
                page.drawText(shortName, {
                  x: imgX,
                  y: currentY - imgHeight - 12,
                  size: fontSize - 2,
                  font: timesRomanFont,
                  color: rgb(0, 0, 0),
                });
              } catch (mediaError) {
                console.error(
                  `  ⚠️  Failed to load media ${i + 1} for comment ${
                    comment.commentNumber
                  }:`,
                  mediaError.message
                );
              }
            }

            currentY -= maxRowHeight + 25;
          }
          // For 3+ media items: 3-column grid (maximized width)
          else {
            const gridSpacing = 10;
            const availableWidth = width - margin * 2 - 30;
            const imgBoxWidth = (availableWidth - gridSpacing * 2) / 3;

            // Combine photos and videos
            const mediaItems = [];
            if (comment.photos) {
              comment.photos.forEach((photo) =>
                mediaItems.push({ type: "photo", data: photo })
              );
            }
            if (comment.videos) {
              comment.videos.forEach((video) =>
                mediaItems.push({ type: "video", data: video })
              );
            }

            let col = 0;
            let maxRowHeight = 0;
            let rowStartY = currentY;

            for (let i = 0; i < mediaItems.length; i++) {
              try {
                const mediaItem = mediaItems[i];
                const isVideo = mediaItem.type === "video";

                let image;
                let imgWidth, imgHeight;

                if (isVideo) {
                  // Create video placeholder

                  const placeholderHeight = 150; // Standard height for 3-grid
                  const placeholderWidth = imgBoxWidth; // Match box width

                  imgWidth = placeholderWidth;
                  imgHeight = placeholderHeight;
                } else {
                  const imageBytes = await downloadImage(mediaItem.data.url);

                  if (mediaItem.data.url.toLowerCase().includes(".png")) {
                    image = await pdfDoc.embedPng(imageBytes);
                  } else {
                    image = await pdfDoc.embedJpg(imageBytes);
                  }

                  const imgDims = image.scale(0.3); // Increased from 0.2 for larger display
                  const maxImgHeight = 150; // Increased from 120

                  imgWidth = imgDims.width;
                  imgHeight = imgDims.height;

                  // Scale to fit box width (maximize width usage)
                  if (imgWidth > imgBoxWidth) {
                    const scale = imgBoxWidth / imgWidth;
                    imgWidth = imgBoxWidth;
                    imgHeight = imgHeight * scale;
                  }

                  if (imgHeight > maxImgHeight) {
                    const scale = maxImgHeight / imgHeight;
                    imgHeight = maxImgHeight;
                    imgWidth = imgWidth * scale;
                  }
                }

                maxRowHeight = Math.max(maxRowHeight, imgHeight);

                // Check if we need a new page
                if (currentY < imgHeight + 50) {
                  currentY = await createNewPage();
                  rowStartY = currentY;
                  col = 0;
                  maxRowHeight = 0;
                }

                // Position in grid
                const imgX = margin + 15 + col * (imgBoxWidth + gridSpacing);

                if (isVideo) {
                  // Draw video placeholder rectangle
                  page.drawRectangle({
                    x: imgX,
                    y: rowStartY - imgHeight,
                    width: imgWidth,
                    height: imgHeight,
                    color: rgb(0.2, 0.4, 0.7),
                  });

                  // Add clickable link annotation for video using pdf-lib API
                  if (mediaItem.data.url) {
                    const PDFLib = require("pdf-lib");
                    const linkAnnotation = page.doc.context.obj({
                      Type: "Annot",
                      Subtype: "Link",
                      Rect: [
                        imgX,
                        rowStartY - imgHeight,
                        imgX + imgWidth,
                        rowStartY,
                      ],
                      Border: [0, 0, 0],
                      A: {
                        S: "URI",
                        URI: PDFLib.PDFString.of(mediaItem.data.url),
                      },
                    });

                    const annotsArray = page.node.Annots();
                    if (annotsArray) {
                      annotsArray.push(linkAnnotation);
                    } else {
                      page.node.set(
                        PDFLib.PDFName.of("Annots"),
                        page.doc.context.obj([linkAnnotation])
                      );
                    }
                  }

                  // Draw play icon
                  const centerX = imgX + imgWidth / 2;
                  const centerY = rowStartY - imgHeight / 2;
                  const circleRadius = Math.min(imgWidth, imgHeight) / 8;

                  page.drawCircle({
                    x: centerX,
                    y: centerY,
                    size: circleRadius,
                    borderColor: rgb(1, 1, 1),
                    borderWidth: 2,
                  });

                  // Add "VIDEO" text
                  const videoFontSize = 12;
                  const videoText = "VIDEO";
                  const videoTextWidth = timesRomanBold.widthOfTextAtSize(
                    videoText,
                    videoFontSize
                  );

                  page.drawText(videoText, {
                    x: centerX - videoTextWidth / 2,
                    y: centerY - videoFontSize / 3,
                    size: videoFontSize,
                    font: timesRomanBold,
                    color: rgb(1, 1, 1),
                  });
                } else {
                  page.drawImage(image, {
                    x: imgX,
                    y: rowStartY - imgHeight,
                    width: imgWidth,
                    height: imgHeight,
                  });
                }

                // Short caption with black text
                const shortName = isVideo ? `Video ${i + 1}` : `Photo ${i + 1}`;
                page.drawText(shortName, {
                  x: imgX,
                  y: rowStartY - imgHeight - 12,
                  size: fontSize - 2,
                  font: timesRomanFont,
                  color: rgb(0, 0, 0),
                });

                col++;

                // Move to next row after 3 items
                if (col >= 3) {
                  currentY = rowStartY - maxRowHeight - 25;
                  rowStartY = currentY;
                  col = 0;
                  maxRowHeight = 0;
                }
              } catch (mediaError) {
                console.error(
                  `  ⚠️  Failed to load media ${i + 1} for comment ${
                    comment.commentNumber
                  }:`,
                  mediaError.message
                );
              }
            }

            // Move Y position down if there are remaining items in incomplete row
            if (col > 0) {
              currentY = rowStartY - maxRowHeight - 25;
            }
          }
        }

        // Add horizontal line after each comment
        currentY -= 5;

        // Check if we need a new page for the line
        if (currentY < margin + 20) {
          currentY = await createNewPage();
        }

        page.drawLine({
          start: { x: margin + 15, y: currentY },
          end: { x: width - margin - 15, y: currentY },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8),
        });

        currentY -= 20; // Extra space after comment and line
      }

      currentY -= 10; // Extra space after all comments
    }

    currentY -= 5; // Space after line item
  }

  // Add section separator line
  if (currentY < margin + 40) {
    currentY = await createNewPage();
  }

  currentY -= 20;

  // Draw thick separator line
  page.drawLine({
    start: { x: margin, y: currentY },
    end: { x: width - margin, y: currentY },
    thickness: 2,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Draw section end text
  currentY -= 15;
  page.drawText("— End of Section —", {
    x:
      (width -
        timesRomanFont.widthOfTextAtSize("— End of Section —", fontSize - 1)) /
      2,
    y: currentY,
    size: fontSize - 1,
    font: timesRomanFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Note: Images are now displayed inline with their comments, not at the end
  return pdfDoc;
}

// Generate complete report with TOC
async function generateCompleteReport(
  inspectionData,
  outputPath,
  options = {}
) {
  console.log("\n" + "=".repeat(70));
  console.log("📄 Generating Complete Inspection Report");
  console.log("=".repeat(70) + "\n");

  const {
    includeTOC = true,
    includeImages = true,
    reportId = "Property Inspection Report",
  } = options;

  try {
    const sections =
      inspectionData?.inspection?.sections || inspectionData?.sections || [];

    if (sections.length === 0) {
      throw new Error("No sections found in inspection data");
    }

    console.log(`📊 Processing ${sections.length} sections...\n`);

    // Pre-load all images in parallel for massive speed improvement
    if (includeImages) {
      console.log("🚀 Pre-loading all images in parallel...");
      const startTime = Date.now();
      const imageCount = await preloadAllImages(inspectionData);
      const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`   ✅ Loaded ${imageCount} unique images in ${loadTime}s\n`);
    }

    const pdfDoc = await PDFDocument.create();

    // Set document metadata
    pdfDoc.setTitle("Property Inspection Report");
    pdfDoc.setAuthor("Inspection Service");
    pdfDoc.setSubject("Complete Property Inspection");
    pdfDoc.setCreator("PDF Generator v1.0");

    // Step 1: Add Cover Page
    console.log("📄 Step 1: Creating Cover Page...");
    const inspection = inspectionData?.inspection || inspectionData;
    await createCoverPage(pdfDoc, inspection);
    console.log("   ✅ Cover page added\n");

    // Step 2: Generate sections first to track page numbers
    console.log("📝 Step 2: Generating Section Content...\n");
    const sortedSections = [...sections].sort((a, b) => a.order - b.order);
    const sectionPageMap = {}; // Track starting page for each section

    for (let i = 0; i < sortedSections.length; i++) {
      const section = sortedSections[i];

      // Track starting page number for this section (after cover page)
      const currentPageCount = pdfDoc.getPageCount();
      const sectionNum = section.sectionNumber || (i + 1).toString();
      sectionPageMap[sectionNum] = currentPageCount + 2; // +2 because TOC will be inserted at position 2

      console.log(
        `   [${i + 1}/${sortedSections.length}] Processing: ${section.name}`
      );

      await generateSectionPage(pdfDoc, section, {
        ...options,
        reportId,
        pageNumber: sectionPageMap[sectionNum],
      });

      console.log(`   ✅ Section completed\n`);
    }

    // Step 3: Now insert Table of Contents at position 2 (after cover) with actual page numbers
    if (includeTOC) {
      console.log("📋 Step 3: Creating Table of Contents with page numbers...");
      const { createTableOfContents } = require("./create-table-of-contents");
      const tocBytes = await createTableOfContents(sections, {
        title: "Inspection Report - Table of Contents",
        fontSize: 11,
        includeLineItems: false,
        sectionPageMap, // Pass the actual page numbers
      });

      const tocDoc = await PDFDocument.load(tocBytes);
      const tocPages = await pdfDoc.copyPages(tocDoc, tocDoc.getPageIndices());

      // Insert TOC pages at position 1 (after cover page at position 0)
      for (let i = 0; i < tocPages.length; i++) {
        pdfDoc.insertPage(1 + i, tocPages[i]);
      }

      console.log(
        `   ✅ Inserted ${tocPages.length} TOC page(s) after cover\n`
      );
    }

    // Save the PDF
    console.log("💾 Step 4: Saving PDF...");
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    const fileSizeKB = (pdfBytes.length / 1024).toFixed(2);
    const pageCount = pdfDoc.getPageCount();

    console.log(`   ✅ PDF saved successfully!`);
    console.log(`   📄 Pages: ${pageCount}`);
    console.log(`   📦 Size: ${fileSizeKB} KB`);
    console.log(`   📁 Location: ${outputPath}`);

    console.log("\n" + "=".repeat(70));
    console.log("✨ Report Generation Complete!");
    console.log("=".repeat(70) + "\n");

    return {
      success: true,
      outputPath,
      pageCount,
      fileSize: fileSizeKB,
      pdfBytes,
    };
  } catch (error) {
    console.error("\n❌ Error generating report:", error);
    throw error;
  }
}

// Express route handler
async function generateCompleteReportHandler(req, res) {
  try {
    const inspectionData = req.body;
    const options = req.body?.options || {};

    const result = await generateCompleteReport(inspectionData, null, options);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=inspection-report.pdf"
    );
    res.setHeader("X-Report-Pages", result.pageCount);
    res.setHeader("X-Report-Size", result.fileSize);

    res.send(Buffer.from(result.pdfBytes));
  } catch (error) {
    console.error("Error generating complete report:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to generate complete report",
      details: error.message,
    });
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: node generate-complete-report.js <inspection.json> <output.pdf> [options]

Options:
  --no-toc              Skip table of contents
  --no-images           Skip image embedding
  --report-id "text"    Custom report identification

Examples:
  # Full report with everything
  node generate-complete-report.js inspection.json complete-report.pdf

  # Without images (faster)
  node generate-complete-report.js inspection.json report.pdf --no-images

  # Without TOC
  node generate-complete-report.js inspection.json report.pdf --no-toc
    `);
    process.exit(0);
  }

  const inputJson = args[0];
  const outputPdf = args[1];

  const options = {
    includeTOC: !args.includes("--no-toc"),
    includeImages: !args.includes("--no-images"),
    reportId: args.find((_, i) => args[i - 1] === "--report-id") || undefined,
  };

  console.log("📖 Reading inspection data...");
  const jsonContent = JSON.parse(fs.readFileSync(inputJson, "utf-8"));

  generateCompleteReport(jsonContent, outputPdf, options)
    .then(() => {
      console.log("🎉 Done! Open your report to view the results.\n");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Failed:", error.message);
      process.exit(1);
    });
}

module.exports = {
  generateCompleteReport,
  generateCompleteReportHandler,
  generateSectionPage,
  createPageHeader,
};
