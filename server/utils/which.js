const { execFile } = require('child_process')

/**
 * Find executable path on system PATH
 * @param {string} bin - Executable binary name
 * @returns {Promise<string>}
 */
module.exports = function which(bin) {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    execFile(cmd, [bin], (err, stdout) => {
      if (err) return resolve(null)
      const path = stdout?.trim().split('\n')[0].trim()
      if (!path) return resolve(null)
      resolve(path)
    })
  })
}
