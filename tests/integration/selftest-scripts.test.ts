import { afterEach, describe, expect, it } from 'vitest'
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile as execFileCallback } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCallback)
const ROOT_DIR = process.cwd()

async function makeTempDir(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

async function writeExecutable(filePath: string, content: string) {
  await writeFile(filePath, content, 'utf8')
  await chmod(filePath, 0o755)
}

async function createFakeBin() {
  const tempDir = await makeTempDir('portfolio-prism-selftest-bin-')
  const binDir = path.join(tempDir, 'bin')
  await mkdir(binDir, { recursive: true })
  return { tempDir, binDir }
}

async function createHomeSkillsRoot() {
  const homeDir = await makeTempDir('portfolio-prism-home-')
  const skillsRoot = path.join(homeDir, '.agents', 'skills')
  await mkdir(skillsRoot, { recursive: true })
  return { homeDir, skillsRoot }
}

async function writeSkillTree(skillsRoot: string, marker: string) {
  const skills = ['repo-test-map', 'self-test-loop', 'frontend-qa', 'bug-repro']

  for (const skill of skills) {
    const skillDir = path.join(skillsRoot, skill)
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, 'SKILL.md'), `# ${skill}\nmarker=${marker}\n`, 'utf8')
  }
}

async function withRepoAgentsHidden<T>(fn: () => Promise<T>) {
  const hiddenPath = path.join(ROOT_DIR, '.agents')
  const parkedPath = path.join(ROOT_DIR, '.agents.test-backup')

  await rm(parkedPath, { recursive: true, force: true })
  await execFile('mv', [hiddenPath, parkedPath], { cwd: ROOT_DIR })

  try {
    return await fn()
  } finally {
    await rm(hiddenPath, { recursive: true, force: true })
    await execFile('mv', [parkedPath, hiddenPath], { cwd: ROOT_DIR })
  }
}

async function runBashScript(scriptPath: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFile('bash', [scriptPath, ...args], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      ...env,
    },
  })
}

async function createFakeSnapshotSource() {
  const sourceDir = await makeTempDir('portfolio-prism-live-data-')
  await mkdir(path.join(sourceDir, 'outputs'), { recursive: true })
  await mkdir(path.join(sourceDir, 'config'), { recursive: true })
  await writeFile(path.join(sourceDir, 'prism.db'), 'fake-db', 'utf8')
  await writeFile(
    path.join(sourceDir, 'outputs', 'pipeline_health.json'),
    JSON.stringify({ status: 'ready' }),
    'utf8'
  )
  await writeFile(path.join(sourceDir, 'config', '.credentials.json'), '{"remember":true}', 'utf8')
  return sourceDir
}

const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((target) => rm(target, { recursive: true, force: true }))
  )
})

