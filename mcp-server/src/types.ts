export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: string[];
}

export interface ProposedChange {
  id: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  hunks: DiffHunk[];
  unifiedDiff: string;
  explanation: string;
  timestamp: number;
  status: "pending" | "accepted" | "rejected" | "partially_accepted";
  acceptedHunks?: number[];
}
