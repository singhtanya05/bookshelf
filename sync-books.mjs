import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SOURCE_DIR = path.resolve('bookspdf');
const TARGET_DIR = path.resolve('public', 'books');
const OUTPUT_JSON = path.resolve('src', 'bookData.json');

const PALETTE = [
  "#2B2B2B", "#5F4B3C", "#3B4A3F", "#E88D56", 
  "#C44943", "#2B3B4C", "#D1C9BE", "#DE8A75", 
  "#D56E52", "#2A2A28", "#879B75", "#2659A5", 
  "#E0B739", "#54407B", "#4B7A5C"
];

function getColorForTitle(title) {
  const hash = crypto.createHash('md5').update(title).digest('hex');
  const index = parseInt(hash.slice(0, 8), 16) % PALETTE.length;
  return PALETTE[index];
}

function parseFilename(filename) {
  let name = filename.replace(/\.(pdf|epub)$/i, '');
  
  // Remove common junk prefixes/suffixes
  name = name.replace(/^dokumen\.pub_/i, '');
  name = name.replace(/--\s*\(.*?\)/g, ''); // remove like -- ( WeLib.org )
  name = name.replace(/-?\s*\d{10,}.*/, ''); // remove trailing ISBNs
  
  let title = name;
  let author = 'Unknown Author';
  
  if (name.includes('--')) {
    const parts = name.split('--').map(s => s.trim());
    title = parts[0];
    if (parts[1]) author = parts[1];
  } else if (name.includes(' - ')) {
    const parts = name.split(' - ').map(s => s.trim());
    title = parts[0];
    if (parts[1]) author = parts[1];
  }
  
  // Clean up title
  title = title.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  author = author.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Title case function
  const toTitleCase = (str) => {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  };
  
  return { title: toTitleCase(title), author: toTitleCase(author) };
}

function main() {
  console.log("Scanning bookspdf directory...");
  if (!fs.existsSync(SOURCE_DIR)) {
    console.log("bookspdf directory does not exist. Creating it.");
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
  }

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.pdf') || f.endsWith('.epub'));
  
  const books = [];

  for (const file of files) {
    const sourcePath = path.join(SOURCE_DIR, file);
    
    // Safely copy to target dir
    // Create a clean filename for URL
    const cleanFile = file.replace(/[^a-zA-Z0-9.\-]/g, '_');
    const targetPath = path.join(TARGET_DIR, cleanFile);
    
    if (!fs.existsSync(targetPath)) {
      console.log(`Copying new book: ${file}`);
      fs.copyFileSync(sourcePath, targetPath);
    }
    
    const { title, author } = parseFilename(file);
    const color = getColorForTitle(title);
    
    const isPdf = file.endsWith('.pdf');
    
    books.push({
      title,
      author,
      color,
      pdfUrl: isPdf ? `books/${cleanFile}` : undefined,
      epubUrl: !isPdf ? `books/${cleanFile}` : undefined
    });
  }

  // Prepend some of the hardcoded defaults just so the shelf isn't empty if bookspdf is empty
  const defaultBooks = [
    { title: "The Dream Machine", author: "M. Mitchell Waldrop", color: "#E88D56" },
    { title: "The Art of Doing Science", author: "Richard W. Hamming", color: "#C44943" },
    { title: "Poor Charlie's Almanack", author: "Peter D. Kaufman", color: "#2B3B4C" },
    { title: "High Growth Handbook", author: "Elad Gil", color: "#D1C9BE" },
    { title: "Origins of Efficiency", author: "Brian Potter", color: "#DE8A75" }
  ];
  
  // Deduplicate default books if they exist in books
  const finalBooks = [...books];
  for (const db of defaultBooks) {
    if (!books.find(b => b.title === db.title)) {
      finalBooks.push(db);
    }
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(finalBooks, null, 2));
  console.log(`Successfully synced ${books.length} files. Total library size: ${finalBooks.length}`);
}

main();
