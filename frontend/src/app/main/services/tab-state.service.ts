'use strict';

import {Injectable} from '@angular/core';
import {LocalStorageService, TABS} from './localstorage.service';

export interface TabSnapshot {
  relativePath: string;
  isNewFile: boolean;
  isChanged: boolean;
  fileLoadTime?: string;
  content?: string;
  active?: boolean;
}

/**
 * Handles localStorage persistence of the tab strip state.
 * The component owns jqxTabs/ACE DOM interactions; this service
 * owns the data serialisation contract and the localStorage key.
 */
@Injectable()
export class TabStateService {

  save(tabs: TabSnapshot[]) {
    LocalStorageService.storeObj(TABS, tabs);
  }

  load(): any[] {
    return LocalStorageService.loadObj(TABS, []);
  }
}
