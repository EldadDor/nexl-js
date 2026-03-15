import {AfterViewInit, Component, ViewChild} from '@angular/core';
import {jqxWindowComponent} from 'jqwidgets-scripts/jqwidgets-ts/angular_jqxwindow';
import {HttpClient} from '@angular/common/http';
import {MESSAGE_TYPE, MessageService} from '../../services/message.service';
import {GlobalComponentsService} from '../../services/global-components.service';
import {AppearanceService} from '../../services/appearance.service';
import {ICONS} from '../../misc/messagebox/messagebox.component';
import * as Diff from 'diff';

const VERSIONING_BASE = '/nexl/versioning';
const LOAD_FILE_URL = '/nexl/storage/load-file-from-storage';

@Component({
  selector: 'app-version-history',
  templateUrl: './version-history.component.html',
  styleUrls: ['./version-history.component.css']
})
export class VersionHistoryComponent implements AfterViewInit {
  @ViewChild('versionHistoryWindow') window: jqxWindowComponent;

  filePath = '';
  windowTitle = 'Version History';
  theme = AppearanceService.getTheme();

  selectedRevisionNo: number = null;
  revisionGrid: any = null;
  previewEditor: any = null;

  revisionSource = {
    localdata: [],
    datafields: [
      {name: 'revision_no', type: 'number'},
      {name: 'saved_at_str', type: 'string'},
      {name: 'size_bytes', type: 'number'},
      {name: 'saved_by', type: 'string'},
      {name: 'label', type: 'string'}
    ],
    datatype: 'array'
  };
  dataAdapter = new jqx.dataAdapter(this.revisionSource);
  columns: any[] = [
    {text: 'Rev #', datafield: 'revision_no', width: 55, align: 'center', cellsalign: 'center'},
    {text: 'Saved At', datafield: 'saved_at_str', width: 180},
    {text: 'By', datafield: 'saved_by', width: 110},
    {text: 'Size', datafield: 'size_bytes', width: 80, align: 'right', cellsalign: 'right'},
    {text: 'Label', datafield: 'label', minwidth: 120}
  ];

  isOpen = false;
  isAdmin = false;
  isDiffMode = false;
  revisionContent = '';

  constructor(
    private messageService: MessageService,
    private httpClient: HttpClient,
    private globalComponentsService: GlobalComponentsService
  ) {
    this.messageService.getMessage().subscribe(msg => {
      if (!msg) { return; }
      if (msg.type === MESSAGE_TYPE.AUTH_CHANGED) {
        this.isAdmin = !!msg.data.isAdmin;
      }
      if (msg.type === MESSAGE_TYPE.OPEN_VERSION_HISTORY) {
        this.open(msg.data);
      }
      if (msg.type === MESSAGE_TYPE.FILE_SAVED && this.isOpen && msg.data === this.filePath) {
        this.loadRevisions();
      }
    });
  }

  ngAfterViewInit() {
    // Initialise jqxGrid imperatively (same pattern as AdminsComponent)
    this.revisionGrid = jqwidgets.createInstance('#versionHistoryGrid', 'jqxGrid', {
      source: this.dataAdapter,
      columns: this.columns,
      width: '100%',
      height: 200,
      filterable: false,
      sortable: false,
      editable: false,
      rowsheight: 28,
      selectionmode: 'singlerow',
      theme: this.theme
    });

    this.revisionGrid.addEventHandler('rowselect', (event: any) => {
      const row = event.args.row;
      if (row) {
        this.selectedRevisionNo = row.revision_no;
        this.loadPreview(row.revision_no);
      }
    });

    // ACE read-only preview — set basePath before creating editor so mode files
    // resolve to the correct static URL even before the main editor has loaded
    ace.config.set('basePath', 'nexl/site/ace');
    const editor = ace.edit('version-history-preview');
    editor.setOptions({
      readOnly: true,
      useWorker: false,
      theme: 'ace/theme/xcode',
      mode: 'ace/mode/javascript',
      fontSize: '11pt',
      showGutter: true
    });
    editor.$blockScrolling = Infinity;
    this.previewEditor = editor;
  }

  open(filePath: string) {
    if (!this.isAdmin) {
      this.globalComponentsService.messageBox.openSimple(ICONS.ERROR, 'Version history is available to administrators only.');
      return;
    }
    this.filePath = filePath;
    this.isOpen = true;
    this.selectedRevisionNo = null;
    if (this.previewEditor) {
      this.previewEditor.setValue('');
    }
    this.window.open();
    this.loadRevisions();
  }

  close() {
    this.isOpen = false;
    this.window.close();
  }

