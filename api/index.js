// Vercel serverless entry: every non-static request is rewritten here (see vercel.json).
const { buildApp } = require('../src/build');

module.exports = buildApp();
