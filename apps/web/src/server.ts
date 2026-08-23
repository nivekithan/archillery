import { env } from 'cloudflare:workers'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export default createServerEntry({
  fetch(request) {
    if (isGitProtocolRequest(request)) {
      return env.GIT_WORKER.fetch(request)
    }
    return handler.fetch(request)
  },
})

function isGitProtocolRequest(request: Request) {
  const { pathname } = new URL(request.url)
  return ['/info/refs', '/git-upload-pack', '/git-receive-pack'].some((path) =>
    pathname.endsWith(path),
  )
}
