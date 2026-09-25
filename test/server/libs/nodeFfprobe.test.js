const { expect } = require('chai')
const EventEmitter = require('events')
const child_process = require('child_process')
const sinon = require('sinon')

describe('nodeFfprobe', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should handle process exit without ReferenceError on undeclared exitCode', async () => {
    delete require.cache[require.resolve('../../../server/libs/nodeFfprobe')]
    const mockProc = new EventEmitter()
    mockProc.stdout = new EventEmitter()
    mockProc.stderr = new EventEmitter()
    mockProc.stdout.setEncoding = () => {}
    mockProc.stderr.setEncoding = () => {}

    sandbox.stub(child_process, 'spawn').callsFake(() => {
      setImmediate(() => {
        mockProc.stdout.emit('data', '{"streams":[],"format":{}}')
        mockProc.emit('exit', 0)
        mockProc.emit('close')
      })
      return mockProc
    })

    const nodeFfprobe = require('../../../server/libs/nodeFfprobe')
    const result = await nodeFfprobe('test-media-file.mp3')
    expect(result).to.deep.equal({ streams: [], format: {} })
  })
})
