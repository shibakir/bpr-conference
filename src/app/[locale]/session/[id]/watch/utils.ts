export function splitIntoParagraphs(
  text: string,
  sentencesPerParagraph = 2
): string[] {
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)/g;
  const matches = text.match(sentenceRegex);

  if (!matches) {
    return [text];
  }

  const paragraphs: string[] = [];
  for (let i = 0; i < matches.length; i += sentencesPerParagraph) {
    const chunk = matches.slice(i, i + sentencesPerParagraph).join("").trim();
    if (chunk) {
      paragraphs.push(chunk);
    }
  }

  const matchedTextLength = matches.join("").length;
  if (matchedTextLength < text.length) {
    const remaining = text.slice(matchedTextLength).trim();
    if (remaining) {
      if (paragraphs.length > 0) {
        paragraphs[paragraphs.length - 1] += " " + remaining;
      } else {
        paragraphs.push(remaining);
      }
    }
  }

  return paragraphs;
}
