export type Theme = 'light' | 'dark';

// jqWidgets themes that are considered "dark" — switching to any of these
// will automatically activate the dark CSS custom property layer.
export const DARK_JQX_THEMES = ['dark', 'metrodark', 'ui-darkness', 'black', 'shinyblack', 'highcontrast'];

export class ThemeService {
  private static readonly STORAGE_KEY = 'nexl-theme';

  /** Returns the currently active theme, falling back to the OS preference. */
  static get(): Theme {
    const stored = localStorage.getItem(this.STORAGE_KEY) as Theme;
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /** Applies the given theme to the document and persists it. */
  static set(theme: Theme): void {
    localStorage.setItem(this.STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }

  /** Should be called once before Angular bootstraps (in main.ts). */
  static init(): void {
    this.set(this.get());
  }

  /** Toggles between light and dark, returns the new theme. */
  static toggle(): Theme {
    const next: Theme = this.get() === 'dark' ? 'light' : 'dark';
    this.set(next);
    return next;
  }

  /** Returns true if the supplied jqWidgets theme name is a dark variant. */
  static isDarkJqxTheme(themeName: string): boolean {
    return DARK_JQX_THEMES.indexOf(themeName) >= 0;
  }

  /** Returns the recommended jqWidgets base theme for the current mode. */
  static getDefaultJqxTheme(): string {
    return this.get() === 'dark' ? 'metrodark' : 'metro';
  }
}
