export class HistoryStore {
  static getPdfPage(title: string): number {
    const page = localStorage.getItem(`pdf-history-${title}`);
    return page ? parseInt(page, 10) : 1;
  }

  static setPdfPage(title: string, page: number): void {
    localStorage.setItem(`pdf-history-${title}`, page.toString());
  }

  static getEpubCfi(title: string): string | null {
    return localStorage.getItem(`epub-history-${title}`);
  }

  static setEpubCfi(title: string, cfi: string): void {
    localStorage.setItem(`epub-history-${title}`, cfi);
  }

  static getEpubSpread(): 'none' | 'auto' {
    return (localStorage.getItem('epub-spread') as 'none' | 'auto') || 'auto';
  }

  static setEpubSpread(spread: 'none' | 'auto'): void {
    localStorage.setItem('epub-spread', spread);
  }

  static getEpubFontSize(): number {
    return parseInt(localStorage.getItem('epub-font-size') || '110', 10);
  }

  static setEpubFontSize(size: number): void {
    localStorage.setItem('epub-font-size', size.toString());
  }

  static getEpubFontFamily(): string {
    return localStorage.getItem('epub-font-family') || 'Georgia, serif';
  }

  static setEpubFontFamily(family: string): void {
    localStorage.setItem('epub-font-family', family);
  }

  static getEpubTheme(): string {
    return localStorage.getItem('epub-theme') || 'light';
  }

  static setEpubTheme(theme: string): void {
    localStorage.setItem('epub-theme', theme);
  }
}
