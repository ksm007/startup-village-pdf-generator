const express = require("express");
// require the handler exported from generatePdf.js
const generatePdf = require("./generatePdf");
const {
  generateTableOfContentsHandler,
} = require("./create-table-of-contents");
const { generateCompleteReportHandler } = require("./generate-complete-report");

const app = express();

// parse JSON bodies
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => res.send("Hello World!"));

// POST route for PDF generation
app.post("/genPdf", (req, res) => generatePdf(req, res));

// POST route for Table of Contents generation
app.post("/genTOC", (req, res) => generateTableOfContentsHandler(req, res));

// POST route for Complete Report generation
app.post("/genCompleteReport", (req, res) =>
  generateCompleteReportHandler(req, res)
);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
