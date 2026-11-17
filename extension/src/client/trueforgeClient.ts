import * as http from "http";
import * as https from "https";
import { URL } from "url";

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onRationale?: (files: { path: string; score: number; rationale: string }[]) => void;
  onToolCall?: (toolName: string, args: any) => void;
  onApprovalRequest?: (change: any) => Promise<{ approved: boolean; acceptedHunks?: number[] }>;
  onFallback?: (failedModel: string, fallbackModel: string) => void;
  onError?: (err: Error) => void;
  onComplete?: () => void;
}

export interface TurnOptions {
  sessionId: string;
  prompt: string;
  systemPromptOverride?: string;
  callbacks: StreamCallbacks;
  abortSignal?: AbortSignal;
}

export class TrueforgeClient {
  private baseUrl: string;
  private agentId: string;
  private activeAbortController: AbortController | null = null;

  constructor(baseUrl: string = "http://localhost:8790", agentId: string = "trueforge-coding-agent") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.agentId = agentId;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "");
  }

  public async createSession(): Promise<{ sessionId: string }> {
    try {
      const res = await this.httpRequest(`${this.baseUrl}/api/v1/sessions`, "POST", {
        agentId: this.agentId,
        timestamp: Date.now()
      });
      return { sessionId: res.sessionId || `session-${Date.now()}` };
    } catch {
      // Return a local session identifier if harness is in embedded/offline mode
      return { sessionId: `local-session-${Date.now()}` };
    }
  }

  public async sendTurn(options: TurnOptions): Promise<void> {
    const { sessionId, prompt, callbacks, abortSignal } = options;

    const requestPayload = {
      prompt,
      agentId: this.agentId,
      systemPrompt: options.systemPromptOverride,
      timestamp: Date.now()
    };

    try {
      const url = new URL(`${this.baseUrl}/api/v1/sessions/${sessionId}/turns`);
      const isHttps = url.protocol === "https:";
      const clientLib = isHttps ? https : http;

      await new Promise<void>((resolve, reject) => {
        const req = clientLib.request(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream"
            }
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 400) {
              // Task C Resilience handling: Check for fallback
              const err = new Error(`TrueForge API returned HTTP ${res.statusCode}: ${res.statusMessage}`);
              callbacks.onError?.(err);
              return reject(err);
            }

            let buffer = "";

            res.on("data", (chunk: Buffer) => {
              if (abortSignal?.aborted) {
                req.destroy();
                return;
              }

              buffer += chunk.toString("utf-8");
              const lines = buffer.split("\n\n");
              buffer = lines.pop() || "";

              for (const block of lines) {
                const eventMatch = block.match(/^event:\s*(.+)$/m);
                const dataMatch = block.match(/^data:\s*(.+)$/m);

                if (dataMatch) {
                  try {
                    const parsed = JSON.parse(dataMatch[1]);
                    const eventType = eventMatch ? eventMatch[1].trim() : "message";

                    switch (eventType) {
                      case "token":
                        callbacks.onToken?.(parsed.delta || parsed.token || "");
                        break;
                      case "rationale":
                        callbacks.onRationale?.(parsed.files || []);
                        break;
                      case "tool_call":
                        callbacks.onToolCall?.(parsed.name, parsed.args);
                        break;
                      case "fallback":
                        callbacks.onFallback?.(parsed.failedModel, parsed.fallbackModel);
                        break;
                      case "approval_request":
                        if (callbacks.onApprovalRequest) {
                          callbacks.onApprovalRequest(parsed.change).then((decision) => {
                            // Send decision back to TrueForge
                            this.httpRequest(
                              `${this.baseUrl}/api/v1/sessions/${sessionId}/approvals`,
                              "POST",
                              { changeId: parsed.change.id, ...decision }
                            ).catch(() => {});
                          });
                        }
                        break;
                      case "done":
                        callbacks.onComplete?.();
                        resolve();
                        break;
                    }
                  } catch {
                    // Non-JSON delta stream fallback
                    callbacks.onToken?.(dataMatch[1]);
                  }
                }
              }
            });

            res.on("end", () => {
              callbacks.onComplete?.();
              resolve();
            });

            res.on("error", (err) => {
              callbacks.onError?.(err);
              reject(err);
            });
          }
        );

        if (abortSignal) {
          abortSignal.addEventListener("abort", () => {
            req.destroy();
            resolve();
          });
        }

        req.on("error", (err) => {
          callbacks.onError?.(err);
          reject(err);
        });

        req.write(JSON.stringify(requestPayload));
        req.end();
      });
    } catch (err: any) {
      callbacks.onError?.(err);
      throw err;
    }
  }

  private httpRequest(urlStr: string, method: string, data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === "https:";
      const clientLib = isHttps ? https : http;

      const body = data ? JSON.stringify(data) : "";
      const req = clientLib.request(
        url,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          },
          timeout: 5000
        },
        (res) => {
          let resData = "";
          res.on("data", (c) => (resData += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(resData));
            } catch {
              resolve(resData);
            }
          });
        }
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out."));
      });

      if (body) req.write(body);
      req.end();
    });
  }
}
