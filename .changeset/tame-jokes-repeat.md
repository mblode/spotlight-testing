---
"spotlight-testing": patch
---

Write the lockfile atomically. A plain write truncated the file before writing, so a concurrent reader could parse a half-written lockfile and fail with "Incompatible spotlight lockfile".
