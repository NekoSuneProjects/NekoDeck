const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRockstarStatsHtml } = require('../server/providers.cjs');

test('Rockstar HTML parser extracts common label/value pairs', () => {
  const parsed = parseRockstarStatsHtml('<dt>Stamina</dt><dd>100/100</dd><dt>Strength</dt><dd>80/100</dd>');
  assert.deepEqual(parsed.stats.slice(0, 2), [
    { label: 'Stamina', value: '100/100' },
    { label: 'Strength', value: '80/100' }
  ]);
});
