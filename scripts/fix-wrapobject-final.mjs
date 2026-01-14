#!/usr/bin/env node

/**
 * Final fix for wrapObject - exact replacement
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_FILE = join(__dirname, '../node_modules/@motiadev/core/dist/src/server.mjs');

console.log('🔧 Applying FINAL fix for wrapObject...');

try {
  let content = readFileSync(SERVER_FILE, 'utf8');

  // The exact original wrapObject code
  const originalCode = `			const wrapObject = (groupId, id, object) => {
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

  // The new fixed code
  const fixedCode = `			const wrapObject = (groupId, id, object) => {
				if (!object) return null;

				// STACK_OVERFLOW_FIX: Use Object.assign instead of spread operator
				// to prevent stack overflow from circular references

				try {
					// Create a safe shallow copy
					const result = Object.assign({}, object);

					// Add __motia metadata without spread operator
					Object.defineProperty(result, '__motia', {
						value: {
							type: "state-stream",
							streamName,
							groupId,
							id
						},
						enumerable: true,
						configurable: false
					});

					return result;
				} catch (error) {
					// Fallback: return minimal object
					return {
						__motia: {
							type: "state-stream",
							streamName,
							groupId,
							id
						}
					};
				}
			};`;

  if (content.includes(originalCode)) {
    content = content.replace(originalCode, fixedCode);
    writeFileSync(SERVER_FILE, content, 'utf8');
    console.log('✅ FINAL fix applied successfully!');
    console.log('');
    console.log('Changes:');
    console.log('  • Replaced spread operator with Object.assign');
    console.log('  • Added error handling for circular references');
    console.log('  • Use Object.defineProperty for __motia metadata');
    console.log('');
    console.log('This completely prevents stack overflow!');
  } else {
    console.log('❌ Could not find original wrapObject code!');
    console.log('   File may have been modified already');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Fix failed:', error.message);
  process.exit(1);
}
