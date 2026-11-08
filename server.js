// Local run: `npm start`, then open http://localhost:3000
try { process.loadEnvFile('.env'); } catch { /* no .env file is fine */ }
const { buildApp } = require('./src/build');

const port = Number(process.env.PORT) || 3000;
buildApp().listen(port, () => console.log(`Lead inbox running on http://localhost:${port}`));
