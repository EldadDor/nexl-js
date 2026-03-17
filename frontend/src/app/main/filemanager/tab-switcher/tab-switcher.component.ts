import {Component, HostListener, OnInit} from '@angular/core';
import {GlobalComponentsService} from '../../services/global-components.service';
import {MESSAGE_TYPE, MessageService} from '../../services/message.service';
import {ThemeService} from '../../services/theme.service';

@Component({
  selector: 'app-tab-switcher',
  templateUrl: './tab-switcher.component.html',
  styleUrls: ['./tab-switcher.component.css']
})
export class TabSwitcherComponent implements OnInit {
  isOpen = false;
  tabs: any[] = [];
  selectedIndex = 0;
  isDark = false;

  constructor(private globalComponentsService: GlobalComponentsService, private messageService: MessageService) {
    this.messageService.getMessage().subscribe(message => {
      if (message.type === MESSAGE_TYPE.OPEN_TAB_SWITCHER) {
        this.open();
      }
    });
  }

  ngOnInit() {
  }

  open() {
    const editor = this.globalComponentsService.storageFilesEditorComponent;
    if (!editor) {
      return;
    }

    this.tabs = editor.getAllTabsInfo();
    if (this.tabs.length === 0) {
      return;
    }

    this.isDark = ThemeService.get() === 'dark';

    if (!this.isOpen) {
      // First open: pre-select the active tab
      const activeIdx = this.tabs.findIndex(t => t.isActive);
      this.selectedIndex = activeIdx >= 0 ? activeIdx : 0;
      this.isOpen = true;
    } else {
      // Already open: cycle to next item (like IntelliJ Ctrl+E behaviour)
      this.selectedIndex = (this.selectedIndex + 1) % this.tabs.length;
    }

    this.scrollSelectedIntoView();
  }

  close() {
    this.isOpen = false;
  }

  selectTab(tab: any) {
    this.messageService.sendMessage(MESSAGE_TYPE.LOAD_FILE_FROM_STORAGE, {
      relativePath: tab.relativePath
    });
    this.close();
  }

  onOverlayClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('tab-switcher-overlay')) {
      this.close();
    }
  }

  private scrollSelectedIntoView() {
    setTimeout(() => {
      const list = document.getElementById('tab-switcher-list');
      if (!list) {
        return;
      }
      const item = list.children[this.selectedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({block: 'nearest'});
      }
    }, 0);
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (!this.isOpen) {
      return;
    }

    // Ctrl+E while open: cycle to next (same as open())
    const char = String.fromCharCode(event.which).toLowerCase();
    if (char === 'e' && event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      this.selectedIndex = (this.selectedIndex + 1) % this.tabs.length;
      this.scrollSelectedIntoView();
      return;
    }

    if (event.which === 27) { // Escape
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }

    if (event.which === 40) { // Arrow Down
      event.preventDefault();
      event.stopPropagation();
      this.selectedIndex = (this.selectedIndex + 1) % this.tabs.length;
      this.scrollSelectedIntoView();
      return;
    }

    if (event.which === 38) { // Arrow Up
      event.preventDefault();
      event.stopPropagation();
      this.selectedIndex = (this.selectedIndex - 1 + this.tabs.length) % this.tabs.length;
      this.scrollSelectedIntoView();
      return;
    }

    if (event.which === 13) { // Enter
      event.preventDefault();
      event.stopPropagation();
      if (this.selectedIndex >= 0 && this.selectedIndex < this.tabs.length) {
        this.selectTab(this.tabs[this.selectedIndex]);
      }
      return;
    }

    // Block all other keys from reaching the editor while switcher is open
    event.stopPropagation();
  }
}
