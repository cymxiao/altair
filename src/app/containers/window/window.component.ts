import {
  Component,
  ViewChild,
  Input,
  OnInit,
  ViewContainerRef
} from '@angular/core';
import { Store } from '@ngrx/store';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';

import * as fromRoot from '../../reducers';
import * as fromHeader from '../../reducers/headers/headers';
import * as fromHistory from '../../reducers/history/history';
import * as fromVariable from '../../reducers/variables/variables';

import * as queryActions from '../../actions/query/query';
import * as headerActions from '../../actions/headers/headers';
import * as variableActions from '../../actions/variables/variables';
import * as dialogsActions from '../../actions/dialogs/dialogs';
import * as docsActions from '../../actions/docs/docs';
import * as layoutActions from '../../actions/layout/layout';
import * as schemaActions from '../../actions/gql-schema/gql-schema';
import * as historyActions from '../../actions/history/history';

import { QueryService, GqlService, NotifyService } from '../../services';
import { graphql } from 'graphql';
import { Observable } from 'rxjs/Observable';

@Component({
  selector: 'app-window',
  templateUrl: './window.component.html'
})
export class WindowComponent implements OnInit {
  queryResult$: Observable<any>;
  showDocs$: Observable<boolean>;
  docsIsLoading$: Observable<boolean>;
  headers$: Observable<fromHeader.State>;
  variables$: Observable<string>;
  isLoading$: Observable<boolean>;
  introspection$: Observable<any>;
  allowIntrospection$: Observable<boolean>;
  responseStatus$: Observable<number>;
  responseTime$: Observable<number>;
  responseStatusText$: Observable<string>;
  isSubscribed$: Observable<boolean>;
  subscriptionResponses$: Observable<string[]>;

  @Input() windowId: string;

  apiUrl = '';
  httpVerb = '';
  initialQuery = '';
  query = '';

  showHeaderDialog = false;
  showVariableDialog = false;
  showSubscriptionUrlDialog = false;
  showHistoryDialog = false;

  gqlSchema = null;

  subscriptionUrl = '';

  historyList: fromHistory.HistoryList = [];

  collapsed = false;

  constructor(
    private queryService: QueryService,
    private gql: GqlService,
    private notifyService: NotifyService,
    private store: Store<fromRoot.State>,
    private toastr: ToastsManager,
    private vRef: ViewContainerRef
  ) {

    // Required by the notify service
    this.toastr.setRootViewContainerRef(this.vRef);
  }

  ngOnInit() {
    this.queryResult$ = this.getWindowState().select(fromRoot.getQueryResult);
    this.showDocs$ = this.getWindowState().select(fromRoot.getShowDocs);
    this.docsIsLoading$ = this.getWindowState().select(fromRoot.getDocsLoading);
    this.headers$ = this.getWindowState().select(fromRoot.getHeaders);
    this.variables$ = this.getWindowState().select(fromRoot.getVariables);
    this.isLoading$ = this.getWindowState().select(fromRoot.getIsLoading);
    this.introspection$ = this.getWindowState().select(fromRoot.getIntrospection);
    this.allowIntrospection$ = this.getWindowState().select(fromRoot.allowIntrospection);
    this.responseStatus$ = this.getWindowState().select(fromRoot.getResponseStatus);
    this.responseTime$ = this.getWindowState().select(fromRoot.getResponseTime);
    this.responseStatusText$ = this.getWindowState().select(fromRoot.getResponseStatusText);
    this.isSubscribed$ = this.getWindowState().select(fromRoot.isSubscribed);
    this.subscriptionResponses$ = this.getWindowState().select(fromRoot.getSubscriptionResponses);

    this.store
      .map(data => data.windows[this.windowId])
      .distinctUntilChanged()
      .subscribe(data => {
        if (!data) {
          return false;
        }

        this.apiUrl = data.query.url;
        this.query = data.query.query;
        this.httpVerb = data.query.httpVerb;
        this.showHeaderDialog = data.dialogs.showHeaderDialog;
        this.showVariableDialog = data.dialogs.showVariableDialog;
        this.showSubscriptionUrlDialog = data.dialogs.showSubscriptionUrlDialog;
        this.showHistoryDialog = data.dialogs.showHistoryDialog;

        this.subscriptionUrl = data.query.subscriptionUrl;
        if (data.history) { // Remove condition when all users have upgraded to v1.6.0+
          this.historyList = data.history.list;
        }

        // Schema needs to be valid instances of GQLSchema.
        // Rehydrated schema objects are not valid, so we get the schema again.
        if (this.gql.isSchema(data.schema.schema)) {
          this.gqlSchema = data.schema.schema;
        } else {
          const schema = this.gql.getIntrospectionSchema(data.schema.introspection);
          if (schema) {
            this.store.dispatch(new schemaActions.SetSchemaAction(this.windowId, schema));
          }
        }

        // Backward compatibility: set the HTTP verb if it is not set.
        if (!this.httpVerb) {
          this.store.dispatch(new queryActions.SetHTTPMethodAction({ httpVerb: 'POST' }, this.windowId));
        }
        // console.log(data.query);
      });

    this.queryService.loadQuery(this.windowId);
    this.queryService.loadUrl(this.windowId);

    this.initSetup();
  }

