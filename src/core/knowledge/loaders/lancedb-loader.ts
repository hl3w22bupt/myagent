/**
 * LanceDB Loader
 * Runtime-only loader to avoid bundling LanceDB native modules
 * This file is only loaded when LanceDB is actually used at runtime
 */

let LanceDBVectorStoreClass: any | null = null;

// LanceDB module name as variable to avoid esbuild bundling
const LANCEDB_MODULE = '@lancedb/lancedb';

/**
 * Get LanceDB adapter class - loads only when first called
 * Uses require() with variable to prevent esbuild from bundling
 */
export async function getLanceDBAdapter() {
  if (LanceDBVectorStoreClass) {
    return LanceDBVectorStoreClass;
  }

  // Use require() - LanceDB is CommonJS
  // Using variable helps prevent esbuild from bundling
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(LANCEDB_MODULE);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adapterModule = require('../adapters/lancedb-adapter');
  LanceDBVectorStoreClass = adapterModule.LanceDBVectorStore;
  return LanceDBVectorStoreClass;
}
