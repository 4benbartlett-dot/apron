export interface ParsedTransaction {
  player: string;
  pos: string;
  date: string;
  type: string;
  detail: string;
}
export function classify(detail: string): string;
export function parse(md: string): ParsedTransaction[];
