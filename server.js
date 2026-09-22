const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = __dirname;
const port = Number(process.env.PORT || 8080);
const stateFile = process.env.STATE_FILE || path.join(root, 'panel-state.json');
const image = process.env.MINECRAFT_IMAGE || 'itzg/minecraft-server:java21';
let state = loadState();
const jobs = new Map();

function loadState() {
  try {
    const value = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return { servers: Array.isArray(value.servers) ? value.servers : [], users: Array.isArray(value.users) ? value.users : [], settings: value.settings || {} };
  } catch {
    return { servers: [], users: [], settings: {} };
  }
}

function saveState() {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function runDocker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: root, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `docker exited with ${code}`)));
  });
}

function containerName(server) {
  return `xzy-minecraft-${server.id.replace(/[^a-z0-9_-]/gi, '').slice(0, 48)}`;
}

async function createContainer(server) {
  const args = ['run', '-d', '--name', containerName(server), '--restart', 'unless-stopped'];
  args.push('-e', 'EULA=TRUE', '-e', `VERSION=${server.version || '1.21.1'}`, '-e', `MEMORY=${server.memory || '2G'}`);
  args.push('-p', `${server.port}:25565/tcp`);
  args.push(image);
  return runDocker(args);
}

async function handle(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
  if (!requestUrl.pathname.startsWith('/api/')) return serveStatic(requestUrl.pathname, res);

  const match = requestUrl.pathname.match(/^\/api\/servers\/([^/]+)(?:\/(start|stop|restart|force-stop|logs|plugins|files))?$/);
  if (req.method === 'GET' && requestUrl.pathname === '/api/servers') return json(res, 200, state.servers);
  if (req.method === 'GET' && requestUrl.pathname === '/api/users') return json(res, 200, state.users || []);
  const userCleanupMatch = requestUrl.pathname.match(/^\/api\/users\/except\/([^/]+)$/);
  if (req.method === 'DELETE' && userCleanupMatch) {
    const keepUsername = decodeURIComponent(userCleanupMatch[1]).toLowerCase();
    state.users = (state.users || []).filter(user => String(user.username).toLowerCase() === keepUsername);
    saveState();
    return json(res, 200, state.users);
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/users') {
    const user = await readBody(req);
    if (!user.username || !user.email || !user.password) return json(res, 400, { error: 'username, email and password are required' });
    const duplicate = state.users.find(item => item.username.toLowerCase() === user.username.toLowerCase() || item.email.toLowerCase() === user.email.toLowerCase());
    if (duplicate) return json(res, 409, { error: 'user already exists' });
    state.users.push(user); saveState(); return json(res, 201, user);
  }
  if (req.method === 'GET' && requestUrl.pathname === '/api/settings') return json(res, 200, state.settings || {});
  if (req.method === 'GET' && requestUrl.pathname === '/api/plugins/search') {
    const query = requestUrl.searchParams.get('q');
    if (!query || query.length < 2) return json(res, 400, { error: 'Search query is too short' });
    try {
      const response = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent('[["project_type:plugin"]]')}&limit=8`);
      if (!response.ok) throw new Error(`Plugin search failed with ${response.status}`);
      const data = await response.json();
      return json(res, 200, { results: data.hits.map(item => ({ id: item.project_id, name: item.title, description: item.description, icon: item.icon_url })) });
    } catch (error) { return json(res, 502, { error: error.message }); }
  }
  const pluginProjectMatch = requestUrl.pathname.match(/^\/api\/plugins\/project\/([^/]+)$/);
  if (req.method === 'GET' && pluginProjectMatch) {
    try {
      const response = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(pluginProjectMatch[1])}/version`);
      if (!response.ok) throw new Error(`Plugin version lookup failed with ${response.status}`);
      const versions = await response.json();
      const version = versions.find(item => item.version_type === 'release') || versions[0];
      const file = version && (version.files.find(item => item.primary) || version.files[0]);
      if (!file) throw new Error('No downloadable JAR found');
      return json(res, 200, { url: file.url, version: version.version_number });
    } catch (error) { return json(res, 502, { error: error.message }); }
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/settings') {
    state.settings = await readBody(req); saveState(); return json(res, 200, state.settings);
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/servers') {
    const body = await readBody(req);
    const server = { ...body, id: body.id || `server-${Date.now()}`, status: 'offline', createdAt: Date.now() };
    if (!server.name || !Number.isInteger(Number(server.port))) return json(res, 400, { error: 'name and port are required' });
    if (state.servers.some(item => item.port === Number(server.port))) return json(res, 409, { error: 'port is already allocated' });
    state.servers.push(server); saveState();
    return json(res, 201, server);
  }
  if (!match) return json(res, 404, { error: 'not found' });
  const server = state.servers.find(item => item.id === match[1]);
  if (!server) return json(res, 404, { error: 'server not found' });
  const action = match[2];
  if (req.method === 'GET' && action === 'logs') {
    try { return json(res, 200, { logs: await runDocker(['logs', '--tail', '200', containerName(server)]) }); }
    catch (error) { return json(res, 200, { logs: error.message }); }
  }
  if (req.method === 'GET' && action === 'files') {
    try {
      const output = await runDocker(['exec', containerName(server), 'sh', '-c', 'find /data -mindepth 1 -maxdepth 2 -print 2>/dev/null | while read p; do if [ -d "$p" ]; then echo "folder|$p"; else echo "file|$p"; fi; done']);
      const files = output.split('\n').filter(Boolean).map(entry => { const [type, filePath] = entry.split('|'); return { name: filePath.replace(/^\/data\//, ''), type }; });
      return json(res, 200, { files });
    } catch (error) { return json(res, 502, { error: error.message }); }
  }
  if (req.method === 'GET' && action === 'plugins') {
    try { return json(res, 200, { plugins: (await runDocker(['exec', containerName(server), 'sh', '-c', 'find /data/plugins -maxdepth 1 -type f -name "*.jar" -printf "%f\n" 2>/dev/null'])).split('\n').filter(Boolean) }); }
    catch (error) { return json(res, 200, { plugins: [], error: error.message }); }
  }
  if (req.method === 'DELETE' && !action) {
    try { await runDocker(['rm', '-f', containerName(server)]); } catch {}
    state.servers = state.servers.filter(item => item.id !== server.id); saveState();
    return json(res, 200, { deleted: true });
  }
  if (req.method === 'POST' && action === 'plugins') {
    const body = await readBody(req);
    const pluginUrl = String(body.url || '');
    const pluginName = String(body.name || 'plugin').replace(/[^a-z0-9._-]/gi, '-');
    if (!/^https?:\/\//i.test(pluginUrl)) return json(res, 400, { error: 'A valid plugin URL is required' });
    try {
      const command = `mkdir -p /data/plugins && curl -fsSL ${shellQuote(pluginUrl)} -o /data/plugins/${shellQuote(pluginName.endsWith('.jar') ? pluginName : `${pluginName}.jar`)}`;
      await runDocker(['exec', containerName(server), 'sh', '-c', command]);
      return json(res, 200, { installed: true, plugin: pluginName });
    } catch (error) { return json(res, 500, { error: error.message }); }
  }
  if (req.method !== 'POST' || !['start', 'stop', 'restart', 'force-stop'].includes(action)) return json(res, 405, { error: 'method not allowed' });
  if (jobs.has(server.id)) return json(res, 409, { error: 'operation already running' });
  const job = (async () => {
    if (action === 'start') {
      try { await runDocker(['start', containerName(server)]); }
      catch { await createContainer(server); }
      server.status = 'online'; server.startedAt = server.startedAt || Date.now();
    } else if (action === 'stop') {
      await runDocker(['stop', containerName(server)]); server.status = 'offline'; delete server.startedAt;
    } else if (action === 'force-stop') {
      await runDocker(['kill', containerName(server)]);
      server.status = 'offline'; delete server.startedAt;
    } else {
      try { await runDocker(['restart', containerName(server)]); }
      catch { await createContainer(server); }
      server.status = 'online'; server.startedAt = Date.now();
    }
    saveState();
  })();
  jobs.set(server.id, job);
  try { await job; return json(res, 200, server); }
  catch (error) { return json(res, 500, { error: error.message }); }
  finally { jobs.delete(server.id); }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}

function serveStatic(urlPath, res) {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'not found' });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => handle(req, res).catch(error => json(res, 500, { error: error.message }))).listen(port, () => {
  console.log(`Xzy Panel backend listening on http://localhost:${port}`);
  console.log(`Minecraft image: ${image}`);
});
