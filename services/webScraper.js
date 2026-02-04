import axios from 'axios';
import * as cheerio from 'cheerio';

// Extract text content from a single webpage
export async function scrapeWebpage(url) {
  try {
    // Fetch the webpage
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Load HTML into cheerio
    const $ = cheerio.load(response.data);

    // Remove script, style, and other non-content elements
    $('script, style, nav, footer, header, iframe, noscript').remove();

    // Extract text from body
    let text = $('body').text();

    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
      .replace(/\n+/g, '\n')  // Replace multiple newlines with single newline
      .trim();

    // Get page title
    const title = $('title').text() || $('h1').first().text() || 'Untitled Page';

    return {
      success: true,
      url: url,
      title: title.trim(),
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
      throw new Error('Failed to scrape website: ' + error.message);
    }
  }
}

// Extract all links from a page (for future crawling feature)
export async function extractLinks(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const links = [];
    const baseUrl = new URL(url);

    $('a[href]').each((i, elem) => {
      const href = $(elem).attr('href');
      
      try {
        // Convert relative URLs to absolute
        const absoluteUrl = new URL(href, url);
        
        // Only include links from the same domain
        if (absoluteUrl.hostname === baseUrl.hostname) {
          links.push(absoluteUrl.href);
        }
      } catch (e) {
        // Invalid URL, skip it
      }
    });

    // Remove duplicates
    return [...new Set(links)];

  } catch (error) {
    console.error('Error extracting links:', error.message);
    return [];
  }
}

// Crawl multiple pages from a website (limited to prevent abuse)
export async function crawlWebsite(startUrl, maxPages = 5) {
  const results = [];
  const visited = new Set();
  const toVisit = [startUrl];

  while (toVisit.length > 0 && results.length < maxPages) {
    const url = toVisit.shift();
    
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const pageData = await scrapeWebpage(url);
      results.push(pageData);

      // Get links from this page for crawling (optional - disabled by default for safety)
      // const links = await extractLinks(url);
      // toVisit.push(...links.filter(link => !visited.has(link)));

    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error.message);
    }

    // Small delay to be respectful to the server
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}
