import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Api } from '../src/api/api'

test('remote server file URLs do not point at the visitor\'s localhost', () => {
  const api = new Api('https://example.test', null)
  assert.equal(api.abs('http://localhost:8787/files/avatars/a.vrm'), 'https://example.test/files/avatars/a.vrm')
  assert.equal(api.abs('http://127.0.0.1:8787/files/thumbs/a.png'), 'https://example.test/files/thumbs/a.png')
  assert.equal(api.abs('https://cdn.example.test/files/avatars/a.vrm'), 'https://cdn.example.test/files/avatars/a.vrm')
  assert.equal(api.abs('http://localhost:8787/other'), 'http://localhost:8787/other')
})
