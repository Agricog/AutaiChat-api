import axios from 'axios';
import * as cheerio from 'cheerio';

// Normalize URLs to prevent duplicates
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    // Remove trailing slash (except root)
    let path = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.origin + path;
  } catch {
    return url;
  }
}

// Skip non-HTML resources
function shouldSkipUrl(url) {
  const skipExtensions = [
    '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
    '.mp4', '.mp3', '.wav', '.avi', '.mov',
    '.zip', '.rar', '.gz', '.tar',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.css', '.js', '.json', '.xml', '.rss'
  ];
  const lower = url.toLowerCase();
  return skipExtensions.some(ext => lower.includes(ext));
}

// Extract text content from a single webpage
export async function scrapeWebpage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      maxRedirects: 5
    });

    // Only process HTML responses
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      throw new Error('Not an HTML page');
    }

    const $ = cheerio.load(response.data);

    // Remove script, style, and other non-content elements
    $('script, style, nav, footer, iframe, noscript, svg, [role="navigation"], .cookie-banner, #cookie-notice').remove();

    // Extract text from body
    let text = $('body').text();

    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();

    // Get page title
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled Page';

    return {
      success: true,
      url: url,
      title: title,
      content: text,
      wordCount: text.split(/\s+/).length
    };

  } catch (error) {
    console.error('Error scraping webpage:', error.message);
    
    if (error.code === 'ENOTFOUND') {
      throw new Error('Website not found. Please check the URL.');
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error('Connection refused. The website may be blocking automated access.');
    } else if (error.response && error.response.status === 404) {
      throw new Error('Page not found (404)');
    } else if (error.response && error.response.status === 403) {
      throw new Error('Access forbidden (403). The website may be blocking automated access.');
    } else {
      throw new Error('Failed to scrape: ' + error.message);
    }
  }
}

// Extract all links from a page
export async function extractLinks(url) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    const links = [];
    const baseUrl = new URL(url);

    $('a[href]').each((i, elem) => {
      const href = $(elem).attr('href');
      
      try {
        const absoluteUrl = new URL(href, url);
        
        // Only include links from the same domain
        if (absoluteUrl.hostname === baseUrl.hostname) {
          const cleanUrl = normalizeUrl(absoluteUrl.href);
          
          // Skip non-HTML resources, mailto, tel, javascript links
          if (!shouldSkipUrl(cleanUrl) && 
              !cleanUrl.startsWith('mailto:') && 
              !cleanUrl.startsWith('tel:') && 
              !cleanUrl.startsWith('javascript:')) {
            links.push(cleanUrl);
          }
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    return [...new Set(links)];

  } catch (error) {
    console.error('Error extracting links:', error.message);
    return [];
  }
}

// Crawl multiple pages from a website
export async function crawlWebsite(startUrl, maxPages = 100, onPageScraped = null) {
  const results = [];
  const visited = new Set();
  const toVisit = [normalizeUrl(startUrl)];

  console.log(`[Crawler] Starting crawl from ${startUrl} (max ${maxPages} pages)`);

  while (toVisit.length > 0 && results.length < maxPages) {
    const url = toVisit.shift();
    const normalizedUrl = normalizeUrl(url);
    
    if (visited.has(normalizedUrl)) continue;
    visited.add(normalizedUrl);

    console.log(`[Crawler] Scraping page ${results.length + 1}/${maxPages}: ${normalizedUrl}`);

    try {
      const pageData = await scrapeWebpage(normalizedUrl);
      
      // Skip pages with very little content (likely error pages, redirects)
      if (pageData.wordCount < 10) {
        console.log(`[Crawler] Skipping ${normalizedUrl} (only ${pageData.wordCount} words)`);
        continue;
      }
      
      results.push(pageData);
      
      // Call callback if provided (for real-time storage)
      if (onPageScraped) {
        await onPageScraped(pageData);
      }

      // Get links from this page for crawling
      const links = await extractLinks(normalizedUrl);
      console.log(`[Crawler] Found ${links.length} links on ${normalizedUrl}`);
      
      // Add new links to queue (filter already visited)
      const newLinks = links.filter(link => !visited.has(normalizeUrl(link)));
      toVisit.push(...newLinks);

    } catch (error) {
      console.error(`[Crawler] Failed to scrape ${normalizedUrl}:`, error.message);
    }

    // Small delay to be respectful
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[Crawler] Crawl complete. Scraped ${results.length} pages. Discovered ${visited.size} URLs total.`);
  return results;
}
