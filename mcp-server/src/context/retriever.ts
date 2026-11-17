import * as fs from "fs";
import * as path from "path";

export interface ContextBudget {
  maxFiles: number;
  maxTokensPerFile: number;
  maxTotalTokens: number;
}

export interface RetrievedFileContext {
  filePath: string;
  relevanceScore: number;
  selectionRationale: string;
  lineCount: number;
  estimatedTokens: number;
  contentSnippet: string;
}

export interface AssemblyResult {
  budget: ContextBudget;
  totalTokensUsed: number;
  files: RetrievedFileContext[];
  summaryLog: string;
}

const DEFAULT_BUDGET: ContextBudget = {
  maxFiles: 6,
  maxTokensPerFile: 3000,
  maxTotalTokens: 12000
};

export function assembleContextForPrompt(
  workspaceRoot: string,
  userPrompt: string,
  explicitFiles: string[] = [],
  explicitSymbols: string[] = [],
  budget: ContextBudget = DEFAULT_BUDGET
): AssemblyResult {
  const words = userPrompt
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);

  const scoredFiles: { filePath: string; score: number; rationale: string }[] = [];

  // 1. Prioritize explicit file mentions
  for (const explicit of explicitFiles) {
    const full = path.resolve(workspaceRoot, explicit);
    if (fs.existsSync(full)) {
      scoredFiles.push({
        filePath: explicit.replace(/\\/g, "/"),
        score: 1000,
        rationale: "Explicitly requested by user via @file tag."
      });
    }
  }

  // 2. Scan workspace files and score based on keywords & conventions
  const allWorkspaceFiles = collectWorkspaceFiles(workspaceRoot);

  for (const relPath of allWorkspaceFiles) {
    if (explicitFiles.includes(relPath)) continue;

    let score = 0;
    const rationales: string[] = [];

    const lowerPath = relPath.toLowerCase();

    // Check path matching against keywords
    for (const word of words) {
      if (lowerPath.includes(word)) {
        score += 20;
        rationales.push(`Path matches keyword '${word}'`);
      }
    }

    // Role-based heuristics for typical tasks (CLI, test, docs)
    const isCliTask = words.some(w => ["cli", "command", "flag", "args"].includes(w));
    if (isCliTask) {
      if (lowerPath.includes("cli.py")) {
        score += 50;
        rationales.push("Primary CLI command registration module.");
      } else if (lowerPath.includes("test_cli.py") || (lowerPath.includes("tests/") && lowerPath.includes("cli"))) {
        score += 45;
        rationales.push("CLI test suite for verifying command behavior.");
      } else if (lowerPath.endsWith("cli.rst") || (lowerPath.includes("docs/") && lowerPath.includes("cli"))) {
        score += 40;
        rationales.push("Documentation reference for CLI commands.");
      }
    }

    // Check content matches for top keywords if score is promising
    if (score > 0 || words.length < 5) {
      try {
        const content = fs.readFileSync(path.resolve(workspaceRoot, relPath), "utf-8");
        for (const symbol of explicitSymbols) {
          if (content.includes(symbol)) {
            score += 150;
            rationales.push(`Contains explicit symbol @${symbol}`);
          }
        }
      } catch {}
    }

    if (score > 0) {
      scoredFiles.push({
        filePath: relPath,
        score,
        rationale: rationales.join("; ") || "Matches relevant task terms."
      });
    }
  }

  // Sort by relevance score descending
  scoredFiles.sort((a, b) => b.score - a.score);

  // Apply context budget
  const selectedFiles = scoredFiles.slice(0, budget.maxFiles);
  const resultFiles: RetrievedFileContext[] = [];
  let totalTokens = 0;

  for (const item of selectedFiles) {
    const fullPath = path.resolve(workspaceRoot, item.filePath);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split(/\r?\n/);
      const estTokens = Math.ceil(content.length / 4);

      if (totalTokens + Math.min(estTokens, budget.maxTokensPerFile) > budget.maxTotalTokens) {
        break;
      }

      totalTokens += Math.min(estTokens, budget.maxTokensPerFile);
      resultFiles.push({
        filePath: item.filePath,
        relevanceScore: item.score,
        selectionRationale: item.rationale,
        lineCount: lines.length,
        estimatedTokens: estTokens,
        contentSnippet: lines.slice(0, 150).join("\n") // preview slice
      });
    } catch {}
  }

  // Formulate human-readable summary log for Task B display
  const summaryLog = resultFiles
    .map(f => `• ${f.filePath} (Score: ${f.relevanceScore}) -> ${f.selectionRationale}`)
    .join("\n");

  return {
    budget,
    totalTokensUsed: totalTokens,
    files: resultFiles,
    summaryLog
  };
}

function collectWorkspaceFiles(workspaceRoot: string): string[] {
  const result: string[] = [];
  const ignored = new Set([".git", "node_modules", "__pycache__", ".venv", "venv", "build", "dist", ".pytest_cache"]);

  function walk(dir: string) {
    if (result.length > 500) return; // quick traversal limit
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      if (ignored.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if ([".py", ".ts", ".js", ".json", ".rst", ".md", ".toml", ".yaml", ".yml"].includes(ext)) {
          result.push(path.relative(workspaceRoot, full).replace(/\\/g, "/"));
        }
      }
    }
  }

  walk(workspaceRoot);
  return result;
}
