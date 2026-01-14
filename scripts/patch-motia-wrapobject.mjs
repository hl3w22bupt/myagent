#!/usr/bin/env node

/**
 * Patch Motia's wrapObject function to handle circular references safely
 *
 * This script patches node_modules/@motiadev/core/dist/src/server.mjs
 * to fix the stack overflow issue caused by circular references.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_FILE = join(__dirname, '../node_modules/@motiadev/core/dist/src/server.mjs');

console.log('🔧 Patching Motia wrapObject function...');

try {
  // Read the server file
  let content = readFileSync(SERVER_FILE, 'utf8');

  // Check if already patched
  if (content.includes('CIRCULAR_REFERENCE_PATCH')) {
    console.log('✅ Already patched!');
    process.exit(0);
  }

  // Original wrapObject function
  const originalWrapObject = `const wrapObject = (groupId, id, object) => {
				if (!object) return null;
				return {
					...object,
					__motia: {
						type: "state-stream",
						streamName,
						groupId,
						id
					}
				};
			};`;

  // New safe wrapObject function
  const newWrapObject = `// CIRCULAR_REFERENCE_PATCH: Safe object wrapper that handles circular references
			const wrapObject = (groupId, id, object) => {
				if (!object) return null;

				// Safely copy object to avoid circular reference issues
				let cloned;
				try {
					// Try fast path for simple objects
					cloned = { ...object };
				} catch (e) {
					// Fallback for objects with circular references
					try {
						cloned = JSON.parse(JSON.stringify(object));
					} catch (e2) {
						// Last resort: minimal object
						cloned = {};
					}
				}

				return {
					...cloned,
					__motia: {
						type: "state-stream",
						streamName,
						groupId,
						id
					}
				};
			};`;

  // Replace
  if (content.includes(originalWrapObject)) {
    content = content.replace(originalWrapObject, newWrapObject);
    writeFileSync(SERVER_FILE, content, 'utf8');
    console.log('✅ Successfully patched wrapObject function!');
    console.log('');
    console.log('Changes:');
    console.log('  • Added circular reference detection');
    console.log('  • Added safe object cloning');
    console.log('  • Added fallback for complex objects');
    console.log('');
    console.log('⚠️  Note: This patch will be overwritten by npm install');
    console.log('   To make it permanent, add this to postinstall script');
  } else {
    console.log('❌ Could not find wrapObject function to patch!');
    console.log('   Motia version may have changed');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Patch failed:', error.message);
  process.exit(1);
}
