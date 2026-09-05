const dns = require('dns')
const http = require('http')

const dnsPromises = dns.promises

/**
 * Check if DNS can resolve common hostnames within timeout
 * @param {string} hostname
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function checkDns(hostname, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let resolved = false
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve(false)
      }
    }, timeoutMs)

    dnsPromises
      .resolve(hostname)
      .then((records) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          resolve(Array.isArray(records) && records.length > 0)
        }
      })
      .catch(() => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          resolve(false)
        }
      })
  })
}

/**
 * Fallback connectivity probe directly to an IP address (bypasses local DNS)
 * @param {string} ip
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function checkIpProbe(ip = '1.1.1.1', port = 80, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let resolved = false
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        try {
          req.destroy()
        } catch {
          // ignore
        }
        resolve(false)
      }
    }, timeoutMs)

    const req = http.request(
      {
        host: ip,
        port,
        method: 'HEAD',
        timeout: timeoutMs,
        path: '/'
      },
      () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          resolve(true)
        }
      }
    )

    req.on('error', () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        resolve(false)
      }
    })
    req.on('timeout', () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        try {
          req.destroy()
        } catch {
          // ignore
        }
        resolve(false)
      }
    })
    req.end()
  })
}

/**
 * Verify if outbound internet connectivity is available.
 * Tries DNS resolution first, followed by direct IP probe fallback.
 *
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<boolean>}
 */
async function isOnline(timeoutMs = 5000) {
  // Try fast DNS lookup first (cloudflare.com or google.com)
  const dnsOk = await Promise.race([checkDns('cloudflare.com', timeoutMs), checkDns('google.com', timeoutMs)])
  if (dnsOk) return true

  // Fallback to direct IP check in case DNS is momentarily unresponsive
  const ipOk = await Promise.race([checkIpProbe('1.1.1.1', 80, timeoutMs), checkIpProbe('8.8.8.8', 53, timeoutMs)])
  return !!ipOk
}

/**
 * Determine if an error or stderr output was caused by a network outage or transient connection failure.
 *
 * @param {Error|object|null} error
 * @param {string} [stderr='']
 * @returns {boolean}
 */
function isNetworkError(error, stderr = '') {
  if (!error && !stderr) return false

  const errCode = error?.code || ''
  const errMsg = (error?.message || '').toLowerCase()
  const stderrStr = (typeof stderr === 'string' ? stderr : '').toLowerCase()

  const networkCodes = [
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNABORTED',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
    'ERR_NETWORK',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET'
  ]

  if (networkCodes.includes(errCode)) return true

  const networkPhrases = [
    'getaddrinfo enotfound',
    'getaddrinfo eai_again',
    'socket hang up',
    'connection reset',
    'connection refused',
    'network is unreachable',
    'temporary failure in name resolution',
    'name or service not known',
    'connection timed out',
    'the read operation timed out',
    'remotedisconnected',
    'network error',
    'client network socket disconnected',
    'unable to download webpage',
    'urlopen error',
    'giving up after'
  ]

  for (const phrase of networkPhrases) {
    if (errMsg.includes(phrase) || stderrStr.includes(phrase)) {
      return true
    }
  }

  return false
}

module.exports = {
  isOnline,
  isNetworkError,
  checkDns,
  checkIpProbe
}
