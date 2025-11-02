/**
 * Example script demonstrating different TOC generation options
 */

const fs = require("fs");
const path = require("path");
const { createTableOfContents } = require("./create-table-of-contents");
const {
  createNavigableTableOfContents,
  generateCompleteReport,
} = require("./create-navigable-toc");

async function runExamples() {
  console.log("\n" + "=".repeat(60));
  console.log("📚 Table of Contents Generator - Examples");
  console.log("=".repeat(60) + "\n");

  // Load inspection data
  const inspectionPath = path.join(__dirname, "inspection.json");
  const inspectionData = JSON.parse(fs.readFileSync(inspectionPath, "utf-8"));
  const sections = inspectionData.inspection.sections;

  console.log(`📊 Loaded ${sections.length} sections from inspection.json\n`);

  // Example 1: Basic TOC
  console.log("Example 1: Basic Table of Contents");
  console.log("-".repeat(60));
  try {
    const basicToc = await createTableOfContents(sections, {
      title: "Basic Table of Contents",
      fontSize: 12,
    });
    fs.writeFileSync("example-basic-toc.pdf", basicToc);
    console.log("✅ Created: example-basic-toc.pdf\n");
  } catch (error) {
    console.error("❌ Error:", error.message, "\n");
  }

  // Example 2: TOC with Line Items
  console.log("Example 2: Detailed TOC with Line Items");
  console.log("-".repeat(60));
  try {
    const detailedToc = await createTableOfContents(sections, {
      title: "Detailed Inspection Report",
      fontSize: 11,
      titleFontSize: 20,
      includeLineItems: true,
      lineHeight: 18,
    });
    fs.writeFileSync("example-detailed-toc.pdf", detailedToc);
    console.log("✅ Created: example-detailed-toc.pdf\n");
  } catch (error) {
    console.error("❌ Error:", error.message, "\n");
  }

  // Example 3: Navigable TOC with Metadata
  console.log("Example 3: Navigable TOC with Metadata");
  console.log("-".repeat(60));
  try {
    const { pdfBytes, metadata } = await createNavigableTableOfContents(
      sections,
      {
        title: "Property Inspection Report",
        fontSize: 12,
        includeLineItems: false,
        startPage: 2,
      }
    );
    fs.writeFileSync("example-navigable-toc.pdf", pdfBytes);
    fs.writeFileSync(
      "example-navigable-toc-metadata.json",
      JSON.stringify(metadata, null, 2)
    );
    console.log("✅ Created: example-navigable-toc.pdf");
    console.log("✅ Created: example-navigable-toc-metadata.json");
    console.log(`📊 Metadata includes ${metadata.length} section entries\n`);
  } catch (error) {
    console.error("❌ Error:", error.message, "\n");
  }

  // Example 4: Custom Styling
  console.log("Example 4: Custom Styled TOC");
  console.log("-".repeat(60));
  try {
    const styledToc = await createTableOfContents(sections, {
      title: "PROPERTY INSPECTION REPORT",
      fontSize: 14,
      titleFontSize: 24,
      lineHeight: 25,
      margin: 70,
    });
    fs.writeFileSync("example-styled-toc.pdf", styledToc);
    console.log("✅ Created: example-styled-toc.pdf\n");
  } catch (error) {
    console.error("❌ Error:", error.message, "\n");
  }

  // Example 5: Programmatic Section Filtering
  console.log("Example 5: Filtered TOC (First 5 Sections)");
  console.log("-".repeat(60));
  try {
    const filteredSections = sections.slice(0, 5);
    const filteredToc = await createTableOfContents(filteredSections, {
      title: "Partial Inspection Report",
    });
    fs.writeFileSync("example-filtered-toc.pdf", filteredToc);
    console.log(
      `✅ Created: example-filtered-toc.pdf (${filteredSections.length} sections)\n`
    );
  } catch (error) {
    console.error("❌ Error:", error.message, "\n");
  }

  // Example 6: Generate Summary Report
  console.log("Example 6: Section Summary");
  console.log("-".repeat(60));
  const summary = sections.map((section, idx) => ({
    number: section.sectionNumber || idx + 1,
    name: section.name,
    lineItemCount: section.lineItems?.length || 0,
    order: section.order,
  }));

  console.log("\nSection Summary:");
  summary.forEach((s) => {
    console.log(`  ${s.number}. ${s.name} (${s.lineItemCount} line items)`);
  });

  fs.writeFileSync(
    "example-section-summary.json",
    JSON.stringify(summary, null, 2)
  );
  console.log("\n✅ Created: example-section-summary.json\n");

  // Final Summary
  console.log("=".repeat(60));
  console.log("✨ All examples completed!");
  console.log("=".repeat(60));
  console.log("\nGenerated Files:");
  console.log("  1. example-basic-toc.pdf");
  console.log("  2. example-detailed-toc.pdf");
  console.log("  3. example-navigable-toc.pdf");
  console.log("  4. example-navigable-toc-metadata.json");
  console.log("  5. example-styled-toc.pdf");
  console.log("  6. example-filtered-toc.pdf");
  console.log("  7. example-section-summary.json");
  console.log("\n💡 Open any PDF to view the results!\n");
}

// Run examples
runExamples().catch((error) => {
  console.error("\n💥 Fatal error:", error);
  process.exit(1);
});
