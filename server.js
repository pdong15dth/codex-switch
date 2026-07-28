#!/usr/bin/env node
/**
 * codex-switch — local web UI for managing multiple Codex CLI accounts.
 *
 * Codex keeps the active credential in ~/.codex/auth.json. That single file
 * covers both auth modes (`apikey` and `chatgpt` OAuth), so a whole-file swap
 * is the correct switch unit. Profiles are snapshots of that file.
 *
 * Bound to 127.0.0.1 only: this server reads and writes credential files, so it
 * must never be reachable from the network. Raw tokens are never sent to the
 * browser — only auth mode and a masked identity.
 */
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, rename, unlink, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

const PORT = Number(process.env.PORT || 6677)
const HOST = '127.0.0.1'

const HOME = homedir()
const CODEX_DIR = join(HOME, '.codex')
const CODEX_AUTH = join(CODEX_DIR, 'auth.json')

const DATA_DIR = join(HOME, '.codex-switch')
const PROFILES_DIR = join(DATA_DIR, 'profiles')
const BACKUP_DIR = join(DATA_DIR, 'backups')
const INDEX_FILE = join(DATA_DIR, 'profiles.json')

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), 'public')

// ---------------------------------------------------------------- storage

async function ensureDirs() {
  await mkdir(PROFILES_DIR, { recursive: true })
  await mkdir(BACKUP_DIR, { recursive: true })
}

async function readIndex() {
  try {
    return JSON.parse(await readFile(INDEX_FILE, 'utf8'))
  } catch {
    return []
  }
}

/** Write via temp + rename so a crash can't leave a truncated index. */
async function writeAtomic(path, content) {
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}

const writeIndex = (list) => writeAtomic(INDEX_FILE, JSON.stringify(list, null, 2))

const profilePath = (id) => join(PROFILES_DIR, `${id}.json`)

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

async function readCurrentAuth() {
  try {
    return await readFile(CODEX_AUTH, 'utf8')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- identity

function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1]
    if (!part) return null
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Summarise a credential file WITHOUT exposing secrets.
 * Returns auth mode, a human-readable identity, plan and expiry when known.
 */
function describeAuth(raw) {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return { authMode: 'invalid', identity: 'JSON không đọc được', plan: null, expiresAt: null }
  }

  const mode =
    data.auth_mode || (data.tokens ? 'chatgpt' : data.OPENAI_API_KEY ? 'apikey' : 'unknown')

  if (data.tokens?.id_token) {
    const p = decodeJwtPayload(data.tokens.id_token) || {}
    const auth = p['https://api.openai.com/auth'] || {}
    const profile = p['https://api.openai.com/profile'] || {}
    const accountId = data.tokens.account_id || auth.chatgpt_account_id
    return {
      authMode: mode,
      identity:
        p.email ||
        profile.email ||
        (accountId ? `account ${String(accountId).slice(0, 8)}…` : 'ChatGPT account'),
      plan: auth.chatgpt_plan_type || null,
      expiresAt: p.exp ? new Date(p.exp * 1000).toISOString() : null
    }
  }

  if (data.OPENAI_API_KEY) {
    const k = String(data.OPENAI_API_KEY)
    return {
      authMode: mode,
      identity: k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : 'API key',
      plan: null,
      expiresAt: null
    }
  }

  return { authMode: mode, identity: '—', plan: null, expiresAt: null }
}

// ---------------------------------------------------------------- state

async function buildState() {
  const index = await readIndex()
  const current = await readCurrentAuth()
  const currentHash = current ? sha256(current) : null

  const profiles = []
  for (const entry of index) {
    let raw = null
    try {
      raw = await readFile(profilePath(entry.id), 'utf8')
    } catch {
      // Snapshot file went missing — surface it instead of hiding the profile.
    }
    profiles.push({
      id: entry.id,
      name: entry.name,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      missing: raw === null,
      active: raw !== null && currentHash !== null && sha256(raw) === currentHash,
      ...(raw ? describeAuth(raw) : { authMode: 'missing', identity: 'file snapshot bị mất' })
    })
  }

  return {
    codexAuthPath: CODEX_AUTH,
    dataDir: DATA_DIR,
    current: current
      ? { exists: true, ...describeAuth(current), savedAsProfile: profiles.some((p) => p.active) }
      : { exists: false },
    profiles
  }
}

// ---------------------------------------------------------------- jobs

/** In-memory log buffers for `codex` subprocesses so the UI can poll output. */
const jobs = new Map()

function startJob(args) {
  const id = randomUUID()
  const job = { id, args, lines: [], done: false, code: null }
  jobs.set(id, job)

  // shell:true so Windows resolves codex.exe / codex.cmd from PATH.
  // No user input reaches this command line — args are hardcoded per action.
  const child = spawn('codex', args, { shell: true, windowsHide: true })

  const push = (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (line.length) job.lines.push(line)
    }
    if (job.lines.length > 500) job.lines.splice(0, job.lines.length - 500)
  }

  child.stdout.on('data', push)
  child.stderr.on('data', push)
  child.on('error', (err) => {
    job.lines.push(`[lỗi] không chạy được codex: ${err.message}`)
    job.done = true
    job.code = -1
  })
  child.on('close', (code) => {
    job.done = true
    job.code = code
  })

  return job
}

// ---------------------------------------------------------------- http

