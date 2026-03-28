import {Injectable} from '@angular/core';
import {HttpRequestService} from './http.requests.service';

/**
 * FilePersistenceService encapsulates the two HTTP operations that
 * StorageFilesEditorComponent uses to load and save file content.
 * Extracted to separate data-fetching from tab/editor lifecycle concerns.
 */
@Injectable()
export class FilePersistenceService {

  constructor(private http: HttpRequestService) {
  }

  /** Save file content to storage. Data must include relativePath, body, and fileLoadTime. */
  saveFile(data: any) {
    return this.http.post(data, REST_URLS.STORAGE.URLS.SAVE_FILE_TO_STORAGE, 'json');
  }

  /** Load file content from storage by relative path. */
  loadFile(relativePath: string) {
    return this.http.post({relativePath}, REST_URLS.STORAGE.URLS.LOAD_FILE_FROM_STORAGE, 'json');
  }
}