describe('selftest scripts', () => {
  it('routes frontend file changes to the canonical unit test bucket', async () => {
    const { tempDir, binDir } = await createFakeBin()
    cleanupPaths.push(tempDir)
    const pnpmLog = path.join(tempDir, 'pnpm.log')

    await writeExecutable(
      path.join(binDir, 'pnpm'),
      '#!/usr/bin/env bash\nprintf "%s\n" "$*" >> "$FAKE_PNPM_LOG"\n'
    )

    await runBashScript(path.join(ROOT_DIR, 'scripts/selftest/test-changed.sh'), ['src/App.tsx'], {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FAKE_PNPM_LOG: pnpmLog,
    })

    const log = await readFile(pnpmLog, 'utf8')
    expect(log).toContain('test:unit')
    expect(log).not.toContain('test:integration')
    expect(log).not.toContain('exec playwright test --reporter=line')
  })

  it('warns on codex wrapper usage and delegates to the canonical script', async () => {
    const { tempDir, binDir } = await createFakeBin()
    cleanupPaths.push(tempDir)
    const pnpmLog = path.join(tempDir, 'pnpm.log')

    await writeExecutable(
      path.join(binDir, 'pnpm'),
      '#!/usr/bin/env bash\nprintf "%s\n" "$*" >> "$FAKE_PNPM_LOG"\n'
    )

    const result = await runBashScript(
      path.join(ROOT_DIR, 'scripts/codex/test-changed.sh'),
      ['src/App.tsx'],
      {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        FAKE_PNPM_LOG: pnpmLog,
      }
    )

    const log = await readFile(pnpmLog, 'utf8')
    expect(result.stderr).toContain('[deprecated] use scripts/selftest/test-changed.sh')
    expect(log).toContain('test:unit')
  })

  it('mirrors home-level shared skills into a target shared skill root', async () => {
    const { homeDir, skillsRoot } = await createHomeSkillsRoot()
    const targetRoot = await makeTempDir('portfolio-prism-skill-mirror-')
    cleanupPaths.push(homeDir)
    cleanupPaths.push(targetRoot)

    await writeSkillTree(skillsRoot, 'home-skill-source')

    await withRepoAgentsHidden(async () => {
      await runBashScript(path.join(ROOT_DIR, 'scripts/selftest/install-shared-skills.sh'), [], {
        HOME: homeDir,
        TARGET_ROOT: targetRoot,
      })
    })

    await expect(stat(path.join(targetRoot, 'repo-test-map', 'SKILL.md'))).resolves.toBeDefined()
    await expect(stat(path.join(targetRoot, 'self-test-loop', 'SKILL.md'))).resolves.toBeDefined()
    await expect(stat(path.join(targetRoot, 'frontend-qa', 'SKILL.md'))).resolves.toBeDefined()
    await expect(stat(path.join(targetRoot, 'bug-repro', 'SKILL.md'))).resolves.toBeDefined()

    const mirroredSkill = await readFile(path.join(targetRoot, 'repo-test-map', 'SKILL.md'), 'utf8')
    expect(mirroredSkill).toContain('marker=home-skill-source')
  })

  it('verifies home-level skill files and checks both runtimes for discovery', async () => {
    const { tempDir, binDir } = await createFakeBin()
    const { homeDir, skillsRoot } = await createHomeSkillsRoot()
    cleanupPaths.push(tempDir)
    cleanupPaths.push(homeDir)
    const npxLog = path.join(tempDir, 'npx.log')

    await writeSkillTree(skillsRoot, 'verify-home-skill-source')

    await writeExecutable(
      path.join(binDir, 'npx'),
      '#!/usr/bin/env bash\nprintf "%s\n" "$*" >> "$FAKE_NPX_LOG"\n'
    )

    await withRepoAgentsHidden(async () => {
      await runBashScript(path.join(ROOT_DIR, 'scripts/selftest/verify-shared-skills.sh'), [], {
        HOME: homeDir,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        FAKE_NPX_LOG: npxLog,
      })
    })

    const log = await readFile(npxLog, 'utf8')
    expect(log).toContain('skills ls -g -a codex')
    expect(log).toContain('skills ls -g -a opencode')
  })

  it('fails verification when the expected home-level skill root is missing', async () => {
    const missingSkillsRoot = await makeTempDir('portfolio-prism-missing-skills-')
    cleanupPaths.push(missingSkillsRoot)

    await rm(missingSkillsRoot, { recursive: true, force: true })

    await withRepoAgentsHidden(async () => {
      await expect(
        runBashScript(path.join(ROOT_DIR, 'scripts/selftest/verify-shared-skills.sh'), [], {
          HOME: missingSkillsRoot,
        })
      ).rejects.toBeTruthy()
    })
  })

  it('exposes the Playwright selftest gate via package scripts', async () => {
    const packageJson = JSON.parse(await readFile(path.join(ROOT_DIR, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['selftest:e2e']).toBe(
      'playwright test tests/e2e/selftest-smoke.spec.ts'
    )
    expect(packageJson.scripts['selftest:record-sync-snapshot']).toBe(
      './scripts/selftest/record-sync-snapshot.sh'
    )
    expect(packageJson.scripts['selftest:replay-sync-snapshot']).toBe(
      './scripts/selftest/replay-sync-snapshot.sh'
    )
    expect(packageJson.scripts['selftest:dogfood:real-snapshot']).toBe(
      './scripts/selftest/dogfood-real-snapshot.sh'
    )
  })

  it('uses pnpm for Playwright web server startup and ships the smoke spec', async () => {
    const config = await readFile(path.join(ROOT_DIR, 'playwright.config.ts'), 'utf8')

    expect(config).toContain("command: 'pnpm dev'")
    await expect(
      stat(path.join(ROOT_DIR, 'tests/e2e/selftest-smoke.spec.ts'))
    ).resolves.toBeDefined()
  })

  it('records a private sync snapshot from a source data directory', async () => {
    const sourceDir = await createFakeSnapshotSource()
    const snapshotDir = await makeTempDir('portfolio-prism-snapshot-')
    cleanupPaths.push(sourceDir)
    cleanupPaths.push(snapshotDir)

    await runBashScript(path.join(ROOT_DIR, 'scripts/selftest/record-sync-snapshot.sh'), [
      '--snapshot-dir',
      snapshotDir,
      '--source-data-dir',
      sourceDir,
    ])

    await expect(readFile(path.join(snapshotDir, 'prism.db'), 'utf8')).resolves.toBe('fake-db')
    await expect(
      readFile(path.join(snapshotDir, 'outputs', 'pipeline_health.json'), 'utf8')
    ).resolves.toContain('ready')
    await expect(
      readFile(path.join(snapshotDir, 'config', '.credentials.json'), 'utf8')
    ).resolves.toContain('remember')
    await expect(
      readFile(path.join(snapshotDir, 'snapshot-metadata.json'), 'utf8')
    ).resolves.toContain(sourceDir)
  })

  it('replays a recorded snapshot into an isolated PRISM_DATA_DIR target', async () => {
    const sourceDir = await createFakeSnapshotSource()
    const snapshotDir = await makeTempDir('portfolio-prism-snapshot-')
    const replayDir = await makeTempDir('portfolio-prism-replay-')
    cleanupPaths.push(sourceDir)
    cleanupPaths.push(snapshotDir)
    cleanupPaths.push(replayDir)

    await runBashScript(path.join(ROOT_DIR, 'scripts/selftest/record-sync-snapshot.sh'), [
      '--snapshot-dir',
      snapshotDir,
      '--source-data-dir',
      sourceDir,
    ])

    const result = await runBashScript(
      path.join(ROOT_DIR, 'scripts/selftest/replay-sync-snapshot.sh'),
      ['--snapshot-dir', snapshotDir, '--target-data-dir', replayDir]
    )

    expect(result.stdout).toContain(`replay_data_dir=${replayDir}`)
    await expect(readFile(path.join(replayDir, 'prism.db'), 'utf8')).resolves.toBe('fake-db')
    await expect(
      readFile(path.join(replayDir, 'outputs', 'pipeline_health.json'), 'utf8')
    ).resolves.toContain('ready')
  })

  it('orchestrates replay plus Playwright dogfood against the replay data dir', async () => {
    const { tempDir, binDir } = await createFakeBin()
    const sourceDir = await createFakeSnapshotSource()
    const snapshotDir = await makeTempDir('portfolio-prism-snapshot-')
    const replayDir = await makeTempDir('portfolio-prism-replay-')
    const artifactDir = await makeTempDir('portfolio-prism-dogfood-artifacts-')
    const devUpLog = path.join(tempDir, 'dev-up.log')
    const pnpmLog = path.join(tempDir, 'pnpm.log')
    const fakeDevUp = path.join(tempDir, 'fake-dev-up.sh')

    cleanupPaths.push(tempDir)
    cleanupPaths.push(sourceDir)
    cleanupPaths.push(snapshotDir)
    cleanupPaths.push(replayDir)
    cleanupPaths.push(artifactDir)

    await runBashScript(path.join(ROOT_DIR, 'scripts/selftest/record-sync-snapshot.sh'), [
      '--snapshot-dir',
      snapshotDir,
      '--source-data-dir',
      sourceDir,
    ])

    await writeExecutable(
      fakeDevUp,
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'printf "PRISM_DATA_DIR=%s\\n" "$PRISM_DATA_DIR" >> "$FAKE_DEV_UP_LOG"',
        'mkdir -p "$RUNTIME_DIR"',
        'printf "engine ok\\n" > "$ENGINE_LOG"',
        'printf "frontend ok\\n" > "$FRONTEND_LOG"',
      ].join('\n')
    )

    await writeExecutable(
      path.join(binDir, 'pnpm'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'printf "%s\\n" "$*" >> "$FAKE_PNPM_LOG"',
        'printf "PRISM_DATA_DIR=%s\\n" "$PRISM_DATA_DIR" >> "$FAKE_PNPM_LOG"',
        'printf "playwright ok\\n"',
      ].join('\n')
    )

    const result = await runBashScript(
      path.join(ROOT_DIR, 'scripts/selftest/dogfood-real-snapshot.sh'),
      [
        '--snapshot-dir',
        snapshotDir,
        '--target-data-dir',
        replayDir,
        '--artifact-dir',
        artifactDir,
      ],
      {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        SELFTEST_DEV_UP_CMD: fakeDevUp,
        FAKE_DEV_UP_LOG: devUpLog,
        FAKE_PNPM_LOG: pnpmLog,
      }
    )

    expect(result.stdout).toContain(`artifact_dir=${artifactDir}`)
    await expect(readFile(path.join(replayDir, 'prism.db'), 'utf8')).resolves.toBe('fake-db')
    await expect(readFile(devUpLog, 'utf8')).resolves.toContain(`PRISM_DATA_DIR=${replayDir}`)
    await expect(readFile(pnpmLog, 'utf8')).resolves.toContain(`PRISM_DATA_DIR=${replayDir}`)
    await expect(readFile(path.join(artifactDir, 'playwright.log'), 'utf8')).resolves.toContain(
      'playwright ok'
    )
  })

  it('fails dogfood orchestration when a targeted backpressure error appears in logs', async () => {
    const { tempDir, binDir } = await createFakeBin()
    const sourceDir = await createFakeSnapshotSource()
    const snapshotDir = await makeTempDir('portfolio-prism-snapshot-')
    const replayDir = await makeTempDir('portfolio-prism-replay-')
    const artifactDir = await makeTempDir('portfolio-prism-dogfood-artifacts-')
    const fakeDevUp = path.join(tempDir, 'fake-dev-up.sh')

    cleanupPaths.push(tempDir)
    cleanupPaths.push(sourceDir)
    cleanupPaths.push(snapshotDir)
    cleanupPaths.push(replayDir)
    cleanupPaths.push(artifactDir)

    await runBashScript(path.join(ROOT_DIR, 'scripts/selftest/record-sync-snapshot.sh'), [
      '--snapshot-dir',
      snapshotDir,
      '--source-data-dir',
      sourceDir,
    ])

    await writeExecutable(
      fakeDevUp,
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'mkdir -p "$RUNTIME_DIR"',
        'printf "engine ok\\n" > "$ENGINE_LOG"',
        'printf "IPCValidationError: contract drift\\n" > "$FRONTEND_LOG"',
      ].join('\n')
    )

    await writeExecutable(
      path.join(binDir, 'pnpm'),
      '#!/usr/bin/env bash\nset -euo pipefail\nprintf "playwright ok\\n"\n'
    )

    await expect(
      runBashScript(
        path.join(ROOT_DIR, 'scripts/selftest/dogfood-real-snapshot.sh'),
        [
          '--snapshot-dir',
          snapshotDir,
          '--target-data-dir',
          replayDir,
          '--artifact-dir',
          artifactDir,
        ],
        {
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
          SELFTEST_DEV_UP_CMD: fakeDevUp,
        }
      )
    ).rejects.toBeTruthy()
  })
})
