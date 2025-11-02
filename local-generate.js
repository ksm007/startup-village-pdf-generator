const fs = require('fs');
const path = require('path');
const generatePdf = require('./generatePdf');

(async () => {
  const inspectionPath = path.join(__dirname, 'inspection.json');
  const raw = fs.readFileSync(inspectionPath, 'utf8');
  const body = JSON.parse(raw);
  const req = { body };
  const res = {
    status(code){ this._status = code; return this; },
    json(payload){ console.log('response', this._status||200, payload); }
  };
  await generatePdf(req, res);
})();
