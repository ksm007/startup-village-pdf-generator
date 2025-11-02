const express = require('express');
// require the handler exported from generatePdf.js
const generatePdf = require('./generatePdf');

const app = express();

// parse JSON bodies
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.send('Hello World!'));

// POST route for PDF generation
app.post('/genPdf', (req, res) => generatePdf(req, res));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));