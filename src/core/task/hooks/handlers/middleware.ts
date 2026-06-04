/**
 * Middleware Handler
 *
 * Intercepts and modifies input/output
 */

import { HookHandler } from '../types.js';
import { TemplateEngine } from '../../../config/template-engine.js';

export class MiddlewareHandler implements HookHandler {
  private httpCache = new Map<string, { value: any; expireTime: number }>();

  async execute(context: any, config: any): Promise<void> {
    const template = new TemplateEngine(context);

    // set: Set context values
    if (config.set) {
      for (const [path, value] of Object.entries(config.set)) {
        const renderedValue = template.renderValue(value);
        this.setByPath(context, path, renderedValue);
      }
    }

    // remove: Remove context values
    if (config.remove) {
      for (const path of config.remove) {
        this.removeByPath(context, path);
      }
    }

    // load_from: Load from external sources
    if (config.load_from) {
      for (const loader of config.load_from) {
        const loaded = await this.loadExternal(loader, template);
        this.setByPath(context, loader.target, loaded);
      }
    }

    // transform: Transform output
    if (config.transform) {
      for (const [targetPath, templateValue] of Object.entries(config.transform)) {
        const renderedValue = template.renderValue(templateValue);
        this.setByPath(context, targetPath, renderedValue);
      }
    }
  }

  private async loadExternal(
    loader: any,
    template: TemplateEngine
  ): Promise<any> {
    const url = template.renderValue(loader.source);

    // Check cache
    if (loader.cache_ttl) {
      const cached = this.httpCache.get(url);
      if (cached && cached.expireTime > Date.now()) {
        return cached.value;
      }
    }

    const response = await fetch(url);
    const data = await response.json();

    // Write to cache
    if (loader.cache_ttl) {
      this.httpCache.set(url, {
        value: data,
        expireTime: Date.now() + loader.cache_ttl * 1000,
      });
    }

    return data;
  }

  private setByPath(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((o, k) => {
      if (!o[k]) o[k] = {};
      return o[k];
    }, obj);
    target[lastKey] = value;
  }

  private removeByPath(obj: any, path: string): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((o, k) => o?.[k], obj);
    if (target && lastKey in target) {
      delete target[lastKey];
    }
  }
}
