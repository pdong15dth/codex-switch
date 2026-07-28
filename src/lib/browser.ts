import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { platform } from 'node:os'
import { join } from 'node:path'
import { DATA_DIR } from './paths'

interface BrowserSpec {
  name: string
  exe: string
  kind: 'chromium' | 'firefox'
}

/**
 * Only these hosts may be opened. The URL arrives from the browser, so without
 * a check this endpoint would open anything the page asked for.
 */
const ALLOWED_HOSTS = new Set([
  'auth.openai.com',
  'chatgpt.com',
  'claude.ai',
  'console.anthropic.com'
])

/** Throwaway browser profiles live here, one directory per login attempt. */
const PROFILES_DIR = join(DATA_DIR, 'browser-profiles')

function candidates(): BrowserSpec[] {
  const p = platform()

  if (p === 'win32') {
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    const local = process.env.LOCALAPPDATA ?? ''
    const chromium = (exe: string, name: string): BrowserSpec => ({ name, exe, kind: 'chromium' })

    return [
      chromium(join(pf, 'Google/Chrome/Application/chrome.exe'), 'Chrome'),
      chromium(join(pf86, 'Google/Chrome/Application/chrome.exe'), 'Chrome'),
      chromium(join(local, 'Google/Chrome/Application/chrome.exe'), 'Chrome'),
      chromium(join(pf, 'Microsoft/Edge/Application/msedge.exe'), 'Edge'),
      chromium(join(pf86, 'Microsoft/Edge/Application/msedge.exe'), 'Edge'),
      chromium(join(pf, 'BraveSoftware/Brave-Browser/Application/brave.exe'), 'Brave'),
      { name: 'Firefox', exe: join(pf, 'Mozilla Firefox/firefox.exe'), kind: 'firefox' }
    ]
  }

  if (p === 'darwin') {
    return [
      {
        name: 'Chrome',
        exe: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        kind: 'chromium'
      },
      {
        name: 'Edge',
        exe: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        kind: 'chromium'
      },
      { name: 'Firefox', exe: '/Applications/Firefox.app/Contents/MacOS/firefox', kind: 'firefox' }
    ]
  }

  return [
    { name: 'Chrome', exe: '/usr/bin/google-chrome', kind: 'chromium' },
    { name: 'Chromium', exe: '/usr/bin/chromium', kind: 'chromium' },
    { name: 'Firefox', exe: '/usr/bin/firefox', kind: 'firefox' }
  ]
}

export function findPrivateBrowser(): BrowserSpec | null {
  return candidates().find((b) => b.exe && existsSync(b.exe)) ?? null
}

/** Drop throwaway profiles older than a day so they do not pile up. */
async function pruneProfiles(): Promise<void> {
  try {
    const now = Date.now()
    for (const entry of await readdir(PROFILES_DIR)) {
      const dir = join(PROFILES_DIR, entry)
      const info = await stat(dir)
      if (now - info.mtimeMs > 86_400_000) await rm(dir, { recursive: true, force: true })
    }
  } catch {
    // Nothing to prune, or the directory does not exist yet.
  }
}

/**
 * Open `url` in a browser window with a brand-new, empty profile.
 *
 * `--incognito` is deliberately NOT used: Chrome reuses an already-open
 * incognito session, so a second login would inherit the first account's
 * cookies. A fresh `--user-data-dir` is the only way to guarantee a clean
 * session on every attempt, which is what adding several accounts needs.
 */
export async function openPrivate(url: string): Promise<{ browser: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('URL không hợp lệ')
  }
  if (parsed.protocol !== 'https:') throw new Error('Chỉ mở được link https')
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Không mở host này: ${parsed.hostname}`)
  }

  const browser = findPrivateBrowser()
  if (!browser) throw new Error('Không tìm thấy Chrome, Edge, Brave hay Firefox trên máy')

  await pruneProfiles()
  const profileDir = join(PROFILES_DIR, randomUUID())
  await mkdir(profileDir, { recursive: true })

  const args =
    browser.kind === 'chromium'
      ? [
          `--user-data-dir=${profileDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--new-window',
          parsed.toString()
        ]
      : ['-profile', profileDir, '-no-remote', '-new-instance', parsed.toString()]

  // No shell: the URL stays a single argv entry, so it cannot be interpreted.
  const child = spawn(browser.exe, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  })
  child.unref()

  return { browser: browser.name }
}
