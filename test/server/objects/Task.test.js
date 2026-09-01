const { expect } = require('chai')
const Task = require('../../../server/objects/Task')

describe('Task', () => {
  it('should support setProgress and include progress in toJSON', () => {
    const task = new Task()
    task.setData('test-action', { text: 'Title' }, { text: 'Desc' }, false)

    expect(task.progress).to.be.null
    const jsonBefore = task.toJSON()
    expect(jsonBefore.progress).to.be.null

    task.setProgress(0.55)
    expect(task.progress).to.equal(0.55)

    const jsonAfter = task.toJSON()
    expect(jsonAfter.progress).to.equal(0.55)
  })

  it('should accept plain strings for title, description, and failure message', () => {
    const task = new Task()
    task.setData('test-action', 'Simple Title String', 'Simple Description String', false)

    expect(task.title).to.equal('Simple Title String')
    expect(task.titleKey).to.be.null
    expect(task.description).to.equal('Simple Description String')

    task.setFailed('Failure error string')
    expect(task.error).to.equal('Failure error string')
    expect(task.isFailed).to.be.true
    expect(task.isFinished).to.be.true
  })
})
