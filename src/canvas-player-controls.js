import * as dom from './dom';
import EventTarget from './event-target';

/**
 * This class reacts to interactions with the canvas and
 * triggers appropriate functionality on the player. Right now
 * it does two things:
 *
 * 1. A `mousedown`/`touchstart` followed by `touchend`/`mouseup` without any
 *    `touchmove` or `mousemove` toggles play/pause on the player
 * 2. Only moving on/clicking the control bar or toggling play/pause should
 *    show the control bar. Moving around the scene in the canvas should not.
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
    /*this.player.controlBar.on([
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

    /*this.oldReportUserActivity = this.player.reportUserActivity;
    this.player.reportUserActivity = () => {};*/

    // canvas movements
    this.canvas.addEventListener('mousedown', this.onMoveStart);
    this.canvas.addEventListener('touchstart', this.onMoveStart);
    this.canvas.addEventListener('mousemove', this.onMove);
    this.canvas.addEventListener('touchmove', this.onMove);
    this.canvas.addEventListener('mouseup', this.onMoveEnd);
    this.canvas.addEventListener('touchend', this.onMoveEnd);

    this.shouldTogglePlay = false;
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
    if (/*!this.player.controls() || */(e.type === 'mousedown' && !dom.isSingleLeftClick(e))) {
      this.shouldTogglePlay = false;
      return;
    }

    this.shouldTogglePlay = true;
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
      /*if (this.player.userActive() === false) {
        this.player.userActive(true);
        return;
      }

      this.player.userActive(false);
      return;*/
    }

    if (!this.shouldTogglePlay) {
      return;
    }

    // We want the same behavior in Desktop for VR360  and standar player
    if(e.type == 'mouseup') {
      this.togglePlay();
    }

  }

  onMove(e) {

    // Increase touchMoveCount_ since Android detects 1 - 6 touches when user click normaly
    this.touchMoveCount_++;

    this.shouldTogglePlay = false;
  }

  onControlBarMove(e) {
    // TODO: how to show control bar on flowplayer? do we need to? let's test
    //this.player.userActive(true);
  }

  dispose() {
    this.canvas.removeEventListener('mousedown', this.onMoveStart);
    this.canvas.removeEventListener('touchstart', this.onMoveStart);
    this.canvas.removeEventListener('mousemove', this.onMove);
    this.canvas.removeEventListener('touchmove', this.onMove);
    this.canvas.removeEventListener('mouseup', this.onMoveEnd);
    this.canvas.removeEventListener('touchend', this.onMoveEnd);

    // TODO: port this to flowplayer - see comments for _this.player.controlBar.on above
    /*this.player.controlBar.off([
      'mousedown',
      'mousemove',
      'mouseup',
      'touchstart',
      'touchmove',
      'touchend'
    ], this.onControlBarMove);*/

    //this.player.reportUserActivity = this.oldReportUserActivity;
  }
}

export default CanvasPlayerControls;