  loadRevisions() {
    if (!this.filePath) {
      return;
    }
    this.globalComponentsService.loader.open();
    this.httpClient.post(
      `${VERSIONING_BASE}/list`,
      {filePath: this.filePath},
      {observe: 'response'}
    ).subscribe(
      (resp: any) => {
        this.globalComponentsService.loader.close();
        const rows = ((resp.body && resp.body.revisions) || []).map((r: any) => ({
          revision_no: r.revision_no,
          saved_at_str: new Date(r.saved_at).toLocaleString(),
          size_bytes: r.size_bytes,
          saved_by: r.saved_by || '',
          label: r.label || ''
        }));
        this.revisionSource.localdata = rows;
        this.revisionGrid.updatebounddata();
      },
      (err) => {
        this.globalComponentsService.loader.close();
        this.globalComponentsService.messageBox.openSimple(ICONS.ERROR, err.statusText || 'Failed to load revisions');
        console.error(err);
      }
    );
  }

  loadPreview(revisionNo: number) {
    this.isDiffMode = false;
    this.globalComponentsService.loader.open();
    this.httpClient.post(
      `${VERSIONING_BASE}/get`,
      {filePath: this.filePath, revisionNo: revisionNo},
      {observe: 'response'}
    ).subscribe(
      (resp: any) => {
        this.globalComponentsService.loader.close();
        const content = (resp.body && resp.body.revision && resp.body.revision.content) || '';
        this.revisionContent = content;
        if (this.previewEditor) {
          this.previewEditor.session.setMode('ace/mode/javascript');
          this.previewEditor.setValue(content, -1);
        }
      },
      (err) => {
        this.globalComponentsService.loader.close();
        this.globalComponentsService.messageBox.openSimple(ICONS.ERROR, err.statusText || 'Failed to load revision content');
        console.error(err);
      }
    );
  }

  toggleDiff() {
    if (!this.isAdmin || !this.selectedRevisionNo) {
      return;
    }
    if (this.isDiffMode) {
      this.isDiffMode = false;
      if (this.previewEditor) {
        this.previewEditor.session.setMode('ace/mode/javascript');
        this.previewEditor.setValue(this.revisionContent, -1);
      }
    } else {
      this.isDiffMode = true;
      this.loadDiff();
    }
  }

  private loadDiff() {
    this.globalComponentsService.loader.open();
    this.httpClient.post(
      LOAD_FILE_URL,
      {relativePath: this.filePath},
      {observe: 'response'}
    ).subscribe(
      (resp: any) => {
        this.globalComponentsService.loader.close();
        const currentContent = (resp.body && resp.body['file-body']) || '';
        const patch = (Diff as any).createPatch(
          this.filePath,
          this.revisionContent,
          currentContent,
          `Revision #${this.selectedRevisionNo}`,
          'Current version'
        );
        if (this.previewEditor) {
          this.previewEditor.session.setMode('ace/mode/diff');
          this.previewEditor.setValue(patch, -1);
        }
      },
      (err) => {
        this.globalComponentsService.loader.close();
        this.isDiffMode = false;
        this.globalComponentsService.messageBox.openSimple(ICONS.ERROR, err.statusText || 'Failed to load current file for diff');
        console.error(err);
      }
    );
  }

  restoreSelected() {
    if (!this.isAdmin) {
      this.globalComponentsService.messageBox.openSimple(ICONS.ERROR, 'Restore is available to administrators only.');
      return;
    }
    if (!this.selectedRevisionNo) {
      this.globalComponentsService.messageBox.openSimple(ICONS.INFO, 'Please select a revision to restore.');
      return;
    }

    const opts = {
      title: 'Confirm restore',
      label: `Restore file [${this.filePath}] to revision #${this.selectedRevisionNo}? This will overwrite the current version.`,
      height: 130,
      callback: (callbackData: any) => {
        if (callbackData.isConfirmed === true) {
          this.doRestore(this.selectedRevisionNo);
        }
      }
    };
    this.globalComponentsService.confirmBox.open(opts);
  }

  private doRestore(revisionNo: number) {
    this.globalComponentsService.loader.open();
    this.httpClient.post(
      `${VERSIONING_BASE}/restore`,
      {filePath: this.filePath, revisionNo: revisionNo},
      {observe: 'response'}
    ).subscribe(
      (_) => {
        this.globalComponentsService.loader.close();
        this.loadRevisions();
        // reload the file in the editor if it is currently open
        this.messageService.sendMessage(MESSAGE_TYPE.LOAD_FILE_FROM_STORAGE, {
          relativePath: this.filePath,
          forceReload: true
        });
        this.globalComponentsService.messageBox.openSimple(
          ICONS.INFO,
          `File restored to revision #${revisionNo}.`
        );
      },
      (err) => {
        this.globalComponentsService.loader.close();
        this.globalComponentsService.messageBox.openSimple(ICONS.ERROR, err.statusText || 'Restore failed');
        console.error(err);
      }
    );
  }
}
