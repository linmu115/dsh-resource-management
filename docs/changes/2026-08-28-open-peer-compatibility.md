# Resource Management 0.3.4: version-open peers

All DSH, Cordis, Sidebar, and React peer dependencies now use `*`. Optional peers remain optional, so the package keeps its capability-based fallbacks while no longer rejecting experimental host/plugin version combinations.

Pinned development dependencies remain the reproducible test baseline and do not constrain installation.
