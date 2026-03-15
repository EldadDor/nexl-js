import {Injectable} from '@angular/core';

/**
 * Thin wrapper around the global ACE editor API.
 * Centralises all direct `ace.edit()` calls so they can be
 * easily mocked, tested, or swapped out in the future.
 */
@Injectable()
export class AceWrapperService {

  create(elementId: string, options: any = {}) {
    const editor = ace.edit(elementId);
    editor.setOptions(options);
    editor.$blockScrolling = Infinity;
    return editor;
  }

  destroy(elementId: string) {
    ace.edit(elementId).destroy();
  }

  getValue(elementId: string): string {
    return ace.edit(elementId).getValue();
  }

  setValue(elementId: string, content: string, cursorPos: number = -1) {
    ace.edit(elementId).setValue(content, cursorPos);
  }

  setReadOnly(elementId: string, readOnly: boolean) {
    ace.edit(elementId).setReadOnly(readOnly);
  }

  setTheme(elementId: string, theme: string) {
    ace.edit(elementId).setTheme(theme);
  }

  setOption(elementId: string, key: string, value: any) {
    ace.edit(elementId).setOption(key, value);
  }

  resize(elementId: string) {
    ace.edit(elementId).resize();
  }

  focus(elementId: string) {
    ace.edit(elementId).focus();
  }

  gotoLine(elementId: string, line: number, column: number = 0) {
    ace.edit(elementId).gotoLine(line, column);
  }

  getCursorPosition(elementId: string) {
    return ace.edit(elementId).getCursorPosition();
  }
}
