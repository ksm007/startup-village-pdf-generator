/**
 * Test script for Complete Report Generation
 *
 * Usage:
 *   node test-complete-report.js                    # Full report with TOC and images
 *   node test-complete-report.js --no-images        # Without images (faster)
 *   node test-complete-report.js --no-toc           # Without Table of Contents
 *   node test-complete-report.js --quick            # Quick test (no TOC, no images)
 */

const { generateCompleteReport } = require("./generate-complete-report");
const path = require("path");
const fs = require("fs");

async function testCompleteReport() {
  const inputFile = path.join(__dirname, "inspection.json");
  const outputFile = path.join(__dirname, "bonus.pdf");

  // Parse command line options
  const args = process.argv.slice(2);
  const options = {
    includeTOC: !args.includes("--no-toc") && !args.includes("--quick"),
    includeImages: !args.includes("--no-images") && !args.includes("--quick"),
    reportId: "Property Inspection Report - 1234 Main Street",
  };

  console.log("\n" + "━".repeat(70));
  console.log("🧪 Testing Complete Report Generation");
  console.log("━".repeat(70));
  console.log(`📂 Input:  ${inputFile}`);
  console.log(`📄 Output: ${outputFile}`);
  console.log(`⚙️  Configuration:`);
  console.log(`   - Include TOC: ${options.includeTOC}`);
  console.log(`   - Include Images: ${options.includeImages}`);
  console.log(`   - Report ID: ${options.reportId}`);
  console.log("━".repeat(70) + "\n");

  try {
    // Read inspection data
    const inspectionData = JSON.parse(fs.readFileSync(inputFile, "utf-8"));

    // Generate report
    const startTime = Date.now();
    const result = await generateCompleteReport(
      inspectionData,
      outputFile,
      options
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("📊 Generation Statistics:");
    console.log(`   ⏱️  Time taken: ${duration} seconds`);
    console.log(`   📄 Total pages: ${result.pageCount}`);
    console.log(`   📦 File size: ${result.fileSize} KB`);
    console.log(`   💾 Saved to: ${result.outputPath}`);

    console.log("\n" + "━".repeat(70));
    console.log("✅ Test completed successfully!");
    console.log("💡 Open bonus.pdf to view the result.");
    console.log("━".repeat(70) + "\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testCompleteReport();
