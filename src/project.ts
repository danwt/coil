import { execSync } from "child_process";

export function detectProject(): string {
  try {
    const remote = execSync("git remote get-url origin 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    // Extract repo name from URL: git@github.com:user/repo.git or https://github.com/user/repo.git
    const match = remote.match(/\/([^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // not a git repo or no remote
  }

  try {
    const toplevel = execSync("git rev-parse --show-toplevel 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    return toplevel.split("/").pop() ?? "unknown";
  } catch {
    // not a git repo
  }

  return process.cwd().split("/").pop() ?? "unknown";
}
