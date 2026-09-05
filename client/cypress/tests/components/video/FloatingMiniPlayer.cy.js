import FloatingMiniPlayer from '@/components/video/FloatingMiniPlayer.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

describe('FloatingMiniPlayer', () => {
  const defaultPropsData = {
    visible: true,
    title: 'Test Video Title',
    author: 'Test Video Author',
    paused: true,
    currentTime: 30,
    duration: 120,
    playbackRate: 1,
    loading: false
  }

  const mocks = {
    : {
      state: {},
      getters: {},
      commit: () => {},
      dispatch: () => {}
    },
    : (seconds) => {
      if (isNaN(seconds) || seconds === null) return '00:00'
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return 
    }
  }

  const stubs = {
    'ui-tooltip': Tooltip
  }

  function createMountOptions(propsData = {}, listeners = {}) {
    return {
      propsData: {
        ...defaultPropsData,
        ...propsData
      },
      mocks,
      stubs,
      listeners
    }
  }

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.clear()
      } catch (e) {}
    }
  })

  it('renders when visible is true with title and author', () => {
    cy.mount(FloatingMiniPlayer, createMountOptions({
      visible: true,
      title: 'Amazing Documentary',
      author: 'Jane Doe'
    }))

    cy.get('#floating-mini-player').should('be.visible')
    cy.get('#floating-mini-player').should('contain.text', 'Amazing Documentary')
    cy.get('#floating-mini-player').should('contain.text', 'Jane Doe')
  })

  it('does not render when visible is false', () => {
    cy.mount(FloatingMiniPlayer, createMountOptions({
      visible: false
    }))

    cy.get('#floating-mini-player').should('not.exist')
  })

  it('emits returnToPlayer when expand button is clicked', () => {
    const returnToPlayerSpy = cy.spy().as('returnToPlayerSpy')
    cy.mount(FloatingMiniPlayer, createMountOptions({}, {
      returnToPlayer: returnToPlayerSpy
    }))

    cy.get('button[aria-label="Expand to Main Player"]').click({ force: true })
    cy.get('@returnToPlayerSpy').should('have.been.calledOnce')
  })

  it('emits close when close button is clicked', () => {
    const closeSpy = cy.spy().as('closeSpy')
    cy.mount(FloatingMiniPlayer, createMountOptions({}, {
      close: closeSpy
    }))

    cy.get('button[aria-label="Close Mini Player"]').click({ force: true })
    cy.get('@closeSpy').should('have.been.calledOnce')
  })

  it('emits playPause when play/pause button is clicked', () => {
    const playPauseSpy = cy.spy().as('playPauseSpy')
    cy.mount(FloatingMiniPlayer, createMountOptions({ paused: true }, {
      playPause: playPauseSpy
    }))

    cy.get('button[aria-label="Play"]').click({ force: true })
    cy.get('@playPauseSpy').should('have.been.calledOnce')
  })

  it('emits playPause when pause button is clicked while playing', () => {
    const playPauseSpy = cy.spy().as('playPauseSpy')
    cy.mount(FloatingMiniPlayer, createMountOptions({ paused: false }, {
      playPause: playPauseSpy
    }))

    cy.get('button[aria-label="Pause"]').click({ force: true })
    cy.get('@playPauseSpy').should('have.been.calledOnce')
  })

  it('toggles minimized state when minimize button is clicked, verifying that the minimized view renders with video icon, title, play button, and restore button', () => {
    cy.mount(FloatingMiniPlayer, createMountOptions({
      visible: true,
      title: 'Minimized Video Test',
      author: 'Test Creator',
      paused: true
    }))

    // Initially in full player mode
    cy.get('button[aria-label="Minimize Player"]').should('exist')
    cy.get('button[aria-label="Restore Video Player"]').should('not.exist')

    // Click minimize button to enter minimized view
    cy.get('button[aria-label="Minimize Player"]').click({ force: true })

    // Verify minimized view elements:
    // 1. Video icon (videocam material symbol)
    cy.get('#floating-mini-player')
      .contains('.material-symbols', 'videocam')
      .should('be.visible')

    // 2. Title
    cy.get('#floating-mini-player')
      .should('contain.text', 'Minimized Video Test')

    // 3. Play button
    cy.get('#floating-mini-player')
      .find('button[aria-label="Play"]')
      .should('be.visible')

    // 4. Restore button
    cy.get('#floating-mini-player')
      .find('button[aria-label="Restore Video Player"]')
      .should('be.visible')

    // Click restore button to restore full view
    cy.get('button[aria-label="Restore Video Player"]').click({ force: true })

    // Verify restored state
    cy.get('button[aria-label="Restore Video Player"]').should('not.exist')
    cy.get('button[aria-label="Minimize Player"]').should('exist')
  })

  it('emits seek when progress track is clicked', () => {
    const seekSpy = cy.spy().as('seekSpy')
    cy.mount(FloatingMiniPlayer, createMountOptions({
      duration: 100,
      currentTime: 10
    }, {
      seek: seekSpy
    }))

    // Click the scrubber container / track
    cy.get('#floating-mini-player')
      .find('.cursor-pointer.py-1')
      .click('center', { force: true })

    cy.get('@seekSpy').should('have.been.calledOnce')
    cy.get('@seekSpy').should((spy) => {
      expect(spy.firstCall.args[0]).to.be.a('number')
      expect(spy.firstCall.args[0]).to.be.closeTo(50, 20)
    })
  })

  it('emits seek when progress track is scrubbed with mouse drag', () => {
    const seekSpy = cy.spy().as('seekSpy')
    cy.mount(FloatingMiniPlayer, createMountOptions({
      duration: 100,
      currentTime: 10
    }, {
      seek: seekSpy
    }))

    cy.get('#floating-mini-player')
      .find('.mini-scrubber')
      .trigger('mousedown', { which: 1, clientX: 100, clientY: 50, force: true })
      .trigger('mousemove', { clientX: 200, clientY: 50, force: true })
      .trigger('mouseup', { force: true })

    cy.get('@seekSpy').should('have.been.called')
  })
})
