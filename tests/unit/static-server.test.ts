import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

it('local static server prevents stale 304 updates, directory listing and symlink escape', () => {
  const script = `
import importlib.util,pathlib,tempfile,threading,urllib.request,urllib.error,email.utils,os
spec=importlib.util.spec_from_file_location('staticserver', ${JSON.stringify(path.join(process.cwd(), 'tools/serve-static.py'))})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as t:
 root=pathlib.Path(t)/'site';root.mkdir();(root/'index.html').write_text('synthetic');(root/'sw.js').write_text('new bytes');os.utime(root/'sw.js',(0,0));(root/'empty').mkdir()
 outside=pathlib.Path(t)/'outside.txt';outside.write_text('synthetic outside');(root/'escape.txt').symlink_to(outside);(root/'sub').mkdir();(root/'sub'/'index.html').symlink_to(outside)
 server=m.ThreadingHTTPServer(('127.0.0.1',0),m.partial(m.StaticHandler,directory=str(root)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 def get(p,headers={}):
  try:
   r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{server.server_port}'+p,headers=headers));return r.status,r.headers,r.read()
  except urllib.error.HTTPError as e:return e.code,e.headers,e.read()
 try:
  status,headers,body=get('/sw.js',{'If-Modified-Since':email.utils.formatdate(0,usegmt=True),'If-None-Match':'synthetic-old'})
  assert status==200 and body==b'new bytes' and headers['Cache-Control']=='no-store'
  assert get('/empty/')[0]==404
  assert get('/escape.txt')[0]==403
  assert get('/sub/')[0]==403
 finally:server.shutdown();server.server_close()
print('static server assertions passed')
`;
  const result = spawnSync('python3', ['-c', script], { encoding: 'utf8', timeout: 4000 });
  expect(result.status, result.stderr).toBe(0); expect(result.stdout).toContain('static server assertions passed');
});
