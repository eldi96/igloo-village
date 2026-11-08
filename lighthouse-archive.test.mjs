import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId } from './lighthouse-archive.js';

test('유튜브 링크에서 영상 id를 꺼내 썸네일에 쓴다', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://m.youtube.com/shorts/abc_123'), 'abc_123');
  assert.equal(youtubeId('https://example.com/watch?v=x'), null);
  assert.equal(youtubeId('not a link'), null);
});
