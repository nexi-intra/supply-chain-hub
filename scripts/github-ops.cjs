// Generic GitHub PR/release helper for Supply Chain Hub.
// Credentials are read from Git Credential Manager and kept only in memory.
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const API = 'https://api.github.com/repos/nexi-intra/supply-chain-hub'

function getToken() {
  const result = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) throw new Error('Git Credential Manager failed')
  const values = Object.fromEntries(
    result.stdout.trim().split(/\r?\n/).map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    })
  )
  if (!values.password) throw new Error('No GitHub credential available')
  return values.password
}

async function api(token, endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'supply-chain-hub-ops',
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    const body = await response.text()
    let message = body
    try { message = JSON.parse(body).message || body } catch { /* keep raw body */ }
    throw new Error(`GitHub API ${response.status}: ${message}`)
  }
  return response.status === 204 ? null : response.json()
}

async function createPullRequest(token, { branch, title, body }) {
  const head = encodeURIComponent(`nexi-intra:${branch}`)
  const existing = await api(token, `/pulls?state=open&head=${head}&base=main`)
  if (existing.length) return existing[0]

  return api(token, '/pulls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, head: branch, base: 'main', body }),
  })
}

async function pullRequestStatus(token, number) {
  const pr = await api(token, `/pulls/${number}`)
  const [statuses, checks] = await Promise.all([
    api(token, `/commits/${pr.head.sha}/status`),
    api(token, `/commits/${pr.head.sha}/check-runs?per_page=100`),
  ])
  return {
    number: pr.number, state: pr.state, merged: pr.merged, base: pr.base.ref,
    head: pr.head.ref, headSha: pr.head.sha, baseSha: pr.base.sha,
    mergeable: pr.mergeable, mergeableState: pr.mergeable_state,
    statuses: statuses.statuses.map(item => ({ context: item.context, state: item.state })),
    checks: checks.check_runs.map(item => ({ name: item.name, status: item.status, conclusion: item.conclusion })),
    url: pr.html_url,
  }
}

async function createRelease(token, { tag, commit, name, notes, assetPath }) {
  let release = null
  try {
    release = await api(token, `/releases/tags/${tag}`)
  } catch (error) {
    if (!error.message.includes('GitHub API 404')) throw error
  }

  if (!release) {
    release = await api(token, '/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: commit,
        name,
        body: notes,
        draft: false,
        prerelease: false,
      }),
    })
  }

  if (!assetPath) return { release, asset: null }

  const assetName = path.basename(assetPath)
  const existingAsset = release.assets.find((asset) => asset.name === assetName)
  if (existingAsset) await api(token, `/releases/assets/${existingAsset.id}`, { method: 'DELETE' })

  const file = fs.readFileSync(assetPath)
  const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(assetName)}`)
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'supply-chain-hub-ops',
      'Content-Type': 'application/zip',
      'Content-Length': String(file.length),
    },
    body: file,
  })
  if (!response.ok) throw new Error(`Asset upload failed: ${response.status} ${await response.text()}`)
  const asset = await response.json()
  return { release, asset }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  let token = getToken()

  try {
    if (command === 'pr') {
      const [branch, title, bodyFile] = args
      const body = fs.readFileSync(bodyFile, 'utf8')
      const pr = await createPullRequest(token, { branch, title, body })
      console.log(JSON.stringify({ number: pr.number, state: pr.state, url: pr.html_url }))
      return
    }
    if (command === 'update-pr') {
      const [number, title, bodyFile] = args
      const body = fs.readFileSync(bodyFile, 'utf8')
      const pr = await api(token, `/pulls/${number}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
      console.log(JSON.stringify({ number: pr.number, title: pr.title, url: pr.html_url }))
      return
    }
    if (command === 'pr-status') {
      console.log(JSON.stringify(await pullRequestStatus(token, args[0])))
      return
    }
    if (command === 'merge-pr') {
      const [number, expectedHead] = args
      const status = await pullRequestStatus(token, number)
      if (status.state !== 'open' || status.base !== 'main' || !/^release\/\d+\.\d+\.\d+$/.test(status.head) || status.headSha !== expectedHead || status.mergeable !== true || status.mergeableState !== 'clean') throw new Error(`PR is not safely mergeable: ${JSON.stringify(status)}`)
      if (status.statuses.some(item => item.state !== 'success') || status.checks.some(item => item.status !== 'completed' || !['success', 'skipped', 'neutral'].includes(item.conclusion))) throw new Error(`PR checks are not passing: ${JSON.stringify(status)}`)
      const merged = await api(token, `/pulls/${number}/merge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: expectedHead, merge_method: 'merge', commit_title: `Merge PR #${number}: Supply Chain Hub ${status.head.slice('release/'.length)}` }),
      })
      if (!merged.merged) throw new Error('GitHub did not merge the release PR')
      console.log(JSON.stringify({ merged: true, sha: merged.sha, url: status.url }))
      return
    }
    if (command === 'release') {
      const [tag, commit, name, notesFile, assetPath] = args
      const notes = fs.readFileSync(notesFile, 'utf8')
      const { release, asset } = await createRelease(token, { tag, commit, name, notes, assetPath: assetPath || null })
      console.log(JSON.stringify({ tag: release.tag_name, url: release.html_url, asset: asset ? asset.name : null }))
      return
    }
    if (command === 'release-status') {
      const release = await api(token, `/releases/tags/${args[0]}`)
      console.log(JSON.stringify({ tag: release.tag_name, target: release.target_commitish, url: release.html_url, assets: release.assets.map(asset => ({ name: asset.name, size: asset.size, digest: asset.digest, download: asset.browser_download_url })) }))
      return
    }
    throw new Error('Usage: github-ops.cjs pr <branch> <title> <bodyFile> | pr-status <number> | merge-pr <number> <expectedHead> | update-pr <number> <title> <bodyFile> | release <tag> <commit> <name> <notesFile> [assetPath] | release-status <tag>')
  } finally {
    token = null
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
