const { expect } = require('chai')
const sinon = require('sinon')
const DailyLog = require('../../../server/objects/DailyLog')
const fs = require('../../../server/libs/fsExtra')
const fileUtils = require('../../../server/utils/fileUtils')

describe('DailyLog', function () {
  let dailyLog
  let fakeDir = '/fake/logs/daily'

  beforeEach(function () {
    dailyLog = new DailyLog(fakeDir)
    sinon.stub(dailyLog, 'appendLogLine').resolves()
  })

  afterEach(function () {
    sinon.restore()
  })

  describe('appendLog', function () {
    it('should append log object and cap memory to 5000 logs', function () {
      // Pre-fill with 5000 items
      for (let i = 0; i < 5000; i++) {
        dailyLog.logs.push({ message: `log ${i}` })
      }
      expect(dailyLog.logs.length).to.equal(5000)

      // Append one more
      dailyLog.appendLog({ message: 'newest log' })
      expect(dailyLog.logs.length).to.equal(5000)
      expect(dailyLog.logs[4999].message).to.equal('newest log')
      expect(dailyLog.logs[0].message).to.equal('log 1')
    })
  })

  describe('loadLogs', function () {
    it('should load lines and cap memory to 5000 logs without losing parsed validity', async function () {
      const mockLines = []
      for (let i = 0; i < 6000; i++) {
        mockLines.push(JSON.stringify({ timestamp: '2026-09-02', message: `msg ${i}` }))
      }

      sinon.stub(fs, 'pathExists').resolves(true)
      sinon.stub(fileUtils, 'readTextFile').resolves(mockLines.join('\n'))
      sinon.stub(fs, 'writeFile').resolves()

      await dailyLog.loadLogs()

      expect(dailyLog.logs.length).to.equal(5000)
      expect(dailyLog.logs[0].message).to.equal('msg 1000')
      expect(dailyLog.logs[4999].message).to.equal('msg 5999')
    })

    it('should ignore malformed JSON lines and re-save cleaned logs', async function () {
      const mockLines = [
        JSON.stringify({ timestamp: '2026-09-02', message: 'valid 1' }),
        'NOT VALID JSON',
        JSON.stringify({ timestamp: '2026-09-02', message: 'valid 2' })
      ]

      sinon.stub(fs, 'pathExists').resolves(true)
      sinon.stub(fileUtils, 'readTextFile').resolves(mockLines.join('\n'))
      const writeFileStub = sinon.stub(fs, 'writeFile').resolves()

      await dailyLog.loadLogs()

      expect(dailyLog.logs.length).to.equal(2)
      expect(dailyLog.logs[0].message).to.equal('valid 1')
      expect(dailyLog.logs[1].message).to.equal('valid 2')
      expect(writeFileStub.calledOnce).to.be.true
    })
  })
})
