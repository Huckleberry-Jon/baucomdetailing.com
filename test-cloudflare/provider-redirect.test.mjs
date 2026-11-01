import test from 'node:test';
import assert from 'node:assert/strict';
import * as mfLibrary from 'miniflare';
import { readFileSync } from 'node:fs';
test('provider requests use Workers-supported redirects and never follow redirects', async () => {
  const source = readFileSync(new URL('../cloudflare/notifications.js', import.meta.url), 'utf8');
  const modes = [...source.matchAll(/redirect: "([^"]+)"/g)].map(m => m[1]);
  assert.equal(modes.length, 2);
  assert.ok(modes.every(mode => mode === 'manual'));
  const convert = mfLibrary.convertV4MiniflareOptions ?? (x => x);
  const mf = new mfLibrary.Miniflare(convert({workers:[{name:'main',modules:true,script:
    'export default {async fetch(){const r=new Request("https://api.resend.com/emails",{redirect:"manual"});return Response.json({redirect:r.redirect})}}'
  }]}));
  try { assert.deepEqual(await (await mf.dispatchFetch('http://localhost')).json(), {redirect:'manual'}); }
  finally { await mf.dispose(); }
});
