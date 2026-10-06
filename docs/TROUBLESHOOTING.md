# Troubleshooting Log

Each entry: symptom → root cause → fix → what I learned. These are interview stories.

---

## 1. `npm test` failed with `Cannot find module '...\test'`

**Symptom:** Running `npm test` (which called `node --test test/`) failed immediately with
`Error: Cannot find module 'F:\...\app\test'`, even though the `test/` folder clearly existed.

**Root cause:** The command was run from Git Bash (MSYS) on Windows. MSYS auto-converts
path-like arguments before handing them to the program, and it mangled the `test/` argument
so Node's test runner tried to `require()` it as a module instead of treating it as a
directory to scan for test files.

**Fix:** Changed the `test` script from `node --test test/` to just `node --test`. Node's
built-in test runner already auto-discovers files matching `**/*.test.js` (among other
patterns) without needing an explicit path, so dropping the argument sidesteps the path
translation entirely and works the same in PowerShell, Git Bash, and CI.

**What I learned:** On Windows, any tool invoked through Git Bash can have its arguments
silently rewritten if they look like POSIX paths. When a command behaves correctly with no
path argument but fails with one, that's a strong hint it's a shell path-translation issue,
not a bug in the tool itself.
