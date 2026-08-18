import assert from 'node:assert/strict';
import test from 'node:test';
import { validateUsername, getImageExtension } from './helpers';

test('validateUsername rejects a whitespace-only name', () => {
  const result = validateUsername('  ');
  assert.equal(result.valid, false);
});

test('validateUsername trims before validating and the trimmed form is what should be saved', () => {
  const result = validateUsername('  Al  ');
  assert.equal(result.valid, true);
  assert.equal('  Al  '.trim(), 'Al');
});

test('validateUsername rejects disallowed characters like <script>', () => {
  const result = validateUsername('<script>');
  assert.equal(result.valid, false);
});

test('validateUsername rejects names longer than 32 characters', () => {
  const result = validateUsername('a'.repeat(33));
  assert.equal(result.valid, false);
});

test('validateUsername rejects a single-character name', () => {
  const result = validateUsername('A');
  assert.equal(result.valid, false);
});

test('validateUsername accepts Unicode letters, numbers, space, hyphen, underscore, apostrophe', () => {
  assert.equal(validateUsername('Jean-Luc').valid, true);
  assert.equal(validateUsername("O'Brien").valid, true);
  assert.equal(validateUsername('user_42').valid, true);
  assert.equal(validateUsername('José').valid, true);
  assert.equal(validateUsername('Zoë 2').valid, true);
});

test('validateUsername rejects a 2000-character blob', () => {
  const result = validateUsername('a'.repeat(2000));
  assert.equal(result.valid, false);
});

test('getImageExtension prefers the reported MIME type over the URI', () => {
  assert.equal(getImageExtension('file:///cache/foo', 'image/png'), 'png');
});

test('getImageExtension falls back to sniffing the URI when no MIME type is given', () => {
  assert.equal(getImageExtension('file:///cache/foo.JPG'), 'jpg');
});

test('getImageExtension falls back to "jpg" when neither MIME type nor extension is available', () => {
  assert.equal(getImageExtension('file:///cache/no-extension'), 'jpg');
});
