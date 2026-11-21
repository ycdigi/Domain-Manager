// Only framework-generated markup/assets count; prose and hosting headers do not.
export const detectStack = (html, { status = 200 } = {}) => {
 const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
 if (/assets\.abovedomains\.com|dynadot.{0,40}parking|domain.{0,15}may be for sale/i.test(html)) return {platform:null,evidence:[],reason:'parking_page'}
 if (status < 200 || status >= 300 || /just a moment|attention required|domain.{0,20}(sale|park)|website.{0,20}expired|buy this domain|access denied/i.test(title)) return { platform:null, evidence:[], reason:'error_challenge_or_parking' }
 const rules = [
  ['WordPress', /(?:src|href)\s*=\s*["'][^"']*(?:\/wp-content\/|\/wp-includes\/)|<meta\b(?=[^>]*\bname\s*=\s*["']generator["'])(?=[^>]*\bcontent\s*=\s*["']WordPress)[^>]*>/i],
  ['Next.js', /(?:src|href)\s*=\s*["'][^"']*\/_next\/|<script[^>]*\bid\s*=\s*["']__NEXT_DATA__["']/i],
  ['Astro', /(?:src|href)\s*=\s*["'][^"']*\/_astro\/|<astro-island\b|\bdata-astro-cid-[\w-]+|<meta\b(?=[^>]*\bname\s*=\s*["']generator["'])(?=[^>]*\bcontent\s*=\s*["']Astro\b)[^>]*>/i],
  ['Nuxt', /(?:src|href)\s*=\s*["'][^"']*\/_nuxt\/|window\.__NUXT__\s*=/i],
  ['Hugo', /<meta\b(?=[^>]*\bname\s*=\s*["']generator["'])(?=[^>]*\bcontent\s*=\s*["']Hugo\b)[^>]*>/i],
  ['Shopify', /(?:src|href)\s*=\s*["'][^"']*cdn\.shopify\.com\//i],
 ]
 const hits = rules.flatMap(([platform, pattern]) => { const match = html.match(pattern); return match ? [{platform,evidence:match[0].slice(0,180)}] : [] })
 return hits.length === 1 ? {platform:hits[0].platform,evidence:[hits[0].evidence],reason:'confirmed_signature'} : {platform:null,evidence:hits.map(h=>h.evidence),reason:hits.length?'conflicting_signatures':'no_signature'}
}
