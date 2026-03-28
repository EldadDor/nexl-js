import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {HttpRequestService} from './http.requests.service';

/**
 * FileActionsService centralises all HTTP calls related to storage file
 * and directory operations. Extracted from StorageExplorerComponent to
 * separate data-fetching from tree-rendering concerns.
 *
 * All methods return raw Observables so the caller retains full control
 * over loading state, error handling, and subscription lifetime.
 */
@Injectable()
export class FileActionsService {

  constructor(private httpClient: HttpClient, private http: HttpRequestService) {
  }

  /** Load the top-level tree item list from the server. */
  loadTreeItems() {
    return this.httpClient.post<any>(REST_URLS.STORAGE.URLS.TREE_ITEMS, {});
  }

  /** Rename a file or directory. */
  renameItem(relativePath: string, newRelativePath: string) {
    return this.httpClient.post<any>(REST_URLS.STORAGE.URLS.RENAME, {
      relativePath,
      newRelativePath
    });
  }

  /** Delete a file or directory by its relative path. */
  deleteItem(relativePath: string) {
    return this.httpClient.post<any>(REST_URLS.STORAGE.URLS.DELETE, {relativePath});
  }

  /** Create a new directory at the given relative path. */
  makeDir(relativePath: string) {
    return this.httpClient.post<any>(REST_URLS.STORAGE.URLS.MAKE_DIR, {relativePath});
  }

  /** Move a file or directory from source to dest directory. */
  moveItem(source: string, dest: string) {
    return this.httpClient.post<any>(REST_URLS.STORAGE.URLS.MOVE, {source, dest});
  }

  /** Load the raw text content of a file (used for "make a copy"). */
  loadFileContent(relativePath: string) {
    return this.http.post({relativePath}, REST_URLS.STORAGE.URLS.LOAD_FILE_FROM_STORAGE, 'json');
  }
}
