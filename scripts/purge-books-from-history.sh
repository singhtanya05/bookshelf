#!/usr/bin/env bash
#
# Removes every book binary from ALL git history.
#
# Deleting the files in a commit is not enough: they stay reachable in older
# commits, in clones, and in forks. This rewrites history so they were never
# there. It does NOT push — the force-push is yours to run, deliberately,
# after you have checked the result.
#
# Requires git-filter-repo:  brew install git-filter-repo
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BACKUP="${HOME}/projects/books/library-master"

echo "==> Repository: $REPO_ROOT"

# --- preflight -------------------------------------------------------------
command -v git-filter-repo >/dev/null 2>&1 || {
  echo "ERROR: git-filter-repo not found. Install it with:"
  echo "  brew install git-filter-repo"
  exit 1
}

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree is dirty. Commit or stash first."
  exit 1
fi

if [ ! -d "$BACKUP" ]; then
  echo "ERROR: no local master copy at $BACKUP"
  echo "The books are about to be erased from history. Back them up first."
  exit 1
fi

BOOK_COUNT=$(find "$BACKUP" -type f \( -name '*.epub' -o -name '*.pdf' \) | wc -l | tr -d ' ')
echo "==> Master copies preserved at $BACKUP ($BOOK_COUNT files)"

HIST_COUNT=$(git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(rest)' \
  | awk '$1=="blob"' \
  | grep -Ec 'bookspdf/|public/books/' || true)
echo "==> Book blobs currently in history: $HIST_COUNT"

# --- confirm ---------------------------------------------------------------
cat <<WARN

  This REWRITES every commit. Consequences:
    * all commit SHAs change
    * the next push must be --force
    * anyone else with a clone must re-clone
    * open PRs against the old history will break

WARN
read -r -p "Type 'rewrite history' to continue: " REPLY
[ "$REPLY" = "rewrite history" ] || { echo "Aborted."; exit 1; }

# --- safety copy of the repo itself ---------------------------------------
SAFETY="${REPO_ROOT}-backup-$(date +%Y%m%d-%H%M%S)"
echo "==> Cloning safety copy to $SAFETY"
git clone --no-local --mirror . "$SAFETY.git" >/dev/null 2>&1
echo "==> Safety mirror written (delete it once you are happy)"

ORIGIN="$(git remote get-url origin 2>/dev/null || echo '')"

# --- the rewrite -----------------------------------------------------------
# demo.epub is public domain and deliberately kept.
echo "==> Rewriting history..."
git filter-repo --force \
  --path bookspdf/ \
  --path public/books/ \
  --path-glob 'public/books/*' \
  --invert-paths \
  --path public/books/demo.epub

# filter-repo drops remotes by design; put origin back.
if [ -n "$ORIGIN" ]; then
  git remote add origin "$ORIGIN" 2>/dev/null || git remote set-url origin "$ORIGIN"
  echo "==> Restored origin: $ORIGIN"
fi

git reflog expire --expire=now --all
git gc --prune=now --aggressive >/dev/null 2>&1 || true

REMAIN=$(git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(rest)' \
  | awk '$1=="blob"' \
  | grep -Ec 'bookspdf/|public/books/[^d]' || true)

echo
echo "==> Done. Book blobs remaining in history: $REMAIN"
echo "==> Repo size now: $(du -sh .git | cut -f1)"
cat <<'NEXT'

Nothing has been pushed. Verify, then push yourself:

    git push origin --force --all
    git push origin --force --tags

After pushing, ask GitHub Support to purge cached views of the old commits,
and remember that any existing fork keeps its own copy.
NEXT
