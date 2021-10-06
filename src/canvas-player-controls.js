import * as dom from './dom';
import EventTarget from './event-target';

/**
 * This class reacts to interactions with the canvas and
 * triggers appropriate functionality on the player. Right now
 * it does two things:
 *
 * 1. A `mousedown`/`touchstart` followed by `touchend`/`mouseup` without any
 *    `touchmove` or `mousemove` toggles play/pause on the player, or exits the VR mode, or shows VR config
 * 2. Only moving on/clicking the control bar or toggling play/pause should
 *    show the control bar. Moving around the scene in the canvas should not. Currently not used.
 */
class CanvasPlayerControls extends EventTarget {
  constructor(player, canvas, api) {
    super();

    this.player = player;
    this.canvas = canvas;
    this.api = api;

    this.onMoveEnd = this.onMoveEnd.bind(this);
    this.onMoveStart = this.onMoveStart.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onControlBarMove = this.onControlBarMove.bind(this);

    // TODO: port this to flowplayer - see comments for the function below
    /* this.player.controlBar.on([
      'mousedown',
      'mousemove',
      'mouseup',
      'touchstart',
      'touchmove',
      'touchend'
    ], this.onControlBarMove);*/

    // we have to override these here because
    // video.js listens for user activity on the video element
    // and makes the user active when the mouse moves.
    // We don't want that for 3d videos

    /* this.oldReportUserActivity = this.player.reportUserActivity;
    this.player.reportUserActivity = () => {};*/

    // canvas movements
    this.canvas.addEventListener('mousedown', this.onMoveStart);
    this.canvas.addEventListener('touchstart', this.onMoveStart);
    this.canvas.addEventListener('mousemove', this.onMove);
    this.canvas.addEventListener('touchmove', this.onMove);
    this.canvas.addEventListener('mouseup', this.onMoveEnd);
    this.canvas.addEventListener('touchend', this.onMoveEnd);

    this.resetTouchStatus();
  }

  togglePlay() {
    if (this.api.paused) {
      this.api.play();
    } else {
      this.api.pause();
    }
  }

  onMoveStart(e) {

    // if the player does not have a controlbar or
    // the move was a mouse click but not left click do not
    // toggle play.
    // TODO: how do we check for flowplayer having a controlbar?
    if (/* !this.player.controls() || */(e.type === 'mousedown' && !dom.isSingleLeftClick(e))) {
      this.resetTouchStatus();
      return;
    }

    const touch_x = e.touches && e.touches[0].clientX;
    const touch_y = e.touches && e.touches[0].clientY;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.resetTouchStatus();

    // Did the user tap where the cardboard UI back button is (top left)?
    if (touch_x < 50 && touch_y < 50) {
      this.shouldExitVR = true;

    // Did the user tap where the cardboard UI settings button is (bottom centered)?
    } else if (touch_x > width / 2 - 25 && touch_x < width / 2 + 25 && touch_y > height - 50) {
      this.shouldShowConfig = true;

    // Any other tap should pause the video
    } else {
      this.shouldTogglePlay = true;
    }
    this.touchMoveCount_ = 0;
  }

  onMoveEnd(e) {

    // We want to have the same behavior in VR360 Player and standar player.
    // in touchend we want to know if was a touch click, for a click we show the bar,
    // otherwise continue with the mouse logic.
    //
    // Maximum movement allowed during a touch event to still be considered a tap
    // Other popular libs use anywhere from 2 (hammer.js) to 15,
    // so 10 seems like a nice, round number.
    if (e.type === 'touchend' && this.touchMoveCount_ < 10) {

      // TODO: how to check/show the controlbar in flowplayer here? do we need to? let's test it...
      /* if (this.player.userActive() === false) {
        this.player.userActive(true);
        return;
      }

      this.player.userActive(false);
      return;*/
    }

    if (e.type == 'mouseup' || e.type == 'touchend') {
      const vrDisplay = this.player.data('vr') && this.player.data('vr').vrDisplay;

      if (vrDisplay && this.shouldExitVR) {
        vrDisplay.exitPresent();

      } else if (vrDisplay && this.shouldShowConfig) {
        vrDisplay.viewerSelector_.show(vrDisplay.layer_.source.parentElement);

      // We want the same behavior in Desktop for VR360  and standar player
      } else if (this.shouldTogglePlay) {
        this.togglePlay();
      }
    }

  }

  onMove(e) {

    // Increase touchMoveCount_ since Android detects 1 - 6 touches when user click normaly
    this.touchMoveCount_++;

    this.resetTouchStatus();
  }

  onControlBarMove(e) {
    // TODO: how to show control bar on flowplayer? do we need to? let's test
    // this.player.userActive(true);
  }

  resetTouchStatus() {
    this.shouldExitVR = false;
    this.shouldShowConfig = false;
    this.shouldTogglePlay = false;
  }

  dispose() {
    this.canvas.removeEventListener('mousedown', this.onMoveStart);
    this.canvas.removeEventListener('touchstart', this.onMoveStart);
    this.canvas.removeEventListener('mousemove', this.onMove);
    this.canvas.removeEventListener('touchmove', this.onMove);
    this.canvas.removeEventListener('mouseup', this.onMoveEnd);
    this.canvas.removeEventListener('touchend', this.onMoveEnd);

    // TODO: port this to flowplayer - see comments for _this.player.controlBar.on above
    /* this.player.controlBar.off([
      'mousedown',
      'mousemove',
      'mouseup',
      'touchstart',
      'touchmove',
      'touchend'
    ], this.onControlBarMove);*/

    // this.player.reportUserActivity = this.oldReportUserActivity;
  }
}

export default CanvasPlayerControls;
