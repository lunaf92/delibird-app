/** The first web link in shared text, which often wraps it: "Look at this! https://shop.example/x". */
export function firstLink(text: string | undefined): string | null {
  return text?.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? null;
}