  setApiUrl(url) {
    if (url !== this.apiUrl) {
      this.store.dispatch(new queryActions.SetUrlAction({ url }, this.windowId));
      this.store.dispatch(new queryActions.SendIntrospectionQueryRequestAction(this.windowId));
    }
  }

  setApiMethod(httpVerb) {
    this.store.dispatch(new queryActions.SetHTTPMethodAction({ httpVerb }, this.windowId));
  }

  sendRequest() {
    // Store the current query into the history if it does not already exist in the history
    if (!this.historyList.filter(item => item.query.trim() === this.query.trim()).length) {
      this.store.dispatch(new historyActions.AddHistoryAction(this.windowId, { query: this.query }));
    }

    // If the query is a subscription, subscribe to the subscription URL and send the query
    if (this.gql.isSubscriptionQuery(this.query)) {
      console.log('Your query is a SUBSCRIPTION!!!');
      // If the subscription URL is not set, show the dialog for the user to set it
      if (!this.subscriptionUrl) {
        this.toggleSubscriptionUrlDialog(true);
      } else {
        this.startSubscription();
      }
    } else {
      this.store.dispatch(new queryActions.SendQueryRequestAction(this.windowId));
    }
  }

  cancelRequest() {
    this.store.dispatch(new queryActions.CancelQueryRequestAction(this.windowId));
  }

  startSubscription() {
    this.store.dispatch(new queryActions.StartSubscriptionAction(this.windowId));
  }

  stopSubscription() {
    this.store.dispatch(new queryActions.StopSubscriptionAction(this.windowId));
  }

  updateQuery(query) {
    this.store.dispatch(new queryActions.SetQueryAction(query, this.windowId));
  }

  toggleHeader(isOpen) {
    if (this.showHeaderDialog !== isOpen) {
      this.store.dispatch(new dialogsActions.ToggleHeaderDialogAction(this.windowId));
    }
  }

  toggleVariableDialog(isOpen) {
    if (this.showVariableDialog !== isOpen) {
      this.store.dispatch(new dialogsActions.ToggleVariableDialogAction(this.windowId));
    }
  }

  toggleSubscriptionUrlDialog(isOpen) {
    if (this.showSubscriptionUrlDialog !== isOpen) {
      this.store.dispatch(new dialogsActions.ToggleSubscriptionUrlDialogAction(this.windowId));
    }
  }

  toggleHistoryDialog(isOpen) {
    if (this.showHistoryDialog !== isOpen) {
      this.store.dispatch(new dialogsActions.ToggleHistoryDialogAction(this.windowId));
    }
  }

  toggleDocs() {
    this.store.dispatch(new docsActions.ToggleDocsViewAction(this.windowId));
  }

  reloadDocs() {
    this.store.dispatch(new queryActions.SendIntrospectionQueryRequestAction(this.windowId));
  }

  addHeader() {
    this.store.dispatch(new headerActions.AddHeaderAction(this.windowId));
  }

  headerKeyChange($event, i) {
    const val = $event.target.value;
    this.store.dispatch(new headerActions.EditHeaderKeyAction({ val, i }, this.windowId));
  }
  headerValueChange($event, i) {
    const val = $event.target.value;
    this.store.dispatch(new headerActions.EditHeaderValueAction({ val, i }, this.windowId));
  }

  removeHeader(i) {
    this.store.dispatch(new headerActions.RemoveHeaderAction(i, this.windowId));
  }

  updateVariables(variables) {
    this.store.dispatch(new variableActions.UpdateVariablesAction(variables, this.windowId));
  }

  updateSubscriptionUrl(url) {
    this.store.dispatch(new queryActions.SetSubscriptionUrlAction({ subscriptionUrl: url }, this.windowId));
  }

  prettifyCode() {
    this.store.dispatch(new queryActions.PrettifyQueryAction(this.windowId));
  }

  compressQuery() {
    this.store.dispatch(new queryActions.CompressQueryAction(this.windowId));
  }

  addQueryToEditor(queryData: { query: String, meta: any }) {
    // Add the query to what is already in the editor
    this.store.dispatch(new queryActions.SetQueryAction(`${this.query}\n${queryData.query}`, this.windowId));
    this.store.dispatch(new layoutActions.NotifyExperimentalAction(this.windowId));

    // If the query has args
    if (queryData.meta.hasArgs) {
      this.notifyService.warning('Fill in the arguments for the query!');
    }
  }

  clearEditor() {
    this.store.dispatch(new queryActions.SetQueryAction(``, this.windowId));
  }

  downloadResult() {
    this.store.dispatch(new queryActions.DownloadResultAction(this.windowId));
  }

  // Set the value of the item in the specified index of the history list
  restoreHistory(index) {
    if (this.historyList[index]) {
      this.store.dispatch(new queryActions.SetQueryAction(this.historyList[index].query, this.windowId));
    }
  }

  trackByFn(index, item) {
    return index;
  }

  getWindowState(): Store<fromRoot.PerWindowState> {
    return this.store.select(fromRoot.selectWindowState(this.windowId));
  }

  /**
   * Carry out any necessary house cleaning tasks.
   */
  initSetup() {
    this.store.dispatch(new queryActions.SetSubscriptionResponseListAction(this.windowId, { list: [] }));
    this.store.dispatch(new queryActions.StopSubscriptionAction(this.windowId));
  }
}
