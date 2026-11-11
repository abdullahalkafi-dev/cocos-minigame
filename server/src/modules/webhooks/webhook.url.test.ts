import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeWebhookUrl, isPrivateAddress } from './webhook.url.js';
import { signPayload } from './webhook.service.js';

test('private and local addresses are recognised', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '172.31.255.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
});

test('webhook addresses: https only, no credentials, no private networks', async () => {
  await assert.rejects(assertSafeWebhookUrl('http://example.com/hook', false), /https/);
  await assert.rejects(assertSafeWebhookUrl('https://user:pw@example.com/hook', false), /user name/);
  await assert.rejects(assertSafeWebhookUrl('not a url', false), /full address/);
  await assert.rejects(assertSafeWebhookUrl('https://127.0.0.1/hook', false), /private/);
  await assert.rejects(assertSafeWebhookUrl('https://[::1]/hook', false), /private/);
  await assert.rejects(assertSafeWebhookUrl('https://169.254.169.254/latest/meta-data', false), /private/);
  assert.equal((await assertSafeWebhookUrl('https://8.8.8.8/hook', false)).hostname, '8.8.8.8');
  assert.equal((await assertSafeWebhookUrl('http://127.0.0.1:9/hook', true)).port, '9', 'development mode allows local http');
});

test('signature: HMAC-SHA256 of "<timestamp>.<body>"', () => {
  // known answer, so a receiver written from the documentation can be checked against it
  assert.equal(signPayload('whsec_test', 1700000000, '{"a":1}'), '38877139021993b830af32feea6e18a8da83eb2f6e49ee50bd9e4cf4ca4d3789');
  assert.match(signPayload('whsec_test', 1700000000, '{"a":1}'), /^[0-9a-f]{64}$/);
  assert.notEqual(signPayload('whsec_test', 1700000000, '{"a":1}'), signPayload('whsec_test', 1700000001, '{"a":1}'), 'timestamp is part of the signature');
  assert.notEqual(signPayload('whsec_test', 1700000000, '{"a":1}'), signPayload('whsec_other', 1700000000, '{"a":1}'));
});
