/** Minimal History-API router. Vercel rewrites all app routes to index.html. */

export interface Screen {
  el: HTMLElement;
  title: string;
  /** Called when navigating away. */
  destroy?(): void;
  /** Full-bleed screens hide the site header/footer (the game stage). */
  immersive?: boolean;
}

export interface RouteMatch {
  params: Record<string, string>;
  query: URLSearchParams;
}

interface Route {
  pattern: RegExp;
  keys: string[];
  render: (m: RouteMatch) => Screen | Promise<Screen>;
}

export class Router {
  private routes: Route[] = [];
  private current: Screen | null = null;
  private fallback: ((m: RouteMatch) => Screen) | null = null;
  private token = 0;
  onChange: ((screen: Screen, path: string) => void) | null = null;

  add(path: string, render: Route['render']): this {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/\/:([a-z]+)/gi, (_, k: string) => {
          keys.push(k);
          return '/([^/]+)';
        }) +
        '/?$',
    );
    this.routes.push({ pattern, keys, render });
    return this;
  }

  notFound(render: (m: RouteMatch) => Screen): this {
    this.fallback = render;
    return this;
  }

  start(): void {
    window.addEventListener('popstate', () => void this.resolve());
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('/') || href.startsWith('//')) return;
      e.preventDefault();
      this.go(href);
    });
    void this.resolve();
  }

  go(path: string, replace = false): void {
    if (path === location.pathname + location.search && !replace) return;
    if (replace) history.replaceState(null, '', path);
    else history.pushState(null, '', path);
    void this.resolve();
  }

  back(fallback = '/'): void {
    if (history.length > 1) history.back();
    else this.go(fallback);
  }

  private async resolve(): Promise<void> {
    const token = ++this.token;
    const path = location.pathname;
    const query = new URLSearchParams(location.search);
    let screen: Screen | null = null;
    for (const r of this.routes) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      screen = await r.render({ params, query });
      break;
    }
    if (!screen && this.fallback) screen = this.fallback({ params: {}, query });
    if (!screen || token !== this.token) {
      screen?.destroy?.();
      return;
    }
    this.current?.destroy?.();
    this.current = screen;
    this.onChange?.(screen, path);
  }
}
