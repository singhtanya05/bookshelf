/**
 * Per-device reading preferences.
 *
 * These deliberately stay in localStorage rather than the database: font size
 * and theme are properties of the screen you are reading on, not of you. Your
 * phone wanting bigger text should not push bigger text to your laptop.
 * Reading *position* is the opposite, and lives in ProgressStore.
 */
export class ReaderSettings {
  static getSpread(): 'none' | 'auto' {
    return (localStorage.getItem('epub-spread') as 'none' | 'auto') || 'auto';
  }
  static setSpread(spread: 'none' | 'auto'): void {
    localStorage.setItem('epub-spread', spread);
  }

  static getFontSize(): number {
    return parseInt(localStorage.getItem('epub-font-size') || '110', 10);
  }
  static setFontSize(size: number): void {
    localStorage.setItem('epub-font-size', size.toString());
  }

  static getFontFamily(): string {
    return localStorage.getItem('epub-font-family') || 'Georgia, serif';
  }
  static setFontFamily(family: string): void {
    localStorage.setItem('epub-font-family', family);
  }

  static getTheme(): string {
    return localStorage.getItem('epub-theme') || 'light';
  }
  static setTheme(theme: string): void {
    localStorage.setItem('epub-theme', theme);
  }
}
