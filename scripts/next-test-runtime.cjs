// Match the Next server's Node runtime initialization in standalone tests.
globalThis.AsyncLocalStorage ??= require("node:async_hooks").AsyncLocalStorage;
