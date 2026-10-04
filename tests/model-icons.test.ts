import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
const svg = () => new Response('<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>', { headers:{'content-type':'image/svg+xml'} });
describe('cached publisher logos', () => {
  it('fetches only the fixed catalog origin, coalesces concurrent requests and caches the logo', async () => {
    const fetcher = vi.fn(async () => svg()); vi.stubGlobal('fetch',fetcher);
    const { modelIcon } = await import('../src/server/model-icons.js');
    const [first,second] = await Promise.all([modelIcon('lab','deepseek'),modelIcon('lab','deepseek')]);
    expect(first?.toString()).toContain('<svg'); expect(second).toEqual(first);
    await modelIcon('lab','deepseek'); expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('https://models.dev/logos/labs/deepseek.svg',expect.objectContaining({redirect:'error'}));
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('headers');
  });
  it('rejects paths and host injection before doing any I/O', async () => {
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const {modelIcon}=await import('../src/server/model-icons.js');
    for(const id of ['../secret','https://host','user?key=abc','x'.repeat(65)])expect(await modelIcon('lab',id)).toBeUndefined();
    expect(await modelIcon('other','valid')).toBeUndefined();expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects HTML and oversized streams, and backs off when a logo is unavailable', async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('<html>no logo</html>',{headers:{'content-type':'text/html'}})).mockResolvedValueOnce(new Response('x'.repeat(70000),{headers:{'content-type':'image/svg+xml'}}));
    vi.stubGlobal('fetch',fetcher);const {modelIcon}=await import('../src/server/model-icons.js');
    expect(await modelIcon('lab','missing')).toBeUndefined();expect(await modelIcon('lab','missing')).toBeUndefined();
    expect(await modelIcon('provider','oversized')).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
