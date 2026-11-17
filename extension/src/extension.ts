import * as vscode from "vscode";
import { TrueforgeClient } from "./client/trueforgeClient";
import { DiffManager } from "./diff/diffManager";
import { InlineEditController } from "./inline/inlineController";
import { AgentPanelProvider } from "./panel/agentPanelProvider";

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("trueforge");
  const apiUrl = config.get<string>("apiUrl", "http://127.0.0.1:4000");
  const agentId = config.get<string>("agentId", "trueforge-coding-agent");

  // Core subsystems
  const client = new TrueforgeClient(apiUrl, agentId);
  const diffManager = new DiffManager();
  const inlineController = new InlineEditController(client, diffManager);
  const agentPanelProvider = new AgentPanelProvider(context.extensionUri, client, diffManager);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("trueforge.inlineEdit", () => {
      inlineController.triggerInlineEdit();
    }),

    vscode.commands.registerCommand("trueforge.openAgentPanel", () => {
      vscode.commands.executeCommand("workbench.view.extension.trueforge-view-container");
    }),

    vscode.commands.registerCommand("trueforge.cancelExecution", () => {
      inlineController.cancel();
      agentPanelProvider.cancelCurrentGeneration();
    }),

    vscode.commands.registerCommand("trueforge.undoLastDiff", async () => {
      await diffManager.undoLast();
    }),

    vscode.window.registerWebviewViewProvider(
      AgentPanelProvider.viewType,
      agentPanelProvider
    ),

    diffManager
  );

  // Listen to configuration updates
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("trueforge")) {
        const newConfig = vscode.workspace.getConfiguration("trueforge");
        client.setBaseUrl(newConfig.get<string>("apiUrl", "http://127.0.0.1:4000"));
      }
    })
  );

  console.log("TrueForge Coding Agent extension is now active.");
}

export function deactivate() {
  console.log("TrueForge Coding Agent extension deactivated.");
}
