#!/usr/bin/env node
/**
 * Extract translatable text units from a DOCX file to JSON.
 * Uses mammoth for DOCX parsing.
 */
import mammoth from 'mammoth';
import fs from 'fs/promises';
import path from 'path';

const CODE_PATTERN = /^\s*\d{3}-\d{5}[A-Z]?\s*$|^\s*\d{6}\s*$/;

/**
 * Extract translation units from DOCX
 * mammoth extracts as HTML, we parse paragraphs from that
 */
async function extractUnits(docxPath) {
  const buffer = await fs.readFile(docxPath);
  
  // Get raw text with paragraph markers
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;
  
  // Also get HTML for structure detection
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const html = htmlResult.value;
  
  const units = [];
  
  // Split by paragraphs (double newlines or single newlines)
  const paragraphs = text.split(/\n+/).filter(p => p.trim());
  
  paragraphs.forEach((para, pi) => {
    const trimmed = para.trim();
    
    // Skip empty or code-only patterns
    if (!trimmed || CODE_PATTERN.test(trimmed)) {
      return;
    }
    
    // Detect style from HTML (basic heuristic)
    let style = 'body';
    if (html.includes(`<h1>${trimmed.substring(0, 20)}`)) style = 'heading1';
    else if (html.includes(`<h2>${trimmed.substring(0, 20)}`)) style = 'heading2';
    else if (html.includes(`<strong>${trimmed.substring(0, 20)}`)) style = 'bold';
    
    units.push({
      id: `body:p${pi}`,
      source: trimmed,
      style: style,
      where: 'body'
    });
  });
  
  return units;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node extract_docx.mjs <input.docx> <output.json>');
    process.exit(1);
  }
  
  const [inputPath, outputPath] = args;
  
  try {
    const units = await extractUnits(inputPath);
    await fs.writeFile(outputPath, JSON.stringify(units, null, 2), 'utf-8');
    console.log(`Extracted ${units.length} units -> ${outputPath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
