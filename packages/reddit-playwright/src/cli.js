import { extractRedditThread } from './reddit-extractor.js';
import { formatThreadToMarkdown } from './markdown-formatter.js';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node src/cli.js <reddit-url>');
    process.exit(1);
  }

  console.log(`[Playwright Reddit Extractor] Navigating to: ${url}...`);

  try {
    const postData = await extractRedditThread(url);
    console.log(`[Success] Extracted via method: ${postData.extractionMethod}`);
    
    const markdown = formatThreadToMarkdown(postData);
    console.log('\n=================== EXTRACTED MARKDOWN ===================\n');
    console.log(markdown);
    console.log('==========================================================\n');
  } catch (err) {
    console.error('[Error] Extraction failed:', err.message);
    process.exit(1);
  }
}

main();
