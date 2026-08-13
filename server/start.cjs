const { createApp } = require('./v3.cjs');

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3210);
const { app } = createApp({ mode: 'web' });
app.listen(port, host, () => {
  console.log(`NekoDeck web UI: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});
