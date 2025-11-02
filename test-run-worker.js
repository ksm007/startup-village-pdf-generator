const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

(async () => {
  const inspectionPath = path.join(__dirname, 'inspection.json');
  const raw = fs.readFileSync(inspectionPath, 'utf8');
  const data = JSON.parse(raw);

  // Pick a section that likely has the hose bib photos from provided inspection.json
  // Try to find a section that contains a lineItem with photos
  let targetSection = null;
  if (data?.inspection?.sections) {
    for (const sec of data.inspection.sections) {
      if (sec.lineItems) {
        for (const li of sec.lineItems) {
          if (li.comments) {
            for (const c of li.comments) {
              if (c.photos && c.photos.length > 0) {
                targetSection = sec;
                break;
              }
            }
          }
          if (targetSection) break;
        }
      }
      if (targetSection) break;
    }
  }

  if (!targetSection) {
    console.error('No section with photos found in inspection.json');
    process.exit(1);
  }

  const workerFile = path.join(__dirname, 'worker.js');
  const w = new Worker(workerFile, { workerData: targetSection });

  w.on('message', (msg) => {
    console.log('Worker message:', Object.keys(msg));
    if (msg.pdfBytes) {
      const outPath = path.join(__dirname, 'pdfs', `test-section-${targetSection.name || 'section'}.pdf`);
      fs.writeFileSync(outPath, msg.pdfBytes);
      console.log('Saved PDF to', outPath);
    }
  });

  w.on('error', (err) => {
    console.error('Worker error:', err);
  });

  w.on('exit', (code) => {
    console.log('Worker exited with', code);
  });
})();