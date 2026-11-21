import test from 'node:test'
import assert from 'node:assert/strict'
import { detectStack } from '../scripts/lib/stack-detection.mjs'
test('identifies framework assets and generator signatures rather than prose mentions', () => {
 assert.equal(detectStack('<link href="/wp-content/themes/site/style.css">').platform,'WordPress')
 assert.equal(detectStack('<script src="/_next/static/chunk.js"></script>').platform,'Next.js')
 assert.equal(detectStack('<html data-astro-cid-abcd><link href="/_astro/main.css"></html>').platform,'Astro')
 assert.equal(detectStack('<meta content="Astro v5" name="generator">').platform,'Astro')
 assert.equal(detectStack('<p>We migrated from WordPress to Next.js and Astro</p>').platform,null)
 assert.equal(detectStack('<script>window.__NUXT__={}</script>').platform,'Nuxt')
})
test('rejects errors, challenges, parking and conflicting signatures', () => {
 assert.equal(detectStack('<link href="/wp-content/x">',{status:404}).platform,null)
 assert.equal(detectStack('<title>Just a moment...</title><script src="/_next/a"></script>').platform,null)
 assert.equal(detectStack('<script src="https://assets.abovedomains.com/javascript/forsale.min.js"></script><link href="/wp-content/x">').platform,null)
 assert.equal(detectStack('<title>Domain for sale</title><link href="/wp-content/x">').platform,null)
 assert.equal(detectStack('<script src="/_next/a"></script><link href="/wp-content/a">').platform,null)
})
