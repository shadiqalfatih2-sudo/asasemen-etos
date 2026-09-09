import "server-only";

type PdfLine = {
  text: string;
  bold?: boolean;
  size?: number;
  gapBefore?: number;
};

type PdfSection = {
  title: string;
  lines: string[];
};

type TextPdfInput = {
  title: string;
  subtitle?: string;
  classification?: string;
  sections: PdfSection[];
  footer?: string;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 48;
const TOP = 790;
const BOTTOM = 54;
const BODY_SIZE = 9.5;
const LINE_HEIGHT = 13;

function ascii(value: string) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");
}

function escapePdf(value: string) {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(value: string, max = 92) {
  const cleaned = ascii(value).replace(/\s+/g, " ").trim();
  if (!cleaned) return [""];
  const words = cleaned.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (word.length <= max) current = word;
    else {
      for (let index = 0; index < word.length; index += max) lines.push(word.slice(index, index + max));
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildLines(input: TextPdfInput): PdfLine[] {
  const lines: PdfLine[] = [];
  if (input.classification) lines.push({ text: input.classification.toUpperCase(), bold: true, size: 8 });
  lines.push({ text: input.title, bold: true, size: 18, gapBefore: 4 });
  if (input.subtitle) lines.push({ text: input.subtitle, size: 10 });
  lines.push({ text: "", size: 5 });

  for (const section of input.sections) {
    lines.push({ text: section.title.toUpperCase(), bold: true, size: 11, gapBefore: 5 });
    for (const raw of section.lines) {
      for (const wrapped of wrap(raw)) lines.push({ text: wrapped, size: BODY_SIZE });
    }
    lines.push({ text: "", size: 5 });
  }
  return lines;
}

function paginate(lines: PdfLine[]) {
  const pages: PdfLine[][] = [[]];
  let y = TOP;
  for (const line of lines) {
    const gap = line.gapBefore ?? 0;
    const height = Math.max(LINE_HEIGHT, (line.size ?? BODY_SIZE) + 4) + gap;
    if (y - height < BOTTOM) {
      pages.push([]);
      y = TOP;
    }
    pages[pages.length - 1].push(line);
    y -= height;
  }
  return pages;
}

function streamForPage(lines: PdfLine[], pageNumber: number, pageCount: number, footer?: string) {
  let y = TOP;
  const chunks: string[] = [];
  for (const line of lines) {
    y -= line.gapBefore ?? 0;
    const size = line.size ?? BODY_SIZE;
    const font = line.bold ? "F2" : "F1";
    if (line.text) {
      chunks.push(`BT /${font} ${size} Tf 1 0 0 1 ${MARGIN_X} ${y.toFixed(1)} Tm (${escapePdf(line.text)}) Tj ET`);
    }
    y -= Math.max(LINE_HEIGHT, size + 4);
  }
  const footerText = `${footer ? `${ascii(footer)} | ` : ""}Page ${pageNumber} of ${pageCount}`;
  chunks.push(`BT /F1 8 Tf 1 0 0 1 ${MARGIN_X} 30 Tm (${escapePdf(footerText)}) Tj ET`);
  return chunks.join("\n");
}

export function buildTextPdf(input: TextPdfInput) {
  const pages = paginate(buildLines(input));
  const objects: string[] = [];
  const pageRefs: number[] = [];

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  let objectNumber = 5;
  pages.forEach((page, index) => {
    const pageObject = objectNumber++;
    const contentObject = objectNumber++;
    pageRefs.push(pageObject);
    const stream = streamForPage(page, index + 1, pages.length, input.footer);
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  let output = "%PDF-1.4\n% ETOS Assessment Center\n";
  const offsets: number[] = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(output, "ascii");
    output += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "ascii");
}
