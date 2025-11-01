
function generatePdf(req, res) {
    // basic handler: log incoming body and return a simple JSON response
    console.log('generatePdf called — body:s', req.body);
    res.json({ ok: true, message: 'generatePdf handler received the request' });
}

module.exports = generatePdf;