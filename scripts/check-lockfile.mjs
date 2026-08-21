import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `npm ci` refuses to run when package-lock.json and package.json disagree, and
 * says so in forty lines of usage text that hide the one sentence that matters.
 * This runs the same check first and prints the fix instead.
 *
 * The usual cause is a lock file regenerated on a different OS or npm version:
 * npm drops the optional packages that platform does not need, and Linux CI
 * then cannot install them.
 */
const root = resolve(import.meta.dirname, "..");

const dependenciesChanged = () => {
  try {
    const changed = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    return changed.split("\n").includes("package.json");
  } catch {
    // No git history to compare against (a shallow or detached checkout); the
    // advice below is still correct, it just cannot say which case applies.
    return null;
  }
};

try {
  execFileSync("npm", ["ci", "--dry-run"], { cwd: root, stdio: "pipe" });
  console.log("package-lock.json agrees with package.json.");
} catch (error) {
  const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  const complaints = output
    .split("\n")
    .filter((line) => /npm error (Missing|Invalid|Added|Removed)/.test(line))
    .slice(0, 12);

  const touchedPackageJson = dependenciesChanged();
  const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).engines?.node;

  console.error("\npackage-lock.json does not match package.json.\n");
  if (complaints.length > 0) console.error(`${complaints.join("\n")}\n`);
  if (touchedPackageJson === false) {
    console.error(
      "This branch does not change package.json, so no dependency change was\n" +
        "intended. Restore the lock file and commit that:\n\n" +
        "    git checkout origin/main -- package-lock.json\n",
    );
  } else {
    console.error(
      "If this branch adds or removes a dependency, regenerate the lock with the\n" +
        `same Node as CI${version ? ` (${version})` : ""} and commit it:\n\n` +
        "    npm install\n    git add package-lock.json\n\n" +
        "If it does not, restore the lock instead:\n\n" +
        "    git checkout origin/main -- package-lock.json\n",
    );
  }
  console.error(
    "Never hand-edit package-lock.json, and do not commit one regenerated on a\n" +
      "different OS: npm prunes the optional packages your platform skips and\n" +
      "Linux CI can no longer install them.\n",
  );
  process.exit(1);
}