const send = (res, status, body) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1e6) reject(new Error('body quá lớn'))
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('body không phải JSON hợp lệ'))
      }
    })
    req.on('error', reject)
  })
}

function cleanName(input) {
  const name = String(input ?? '').trim()
  if (!name) throw new Error('Tên profile không được để trống')
  if (name.length > 60) throw new Error('Tên profile tối đa 60 ký tự')
  return name
}

async function handleApi(req, res, url) {
  const { pathname } = url
  const method = req.method

  if (pathname === '/api/state' && method === 'GET') {
    return send(res, 200, await buildState())
  }

  // Snapshot whatever is currently in ~/.codex/auth.json as a new profile.
  if (pathname === '/api/profiles' && method === 'POST') {
    const body = await readBody(req)
    const name = cleanName(body.name)
    const current = await readCurrentAuth()
    if (!current) {
      throw new Error(
        'Chưa có ~/.codex/auth.json — hãy đăng nhập bằng "Login account mới" trước rồi lưu.'
      )
    }
    const index = await readIndex()
    if (index.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Đã có profile tên "${name}"`)
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    await writeAtomic(profilePath(id), current)
    index.push({ id, name, createdAt: now, updatedAt: now })
    await writeIndex(index)
    return send(res, 200, { ok: true, id, state: await buildState() })
  }

  const match = pathname.match(/^\/api\/profiles\/([0-9a-f-]{36})(\/[a-z]+)?$/i)
  if (match) {
    const id = match[1]
    const action = match[2]
    const index = await readIndex()
    const entry = index.find((p) => p.id === id)
    if (!entry) throw new Error('Không tìm thấy profile')

    // Switch: back up the live file, then swap the snapshot in.
    if (action === '/activate' && method === 'POST') {
      let snapshot
      try {
        snapshot = await readFile(profilePath(id), 'utf8')
      } catch {
        throw new Error('File snapshot của profile này bị mất, không switch được')
      }
      const current = await readCurrentAuth()
      let backup = null
      if (current) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        backup = join(BACKUP_DIR, `auth-${stamp}.json`)
        await writeAtomic(backup, current)
      }
      await mkdir(CODEX_DIR, { recursive: true })
      await writeAtomic(CODEX_AUTH, snapshot)
      return send(res, 200, { ok: true, backup, state: await buildState() })
    }

    // Re-capture: refresh this profile from the live file (tokens rotate).
    if (action === '/recapture' && method === 'POST') {
      const current = await readCurrentAuth()
      if (!current) throw new Error('Không có ~/.codex/auth.json để lưu')
      await writeAtomic(profilePath(id), current)
      entry.updatedAt = new Date().toISOString()
      await writeIndex(index)
      return send(res, 200, { ok: true, state: await buildState() })
    }

    if (!action && method === 'PATCH') {
      const body = await readBody(req)
      const name = cleanName(body.name)
      if (index.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`Đã có profile tên "${name}"`)
      }
      entry.name = name
      entry.updatedAt = new Date().toISOString()
      await writeIndex(index)
      return send(res, 200, { ok: true, state: await buildState() })
    }

    if (!action && method === 'DELETE') {
      await unlink(profilePath(id)).catch(() => {})
      await writeIndex(index.filter((p) => p.id !== id))
      return send(res, 200, { ok: true, state: await buildState() })
    }
  }

  // Spawn `codex login` (browser OAuth) or `codex login status`.
  if (pathname === '/api/jobs' && method === 'POST') {
    const body = await readBody(req)
    const actions = {
      login: ['login'],
      'login-device': ['login', '--device-auth'],
      status: ['login', 'status'],
      logout: ['logout']
    }
    const args = actions[body.action]
    if (!args) throw new Error('Action không hợp lệ')
    const job = startJob(args)
    return send(res, 200, { ok: true, jobId: job.id, command: `codex ${args.join(' ')}` })
  }

  const jobMatch = pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})$/i)
  if (jobMatch && method === 'GET') {
    const job = jobs.get(jobMatch[1])
    if (!job) throw new Error('Job không tồn tại')
    return send(res, 200, { lines: job.lines, done: job.done, code: job.code })
  }

  return send(res, 404, { error: 'Route không tồn tại' })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
}

async function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  // Contain path traversal: the resolved file must stay inside PUBLIC_DIR.
  const file = normalize(join(PUBLIC_DIR, rel))
  if (!file.startsWith(normalize(PUBLIC_DIR))) {
    res.writeHead(403).end('Forbidden')
    return
  }
  try {
    await stat(file)
    const ext = file.slice(file.lastIndexOf('.'))
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store'
    })
    res.end(await readFile(file))
  } catch {
    res.writeHead(404).end('Not found')
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
    } else {
      await serveStatic(req, res, url)
    }
  } catch (err) {
    send(res, 400, { error: err.message || String(err) })
  }
})

await ensureDirs()

server.listen(PORT, HOST, () => {
  console.log(`codex-switch đang chạy: http://${HOST}:${PORT}`)
  console.log(`  file credential : ${CODEX_AUTH}`)
  console.log(`  profiles lưu ở  : ${DATA_DIR}`)
  console.log('  Ctrl+C để dừng')
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} đang bị chiếm. Chạy lại với: PORT=6688 node server.js`)
    process.exit(1)
  }
  throw err
})
