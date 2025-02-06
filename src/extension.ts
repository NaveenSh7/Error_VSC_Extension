 
import * as vscode from "vscode";

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log("Extension activated");

  const provider = new CustomSidebarViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CustomSidebarViewProvider.viewType,
      provider
    )
  );

  let errorLensEnabled: boolean = true;

  // Commands are defined in the package.json file
  let disposableEnableErrorLens = vscode.commands.registerCommand(
    "ErrorLens.enable",
    () => {
      errorLensEnabled = true;
      const activeTextEditor: vscode.TextEditor | undefined =
        vscode.window.activeTextEditor;
      if (activeTextEditor) {
        updateDecorationsForUri(activeTextEditor.document.uri);
      }
    }
  );

  context.subscriptions.push(disposableEnableErrorLens);

  let disposableDisableErrorLens = vscode.commands.registerCommand(
    "ErrorLens.disable",
    () => {
      errorLensEnabled = false;
      const activeTextEditor: vscode.TextEditor | undefined =
        vscode.window.activeTextEditor;
      if (activeTextEditor) {
        updateDecorationsForUri(activeTextEditor.document.uri);
      }
    }
  );

  context.subscriptions.push(disposableDisableErrorLens);

  vscode.languages.onDidChangeDiagnostics(
    (diagnosticChangeEvent) => {
      onChangedDiagnostics(diagnosticChangeEvent);
    },
    null,
    context.subscriptions
  );

  vscode.workspace.onDidOpenTextDocument(
    (textDocument) => {
      updateDecorationsForUri(textDocument.uri);
    },
    null,
    context.subscriptions
  );

  vscode.window.onDidChangeActiveTextEditor(
    (textEditor) => {
      if (textEditor === undefined) {
        return;
      }
      updateDecorationsForUri(textEditor.document.uri);
    },
    null,
    context.subscriptions
  );

  function onChangedDiagnostics(
    diagnosticChangeEvent: vscode.DiagnosticChangeEvent
  ) {
    if (!vscode.window) {
      return;
    }

    const activeTextEditor: vscode.TextEditor | undefined =
      vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }

    for (const uri of diagnosticChangeEvent.uris) {
      if (uri.fsPath === activeTextEditor.document.uri.fsPath) {
        updateDecorationsForUri(uri);
        break;
      }
    }
  }

  function updateDecorationsForUri(uriToDecorate: vscode.Uri) {
    if (!uriToDecorate) {
      return;
    }

    if (uriToDecorate.scheme !== "file") {
      return;
    }

    const activeTextEditor: vscode.TextEditor | undefined =
      vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }

    if (!activeTextEditor.document.uri.fsPath) {
      return;
    }

    let numErrors = 0;
    let numWarnings = 0;

    if (errorLensEnabled) {
      let aggregatedDiagnostics: any = {};
      let diagnostic: vscode.Diagnostic;

      // Categorize errors and collect the types
      let errorCategories: string[] = [];

      for (diagnostic of vscode.languages.getDiagnostics(uriToDecorate)) {
        let key = "line" + diagnostic.range.start.line;

        if (aggregatedDiagnostics[key]) {
          aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic);
        } else {
          aggregatedDiagnostics[key] = {
            line: diagnostic.range.start.line,
            arrayDiagnostics: [diagnostic],
          };
        }

        // Determine error type
        const category = getErrorCategory(diagnostic);
        if (!errorCategories.includes(category)) {
          errorCategories.push(category);
        }

        switch (diagnostic.severity) {
          case 0:
            numErrors += 1;
            break;

          case 1:
            numWarnings += 1;
            break;
        }
      }
    }
  }
}

class CustomSidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "in-your-face.openview";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}
  
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext<unknown>,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;
  
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
  
    // Get errors and warnings
    const [errorNum, warningNum, errorMessages, warningMessages] = getNumErrors();
    webviewView.webview.html = this.getHtmlContent(
      webviewView.webview,
      "0",
      errorMessages,
      warningMessages
    );
  
    // Update periodically
    setInterval(() => {
      const config = vscode.workspace.getConfiguration('InYourFace');
      const errorUseWarnings = config.get<boolean>('error.usewarnings');
      const [errors, warnings, newErrorMessages, newWarningMessages] = getNumErrors();
      let i = "0";
      if (errors) { i = errors < 4 ? "1" : errors < 10 ? "2" : "3"; }
      webviewView.webview.html = this.getHtmlContent(
        webviewView.webview,
        i,
        newErrorMessages,
        newWarningMessages
      );
    }, 1000);
  }
  
  getHtmlContent(
    webview: vscode.Webview,
    doomFace: string,
    errorMessages: string[],
    warningMessages: string[]
  ): string {
    const stylesheetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "assets", "styles.css")
    );
    const doomFaceUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "assets", `err${doomFace}.png`)
    );

    return this.getHtml(doomFaceUri, stylesheetUri, errorMessages, warningMessages);
  }

  getHtml(
    doomFace: vscode.Uri,
    stylesheetUri: vscode.Uri,
    errorMessages: string[],
    warningMessages: string[]
  ) {
    const [errorNum, warningNum] = [errorMessages.length, warningMessages.length];
  
    const config = vscode.workspace.getConfiguration('InYourFace');
    const errorUseWarnings = config.get<boolean>('error.usewarnings');
  
    let errorHtml = errorMessages.map(msg => `<li>${msg}</li>`).join('');
    let warningHtml = warningMessages.map(msg => `<li>${msg}</li>`).join('');
  
    if (errorUseWarnings === false) {
      return `<!DOCTYPE html>
        <html lang="en">
          <head>
            <link rel="stylesheet" href="${stylesheetUri}" />
          </head>
          <body>
            <section>
              <img src="${doomFace}">
              <h2 class=${errorNum ? "alarm" : ""}>
                ${errorNum} ${errorNum === 1 ? "error" : "errors"}
              </h2>
              <ul>
                ${errorHtml}
              </ul>
            </section>
          </body>
        </html>`;
    }
  
    return `<!DOCTYPE html>
      <html lang="en">
        <head>
          <link rel="stylesheet" href="${stylesheetUri}" />
        </head>
        <body>
          <section>
            <img src="${doomFace}">
            <h2 class=${errorNum ? "alarm" : warningNum ? "yellow" : ""}>
              ${errorNum} ${errorNum === 1 ? "error" : "errors"}
              ${warningNum} ${warningNum === 1 ? "warning" : "warnings"}
            </h2>
            <ul>
              ${errorHtml}
              ${warningHtml}
            </ul>
          </section>
        </body>
      </html>`;
  }
}

// Function to get the error category
function getErrorCategory(diagnostic: vscode.Diagnostic): string {
  if (diagnostic.message.includes("SyntaxError")) {
    return "Syntax Error";
  } else if (diagnostic.message.includes("Cannot find module")) {
    return "Module Missing";
  } else if (diagnostic.message.includes("NetworkError")) {
    return "Server Error";
  } else if (diagnostic.message.includes("ReferenceError")) {
    return "Reference Error";
  } else if (diagnostic.message.includes("Failed to fetch")) {
    return "NetworkError :Failed to fetch ";
  } else if (diagnostic.message.includes("call stack")) {
    return "RangeError";
  }
  return "something missing check syntax or look for warnings"; // Default category
}

// Function to get the number of errors and warnings
function getNumErrors(): [number, number, string[], string[]] {
  const activeTextEditor: vscode.TextEditor | undefined =
    vscode.window.activeTextEditor;
  if (!activeTextEditor) {
    return [0, 0, [], []];
  }
  const document: vscode.TextDocument = activeTextEditor.document;

  let numErrors = 0;
  let numWarnings = 0;
  let errorMessages: string[] = [];
  let warningMessages: string[] = [];

  let aggregatedDiagnostics: any = {};
  let diagnostic: vscode.Diagnostic;

  // Iterate over each diagnostic that VS Code has reported for this file.
  for (diagnostic of vscode.languages.getDiagnostics(document.uri)) {
    let key = "line" + diagnostic.range.start.line;

    if (aggregatedDiagnostics[key]) {
      aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic);
    } else {
      aggregatedDiagnostics[key] = {
        line: diagnostic.range.start.line,
        arrayDiagnostics: [diagnostic],
      };
    }

    // Ignore console warnings
    if (diagnostic.source === 'console') {
      continue; // Skip console warnings
    }

    switch (diagnostic.severity) {
      case 0: // Error
        numErrors += 1;
        errorMessages.push(`Error: ${diagnostic.message}`); // Capture error message
        break;

      case 1: // Warning
        numWarnings += 1;
        warningMessages.push(`Warning: ${diagnostic.message}`); // Capture warning message
        break;
    }
  }

  return [numErrors, numWarnings, errorMessages, warningMessages];
}

export function deactivate() {}
