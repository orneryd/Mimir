#!/usr/bin/env node
/**
 * Apply translations from JSON back into a DOCX file.
 * Uses docx library to create a new document with translated content.
 * 
 * Note: mammoth is read-only, so we create a simple new DOCX with translations.
 * For full formatting preservation, the original Python approach with python-docx is better.
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import fs from 'fs/promises';

/**
 * Apply translations and create new DOCX
 */
async function applyTranslations(translationsPath, outputPath) {
  const translationsJson = await fs.readFile(translationsPath, 'utf-8');
  const translations = JSON.parse(translationsJson);
  
  // Build document sections from translations
  const children = [];
  
  for (const item of translations) {
    const text = item.target || item.source;
    const style = item.style || 'body';
    
    if (style === 'heading1') {
      children.push(new Paragraph({
        text: text,
        heading: HeadingLevel.HEADING_1,
      }));
    } else if (style === 'heading2') {
      children.push(new Paragraph({
        text: text,
        heading: HeadingLevel.HEADING_2,
      }));
    } else if (style === 'bold') {
      children.push(new Paragraph({
        children: [new TextRun({ text: text, bold: true })],
      }));
    } else {
      children.push(new Paragraph({ text: text }));
    }
  }
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: children,
    }],
  });
  
  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(outputPath, buffer);
  
  console.log(`Applied ${translations.length} translations -> ${outputPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node apply_translations.mjs <translations.json> <output.docx>');
    process.exit(1);
  }
  
  const [translationsPath, outputPath] = args;
  
  try {
    await applyTranslations(translationsPath, outputPath);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
