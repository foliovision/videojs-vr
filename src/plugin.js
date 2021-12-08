// import {version as VERSION} from '../package.json';
import window from 'global/window';
import document from 'global/document';
import 'babel-polyfill';
import WebXRPolyfill from 'webxr-polyfill';
import * as THREE from 'three';
import OrbitOrientationContols from './orbit-orientation-controls.js';
import * as utils from './utils';
import * as browser from './browser';
import CanvasPlayerControls from './canvas-player-controls';
import OmnitoneController from './omnitone-controller';
import {BoxGeometry, BufferGeometry, SphereGeometry} from "../../old/three.module";

const errors = {
  'web-xr-not-supported': {
    headline: '360 not supported on this device',
    type: '360_NOT_SUPPORTED',
    message: "Your browser does not support 360. See <a href='http://webxr.info'>http://webxr.info</a> for assistance."
  },
  'web-xr-hls-cors-not-supported': {
    headline: '360 HLS video not supported on this device',
    type: '360_NOT_SUPPORTED',
    message: "Your browser/device does not support HLS 360 video. See <a href='http://webxr.info'>http://webxr.info</a> for assistance."
  },
  'web-xr-video-not-found': {
    headline: '360 video element not found',
    type: '360_VIDEO_NOT_FOUND',
    message: 'The 3D video did not load correctly. Please try to reload the page.'
  }
};

if (typeof (flowplayer) !== 'undefined') {
  flowplayer(function(api, root) {
    root = jQuery(root);
    const $fp_player = root.find('.fp-player');
    let videoElement = root.find('video');
    let have_native_subtitles_conf = null;
    let have_subtitles_support = null;

    function isVRVideo() {
      return ((typeof (api.conf.clip) !== 'undefined' && api.conf.clip.vr) || (typeof (api.conf.playlist[0]) !== 'undefined' && api.conf.playlist[0].vr));
    }

    class VR {

      constructor(player, options) {
        this.options_ = options;
        this.player_ = player;
        this.api_ = api;
        this.video_element = null;

        // IE 11 does not support enough webgl to be supported
        // older safari does not support cors, so it wont work
        if (browser.IE_VERSION || !utils.corsSupport) {
          // if a player triggers error before 'loadstart' is fired
          // video.js will reset the error overlay
          this.triggerError_({code: 'web-xr-not-supported', dismiss: false});
          return;
        }

        if (!navigator.xr) {
          this.polyfill_ = new WebXRPolyfill({
            // do not show rotate instructions
            ROTATE_INSTRUCTIONS_DISABLED: true,
            // for iPhone disable cardboard UI with back button & settings
            CARDBOARD_UI_DISABLED: flowplayer.support.iOS
          });
          // this.polyfill_ = new WebXRPolyfill();
        }

        this.handleVrDisplayActivate_ = this.handleVrDisplayActivate_.bind(this);
        this.handleVrDisplayDeactivate_ = this.handleVrDisplayDeactivate_.bind(this);
        this.onXRSessionEnd_ = this.onXRSessionEnd_.bind(this);
        this.handleResize_ = this.handleResize_.bind(this);
        this.animate_ = this.animate_.bind(this);
        this.currentSession = null;

        this.setProjection(this.options_.projection);

        // any time the video element is recycled for ads
        // we have to reset the vr state and re-init after ad
        // TODO: convert for flowplayer when we have mid-roll ads
        /* this.on(player, 'adstart', () => player.setTimeout(() => {
          // if the video element was recycled for this ad
          if (!player.ads || !player.ads.videoElementRecycled()) {
            this.log('video element not recycled for this ad, no need to reset');
            return;
          }

          this.log('video element recycled for this ad, reseting');
          this.reset();

          this.one(player, 'playing', this.init);
        }), 1);*/

        // this.on(player, 'loadedmetadata', this.init);
        this.log('VR init');
      }

      changeProjection_(projection) {
        projection = utils.getInternalProjectionName(projection);
        // don't change to an invalid projection
        if (!projection) {
          projection = 'NONE';
        }

        const position = {x: 0, y: 0, z: 0};

        if (this.scene) {
          this.scene.remove(this.movieScreen);
        }
        if (projection === '360') {
          this.movieGeometry = new THREE.SphereBufferGeometry(256, this.options_.sphereDetail, this.options_.sphereDetail);
          this.movieMaterial = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            overdraw: true,
            side: THREE.BackSide
          });

          this.movieScreen = new THREE.Mesh(this.movieGeometry, this.movieMaterial);
          this.movieScreen.position.set(position.x, position.y, position.z);

          this.movieScreen.scale.x = -1;
          this.movieScreen.quaternion.setFromAxisAngle({x: 0, y: 1, z: 0}, -Math.PI / 2);
          this.scene.add(this.movieScreen);
        } else if (projection === '360_LR' || projection === '360_TB') {
          // Left eye view
          let geometry = new SphereGeometry(
            256,
            this.options_.sphereDetail,
            this.options_.sphereDetail
          );

          let uvs = geometry.faceVertexUvs[0];

          for (let i = 0; i < uvs.length; i++) {
            for (let j = 0; j < 3; j++) {
              if (projection === '360_LR') {
                uvs[i][j].x *= 0.5;
              } else {
                uvs[i][j].y *= 0.5;
                uvs[i][j].y += 0.5;
              }
            }
          }

          this.movieGeometry = new BufferGeometry().fromGeometry(geometry);
          this.movieMaterial = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            overdraw: true,
            side: THREE.BackSide
          });

          this.movieScreen = new THREE.Mesh(this.movieGeometry, this.movieMaterial);
          this.movieScreen.scale.x = -1;
          this.movieScreen.quaternion.setFromAxisAngle({x: 0, y: 1, z: 0}, -Math.PI / 2);
          // display in left eye only
          this.movieScreen.layers.set(1);
          this.scene.add(this.movieScreen);

          // Right eye view
          geometry = new SphereGeometry(
            256,
            this.options_.sphereDetail,
            this.options_.sphereDetail
          );

          uvs = geometry.faceVertexUvs[0];

          for (let i = 0; i < uvs.length; i++) {
            for (let j = 0; j < 3; j++) {
              if (projection === '360_LR') {
                uvs[i][j].x *= 0.5;
                uvs[i][j].x += 0.5;
              } else {
                uvs[i][j].y *= 0.5;
              }
            }
          }

          this.movieGeometry = new BufferGeometry().fromGeometry(geometry);
          this.movieMaterial = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            overdraw: true,
            side: THREE.BackSide
          });

          this.movieScreen = new THREE.Mesh(this.movieGeometry, this.movieMaterial);
          this.movieScreen.scale.x = -1;
          this.movieScreen.quaternion.setFromAxisAngle({x: 0, y: 1, z: 0}, -Math.PI / 2);
          // display in right eye only
          this.movieScreen.layers.set(2);
          this.scene.add(this.movieScreen);
        } else if (projection === '360_CUBE') {
          this.movieGeometry = new BoxGeometry(256, 256, 256);
          this.movieMaterial = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            overdraw: true,
            side: THREE.BackSide
          });

          const left = [new THREE.Vector2(0, 0.5), new THREE.Vector2(0.333, 0.5), new THREE.Vector2(0.333, 1), new THREE.Vector2(0, 1)];
          const right = [new THREE.Vector2(0.333, 0.5), new THREE.Vector2(0.666, 0.5), new THREE.Vector2(0.666, 1), new THREE.Vector2(0.333, 1)];
          const top = [new THREE.Vector2(0.666, 0.5), new THREE.Vector2(1, 0.5), new THREE.Vector2(1, 1), new THREE.Vector2(0.666, 1)];
          const bottom = [new THREE.Vector2(0, 0), new THREE.Vector2(0.333, 0), new THREE.Vector2(0.333, 0.5), new THREE.Vector2(0, 0.5)];
          const front = [new THREE.Vector2(0.333, 0), new THREE.Vector2(0.666, 0), new THREE.Vector2(0.666, 0.5), new THREE.Vector2(0.333, 0.5)];
          const back = [new THREE.Vector2(0.666, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 0.5), new THREE.Vector2(0.666, 0.5)];

          this.movieGeometry.faceVertexUvs[0] = [];

          this.movieGeometry.faceVertexUvs[0][0] = [right[2], right[1], right[3]];
          this.movieGeometry.faceVertexUvs[0][1] = [right[1], right[0], right[3]];

          this.movieGeometry.faceVertexUvs[0][2] = [left[2], left[1], left[3]];
          this.movieGeometry.faceVertexUvs[0][3] = [left[1], left[0], left[3]];

          this.movieGeometry.faceVertexUvs[0][4] = [top[2], top[1], top[3]];
          this.movieGeometry.faceVertexUvs[0][5] = [top[1], top[0], top[3]];

          this.movieGeometry.faceVertexUvs[0][6] = [bottom[2], bottom[1], bottom[3]];
          this.movieGeometry.faceVertexUvs[0][7] = [bottom[1], bottom[0], bottom[3]];

          this.movieGeometry.faceVertexUvs[0][8] = [front[2], front[1], front[3]];
          this.movieGeometry.faceVertexUvs[0][9] = [front[1], front[0], front[3]];

          this.movieGeometry.faceVertexUvs[0][10] = [back[2], back[1], back[3]];
          this.movieGeometry.faceVertexUvs[0][11] = [back[1], back[0], back[3]];

          this.movieScreen = new THREE.Mesh(this.movieGeometry, this.movieMaterial);
          this.movieScreen.position.set(position.x, position.y, position.z);
          this.movieScreen.rotation.y = -Math.PI;

          this.scene.add(this.movieScreen);
        } else if (projection === '180' || projection === '180_LR' || projection === '180_MONO') {
          let geometry = new SphereGeometry(
            256,
            this.options_.sphereDetail,
            this.options_.sphereDetail,
            Math.PI,
            Math.PI
          );

          // Left eye view
          geometry.scale(-1, 1, 1);
          let uvs = geometry.faceVertexUvs[0];

          if (projection !== '180_MONO') {
            for (let i = 0; i < uvs.length; i++) {
              for (let j = 0; j < 3; j++) {
                uvs[i][j].x *= 0.5;
              }
            }
          }

          this.movieGeometry = new BufferGeometry().fromGeometry(geometry);
          this.movieMaterial = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            overdraw: true
          });
          this.movieScreen = new THREE.Mesh(this.movieGeometry, this.movieMaterial);
          // display in left eye only
          this.movieScreen.layers.set(1);
          this.scene.add(this.movieScreen);

          if (projection !== '180_MONO') {
            // Right eye view
            geometry = new SphereGeometry(
              256,
              this.options_.sphereDetail,
              this.options_.sphereDetail,
              Math.PI,
              Math.PI
            );
            geometry.scale(-1, 1, 1);
            uvs = geometry.faceVertexUvs[0];

            for (let i = 0; i < uvs.length; i++) {
              for (let j = 0; j < 3; j++) {
                uvs[i][j].x *= 0.5;
                uvs[i][j].x += 0.5;
              }
            }

            this.movieGeometry = new BufferGeometry().fromGeometry(geometry);
            this.movieMaterial = new THREE.MeshBasicMaterial({
              map: this.videoTexture,
              overdraw: true
            });
            this.movieScreen = new THREE.Mesh(this.movieGeometry, this.movieMaterial);
            // display in right eye only
            this.movieScreen.layers.set(2);
            this.scene.add(this.movieScreen);
          }
        } else if (projection === 'EAC' || projection === 'EAC_LR') {
          const makeScreen = (mapMatrix, scaleMatrix) => {
            // "Continuity correction?": because of discontinuous faces and aliasing,
            // we truncate the 2-pixel-wide strips on all discontinuous edges,
            const contCorrect = 2;

            this.movieGeometry = new BoxGeometry(256, 256, 256);
            this.movieMaterial = new THREE.ShaderMaterial({
              overdraw: true, side: THREE.BackSide,
              uniforms: {
                mapped: {value: this.videoTexture},
                mapMatrix: {value: mapMatrix},
                contCorrect: {value: contCorrect},
                faceWH: {value: new THREE.Vector2(1 / 3, 1 / 2).applyMatrix3(scaleMatrix)},
                vidWH: {value: new THREE.Vector2(this.videoTexture.image.videoWidth, this.videoTexture.image.videoHeight).applyMatrix3(scaleMatrix)}
              },
              vertexShader: `
varying vec2 vUv;
uniform mat3 mapMatrix;

void main() {
vUv = (mapMatrix * vec3(uv, 1.)).xy;
gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`,
              fragmentShader: `
varying vec2 vUv;
uniform sampler2D mapped;
uniform vec2 faceWH;
uniform vec2 vidWH;
uniform float contCorrect;

const float PI = 3.1415926535897932384626433832795;

void main() {
vec2 corner = vUv - mod(vUv, faceWH) + vec2(0, contCorrect / vidWH.y);

vec2 faceWHadj = faceWH - vec2(0, contCorrect * 2. / vidWH.y);

vec2 p = (vUv - corner) / faceWHadj - .5;
vec2 q = 2. / PI * atan(2. * p) + .5;

vec2 eUv = corner + q * faceWHadj;

gl_FragColor = texture2D(mapped, eUv);
}`
            });

            const right = [new THREE.Vector2(0, 1 / 2), new THREE.Vector2(1 / 3, 1 / 2), new THREE.Vector2(1 / 3, 1), new THREE.Vector2(0, 1)];
            const front = [new THREE.Vector2(1 / 3, 1 / 2), new THREE.Vector2(2 / 3, 1 / 2), new THREE.Vector2(2 / 3, 1), new THREE.Vector2(1 / 3, 1)];
            const left = [new THREE.Vector2(2 / 3, 1 / 2), new THREE.Vector2(1, 1 / 2), new THREE.Vector2(1, 1), new THREE.Vector2(2 / 3, 1)];
            const bottom = [new THREE.Vector2(1 / 3, 0), new THREE.Vector2(1 / 3, 1 / 2), new THREE.Vector2(0, 1 / 2), new THREE.Vector2(0, 0)];
            const back = [new THREE.Vector2(1 / 3, 1 / 2), new THREE.Vector2(1 / 3, 0), new THREE.Vector2(2 / 3, 0), new THREE.Vector2(2 / 3, 1 / 2)];
            const top = [new THREE.Vector2(1, 0), new THREE.Vector2(1, 1 / 2), new THREE.Vector2(2 / 3, 1 / 2), new THREE.Vector2(2 / 3, 0)];

            for (const face of [right, front, left, bottom, back, top]) {
              const height = this.videoTexture.image.videoHeight;
              let lowY = 1;
              let highY = 0;

              for (const vector of face) {
                if (vector.y < lowY) {
                  lowY = vector.y;
                }
                if (vector.y > highY) {
                  highY = vector.y;
                }
              }

              for (const vector of face) {
                if (Math.abs(vector.y - lowY) < Number.EPSILON) {
                  vector.y += contCorrect / height;
                }
                if (Math.abs(vector.y - highY) < Number.EPSILON) {
                  vector.y -= contCorrect / height;
                }

                vector.x = vector.x / height * (height - contCorrect * 2) + contCorrect / height;
              }
            }

            this.movieGeometry.faceVertexUvs[0] = [];

            this.movieGeometry.faceVertexUvs[0][0] = [right[2], right[1], right[3]];
            this.movieGeometry.faceVertexUvs[0][1] = [right[1], right[0], right[3]];

            this.movieGeometry.faceVertexUvs[0][2] = [left[2], left[1], left[3]];
            this.movieGeometry.faceVertexUvs[0][3] = [left[1], left[0], left[3]];

            this.movieGeometry.faceVertexUvs[0][4] = [top[2], top[1], top[3]];
            this.movieGeometry.faceVertexUvs[0][5] = [top[1], top[0], top[3]];

            this.movieGeometry.faceVertexUvs[0][6] = [bottom[2], bottom[1], bottom[3]];
            this.movieGeometry.faceVertexUvs[0][7] = [bottom[1], bottom[0], bottom[3]];

            this.movieGeometry.faceVertexUvs[0][8] = [front[2], front[1], front[3]];
            this.movieGeometry.faceVertexUvs[0][9] = [front[1], front[0], front[3]];

            this.movieGeometry.faceVertexUvs[0][10] = [back[2], back[1], back[3]];
            this.movieGeometry.faceVertexUvs[0][11] = [back[1], back[0], back[3]];

            this.movieScreen = new THREE.Mesh(this.movieGeometry, this.movieMaterial);
            this.movieScreen.position.set(position.x, position.y, position.z);
            this.movieScreen.rotation.y = -Math.PI;
            return this.movieScreen;
          };

          if (projection === 'EAC') {
            this.scene.add(makeScreen(new THREE.Matrix3(), new THREE.Matrix3()));
          } else {
            const scaleMatrix = new THREE.Matrix3().set(
              0, 0.5, 0,
              1, 0, 0,
              0, 0, 1
            );

            makeScreen(new THREE.Matrix3().set(
              0, -0.5, 0.5,
              1, 0, 0,
              0, 0, 1
            ), scaleMatrix);
            // display in left eye only
            this.movieScreen.layers.set(1);
            this.scene.add(this.movieScreen);

            makeScreen(new THREE.Matrix3().set(
              0, -0.5, 1,
              1, 0, 0,
              0, 0, 1
            ), scaleMatrix);
            // display in right eye only
            this.movieScreen.layers.set(2);
            this.scene.add(this.movieScreen);
          }
        } else if (projection === 'FISHEYE') {

          this.movieGeometry = new SphereGeometry(
            256, // radius - sphere´s radius
            48, // widthSegments - number of horizontal segments
            48, // heightSegments - number of vertical segments
            0, // phiStart - specify horizontal starting angle
            2 * Math.PI, // phiLength - specify horizontal sweep angle size
            0, // thetaStart - specify vercial starting angle
            Math.PI // thetaLength - specify vertical sweep angle
          );

          this.movieMaterial = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            overdraw: true,
            side: THREE.BackSide
          });

          for (let i = 0; i < this.movieGeometry.faceVertexUvs[0].length; i++) {
            const uvs = this.movieGeometry.faceVertexUvs[0][i];
            const face = this.movieGeometry.faces[i];

            for (let j = 0; j < 3; j++) {
              const x = face.vertexNormals[j].x;
              const y = face.vertexNormals[j].y;
              const z = face.vertexNormals[j].z;

              // Hemispherical fish-eye:

              // uvs[j].x = (x + 1) / 2;
              // uvs[j].y = (z + 1) / 2;

              // Angular fish-eyes:

              const k = 0.0; // Fish-eye factor
              // Equidistant:   k = 0
              // Stereographic: k = 0.5
              // Orthographic:  k = -1.0
              // Equisolid:     k = -0.5
              // Rectilinear:   k = 1.0
              const theta_spherical = Math.acos(z); // Spherical angle
              let rho = 0; // Radius

              if (k >= -1 && k < 0) {
                rho = (1 / k) * Math.sin(k * theta_spherical);
              } else if (k == 0) {
                rho = theta_spherical;
              } else if (k > 0 && k <= 1) {
                rho = (1 / k) * Math.tan(k * theta_spherical);
              } else {
                console.error('Illegal fish-eye factor!');
                rho = theta_spherical;
              }

              rho = rho / Math.PI; // Interval correction
              const theta_polar = Math.atan2(y, x); // Polar angle

              // Convert to Cartesian coordinates

              uvs[j].x = (rho * Math.cos(theta_polar)) + 0.5;
              uvs[j].y = (rho * Math.sin(theta_polar)) + 0.5;
            }
          }

          // this.movieGeometry.rotateX(-Math.PI / 2); // Floor mount
          // this.movieGeometry.rotateX(Math.PI / 2);  // Ceiling mount
          this.movieGeometry.rotateY(Math.PI); // Wall mount
          this.movieGeometry.uvsNeedUpdate = true;
          this.movieScreen = new THREE.Mesh(this.movieGeometry, this.movieMaterial);
          this.scene.add(this.movieScreen);
          this.scene.background = new THREE.Color(0x444444);
        }

        this.currentProjection_ = projection.toUpperCase();

      }

      triggerError_(errorObj) {
        // strip any html content from the error message
        // as it is not supported outside of videojs-errors
        const div = document.createElement('div');

        div.innerHTML = errors[errorObj.code].message;

        const message = div.textContent || div.innerText || '';

        this.player_.error({
          code: errorObj.code,
          message
        });
      }

      log(...msgs) {
        if (!this.options_.debug) {
          return;
        }

        msgs.forEach((msg) => {
          console.log('VR: ', msg);
        });
      }

      handleVrDisplayActivate_() {
        if (!this.xrSupported || !browser.IS_IOS) {
          return;
        }

        const self = this;
        const sessionInit = { optionalFeatures: ['local-floor'] };

        navigator.xr.requestSession('immersive-vr', sessionInit).then(function(session) {
          self.renderer.xr.setSession(session);
          session.addEventListener('end', self.onXRSessionEnd_);
          self.xrActive = true;
          self.currentSession = session;
          session.requestReferenceSpace('local')
            .then((referenceSpace) => {
              self.xrReferenceSpace = referenceSpace;
            });
          self.controls3d.disable();
          self.animationFrameId_ = self.requestAnimationFrame(self.animate_);

          // TODO: do we need this for WebXR?
          // webvr-polyfill/cardboard ui only watches for click events
          // to tell that the back arrow button is pressed during cardboard vr.
          // but somewhere along the line these events are silenced with preventDefault
          // but only on iOS, so we translate them ourselves here
          /* let touches = [];
          const iosCardboardTouchStart_ = (e) => {
            for (let i = 0; i < e.touches.length; i++) {
              touches.push(e.touches[i]);
            }
          };

          const iosCardboardTouchEnd_ = (e) => {
            if (!touches.length) {
              return;
            }

            touches.forEach((t) => {
              const simulatedClick = new window.MouseEvent('click', {
                screenX: t.screenX,
                screenY: t.screenY,
                clientX: t.clientX,
                clientY: t.clientY
              });

              this.renderedCanvas.dispatchEvent(simulatedClick);
            });

            touches = [];
          };

          this.renderedCanvas.addEventListener('touchstart', iosCardboardTouchStart_);
          this.renderedCanvas.addEventListener('touchend', iosCardboardTouchEnd_);

          this.iosRevertTouchToClick_ = () => {
            this.renderedCanvas.removeEventListener('touchstart', iosCardboardTouchStart_);
            this.renderedCanvas.removeEventListener('touchend', iosCardboardTouchEnd_);
            this.iosRevertTouchToClick_ = null;
          };*/
        });
      }

      handleVrDisplayDeactivate_() {
        if ( this.currentSession ) {
          this.currentSession.end();
        }

        if (this.iosRevertTouchToClick_) {
          this.iosRevertTouchToClick_();
        }

        // remove active flag from the VR button
        root.find('.fv-fp-cardboard').removeClass('active');
      }

      onXRSessionEnd_() {
        if (this.animationFrameId_) {
          this.currentSession.cancelAnimationFrame(this.animationFrameId_);
          this.animationFrameId_ = 0;
        }
        this.currentSession = null;
        this.xrActive = false;
        this.controls3d.enable();
        // TOOD: do we need this or is this a VideoJS-only thing?
        // this.trigger('xrSessionDeactivated');
        this.animationFrameId_ = this.requestAnimationFrame(this.animate_);
      }

      supportsRaf() {
        return typeof window.requestAnimationFrame === 'function' && typeof window.cancelAnimationFrame === 'function';
      }

      requestAnimationFrame(fn) {
        if (this.xrActive) {
          return this.currentSession.requestAnimationFrame(fn);
        }
        if (this.supportsRaf()) {
          return window.requestAnimationFrame(() => {
            fn();
          });
        }
        // TODO: store timeouts and stop them when changing player instance
        return window.setTimeout(fn, 1000 / 60);

      }

      cancelAnimationFrame(id) {
        if (this.xrActive) {
          return this.currentSession.cancelAnimationFrame(id);
        }

        return window.cancelAnimationFrame(id);
      }

      togglePlay_() {
        if (this.api_.paused) {
          api_.play();
        } else {
          api_.pause();
        }
      }

      animate_(xrTimestamp, xrFrame) {
        if (!this.initialized_ || typeof (this.getVideoEl_()) === 'undefined') {
          return;
        }
        if (this.getVideoEl_().readyState === this.getVideoEl_().HAVE_ENOUGH_DATA) {
          if (this.videoTexture) {
            this.videoTexture.needsUpdate = true;
          }
        }

        if (!this.xrActive) {
          this.controls3d.update();
        }

        if (this.omniController) {
          this.omniController.update(this.camera);
        }

        if (this.xrActive && xrFrame) {
          this.xrPose = xrFrame.getViewerPose(this.xrReferenceSpace);
          // TOOD: do we need this or is this a VideoJS-only thing?
          // this.trigger('xrCameraUpdate');
        }

        if (window.navigator.getGamepads) {
          // Grab all gamepads
          const gamepads = window.navigator.getGamepads();

          for (let i = 0; i < gamepads.length; ++i) {
            const gamepad = gamepads[i];

            // Make sure gamepad is defined
            // Only take input if state has changed since we checked last
            if (!gamepad || !gamepad.timestamp || gamepad.timestamp === this.prevTimestamps_[i]) {
              continue;
            }
            for (let j = 0; j < gamepad.buttons.length; ++j) {
              if (gamepad.buttons[j].pressed) {
                this.togglePlay_();
                this.prevTimestamps_[i] = gamepad.timestamp;
                break;
              }
            }
          }
        }

        // TODO: if the gamepads code doesn't work, this is from the WebVR to WebXR migration code
        //       however, I've got no idea what xrReferenceSpace should point to here...
        // Loop through all input sources.
        /* for (let inputSource of xrSession.inputSources) {
          // Show the input source if it has a grip space
          if (inputSource.gripSpace) {
            let inputPose = frame.getPose(inputSource.gripSpace, xrReferenceSpace);
            scene.showControllerAtTransform(inputPose.position, inputPose.orientation, inputSource.handedness);
          }
        }*/

        this.camera.getWorldDirection(this.cameraVector);
        this.animationFrameId_ = this.requestAnimationFrame(this.animate_);
        this.renderer.render(this.scene, this.camera);
      }

      applyResize_(camera) {
        const width = $fp_player.width();
        const height = $fp_player.height();

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      checkIOSorientation() {
        // if we're on iOS and in VR, check whether to show/hide
        // message about VR not working in portrait mode
        if (browser.IS_IOS && root.find('.fv-fp-cardboard').hasClass('active')) {
          const
            $hidden_msg_div = root.find('.fp-vr-ios-msg');
          const $fp_ui = root.find('.fp-ui');

          if ($hidden_msg_div.length) {
            if (window.innerHeight > window.innerWidth) {
              root.data('vr').renderedCanvas.style.display = 'none';
              $hidden_msg_div.show();

              // make the UI appear above the message
              $fp_ui.data('fv_player_vr_old_index', $fp_ui.css('z-index'));
              $fp_ui.css('z-index', 1001);
            } else {
              root.data('vr').renderedCanvas.style.display = 'block';
              $hidden_msg_div.hide();

              // return the UI z-index to its original state
              if ($fp_ui.data('fv_player_vr_old_index')) {
                $fp_ui.css('z-index', $fp_ui.data('fv_player_vr_old_index'));
                $fp_ui.removeData('fv_player_vr_old_index');
              }
            }
          }
        }
      }

      handleResize_() {
        const
          applyResizeLocal = this.applyResize_;
        const checkISOorientationLocal = this.checkIOSorientation;
        const camLocal = this.camera;

        applyResizeLocal(camLocal);

        // iOS does not recalculate player width and height on fullscreen resize (device orientation change),
        // so we need to give it 200ms time to cope and adjust the projection matrix accordingly
        setTimeout(function() {
          applyResizeLocal(camLocal);
          checkISOorientationLocal();

          // we need to double-check whether we're in VR or not,
          // since when exitting fullscreen might not trigger fullscreen-exit nor vrdisplaydeactivate events
          if (root.data('vr') && root.data('vr').vrDisplay && !root.data('vr').vrDisplay.isPresenting) {
            // remove active flag from the VR button
            root.find('.fv-fp-cardboard').removeClass('active');
          }
        }, 200);
      }

      setProjection(projection) {

        if (!utils.getInternalProjectionName(projection)) {
          console.error('flowplayer-vr: please pass a valid projection ' + utils.validProjections.join(', '));
          return;
        }

        this.currentProjection_ = projection.toUpperCase();
        this.defaultProjection_ = projection.toUpperCase();
      }

      init() {
        this.reset();

        this.xrSupported = false;
        this.camera = new THREE.PerspectiveCamera(60, $fp_player.width() / $fp_player.height(), 1, 1000);
        // Store vector representing the direction in which the camera is looking, in world space.
        this.cameraVector = new THREE.Vector3();

        if (this.currentProjection_ === '360_LR' || this.currentProjection_ === '360_TB' || this.currentProjection_ === '180' || this.currentProjection_ === '180_LR' || this.currentProjection_ === '180_MONO' || this.currentProjection_ === 'EAC_LR') {
          // Render left eye when not in VR mode
          this.camera.layers.enable(1);
        }

        this.scene = new THREE.Scene();
        this.videoTexture = new THREE.VideoTexture(this.getVideoEl_());

        // shared regardless of wether VideoTexture is used or
        // an image canvas is used
        this.videoTexture.generateMipmaps = false;
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.format = THREE.RGBFormat;

        this.changeProjection_(this.currentProjection_);

        if (this.currentProjection_ === 'NONE') {
          this.log('Projection is NONE, dont init');
          this.reset();
          return;
        }

        // cardboard forced to on
        if (this.options_.forceCardboard) {
          this.addCardboardButton_();
        }

        // if ios remove full screen toggle
        // TODO: convert to flowplayer
        /* if (browser.IS_IOS && this.player_.controlBar && this.player_.controlBar.fullscreenToggle) {
          this.player_.controlBar.fullscreenToggle.hide();
        }*/

        this.camera.position.set(0, 0, 0);
        this.renderer = new THREE.WebGLRenderer({
          devicePixelRatio: window.devicePixelRatio,
          alpha: false,
          clearColor: 0xffffff,
          antialias: true
        });

        // TODO: do we need this for WebXR?
        const webglContext = this.renderer.getContext('webgl');
        const oldTexImage2D = webglContext.texImage2D;

        /* this is a workaround since threejs uses try catch */
        webglContext.texImage2D = (...args) => {
          try {
            return oldTexImage2D.apply(webglContext, args);
          } catch (e) {
            this.reset();
            api.pause();
            this.triggerError_({code: 'web-xr-hls-cors-not-supported', dismiss: false});
            throw new Error(e);
          }
        };
        // TODO: END OF - do we need this for WebXR?

        this.renderer.setSize($fp_player.width(), $fp_player.height(), false);

        // end an old WebXR session
        if (this.currentSession) {
          this.currentSession.end();
        }

        this.currentSession = null;

        // Previous timestamps for gamepad updates
        this.prevTimestamps_ = [];

        this.renderedCanvas = this.renderer.domElement;
        this.renderedCanvas.setAttribute('style', 'width: 100%; height: 100%; position: absolute; top:0;');
        this.renderedCanvas.setAttribute('class', 'fp-vr-renderer');

        videoElement = root.find('video');

        if (!videoElement.length) {
          this.triggerError_({code: 'web-xr-video-not-found', dismiss: false});
          throw new Error('web-xr-video-not-found');
        }

        // We must put the canvas after the video tag to make sure it's visible
        // We should not be using video element inline styles on video as
        // FV Player DRM won't allow that in Firefox to avoid PiP
        videoElement.after(this.renderedCanvas);
        /* videoElStyle.zIndex = '-1';
        videoElStyle.opacity = '0';*/

        this.xrActive = false;

        // Native WebVR Head Mounted Displays (HMDs) like the HTC Vive
        // also need the cardboard button to enter fully immersive mode
        // so, we want to add the button if we're not polyfilled.
        // TODO: do w need this for WebXR?
        /* if (!this.vrDisplay.isPolyfilled) {
          this.log('Real HMD found using VRControls', this.vrDisplay);
          this.addCardboardButton_();

          // We use VRControls here since we are working with an HMD
          // and we only want orientation controls.
          this.controls3d = new VRControls(this.camera);
        }*/

        if (!this.controls3d) {
          this.log('no HMD found Using Orbit & Orientation Controls');
          const options = {
            camera: this.camera,
            canvas: this.renderedCanvas,
            // check if its a half sphere view projection
            halfView: this.currentProjection_.indexOf('180') === 0,
            orientation: browser.IS_IOS || browser.IS_ANDROID || false
          };

          if (this.options_.motionControls === false) {
            options.orientation = false;
          }

          this.controls3d = new OrbitOrientationContols(options);
          this.canvasPlayerControls = new CanvasPlayerControls(this.player_, this.renderedCanvas, this.api_);
        }

        if (window.navigator.xr) {
          // this.renderer.xr.enabled = true;
          // this.renderer.xr.setReferenceSpaceType('local');
          const self = this;

          navigator.xr.isSessionSupported('immersive-vr').then(function(supported) {
            self.xrSupported = supported;
            if (supported) {
              if (browser.IS_ANDROID || browser.IS_IOS) {
                self.addCardboardButton_();
              }
              console.log('webxr session supported');
            } else {
              console.log('web xr device not found, using orbit controls');
            }
          });
        } else {
          console.log('web xr not available');
        }

        this.animationFrameId_ = this.requestAnimationFrame(this.animate_);

        if (this.options_.omnitone) {
          const audiocontext = THREE.AudioContext.getContext();

          this.omniController = new OmnitoneController(
            audiocontext,
            this.options_.omnitone, this.getVideoEl_(), this.options_.omnitoneOptions
          );
          this.omniController.one('audiocontext-suspended', () => {
            api.pause();
            api.one('playing', () => {
              audiocontext.resume();
            });
          });
        }

        api.on('fullscreen', this.handleResize_);
        api.on('fullscreen-exit', this.handleResize_);

        // Hotfix for iPhone, make sure that exiting fullscreen will disable VR mode
        api.on('fullscreen-exit', this.handleVrDisplayDeactivate_);
        // Hotfix for iPhone, make sure the canvas is not too big after leaving fullscreen
        // The Three JS code seems to set 100vh and 100 vw for it, but then there is nothing to remove that
        const that = this;

        api.on('fullscreen-exit', function() {
          that.renderedCanvas.setAttribute('style', 'width: 100%; height: 100%; position: absolute; top:0;');

          // remove active flag from the VR button
          root.find('.fv-fp-cardboard').removeClass('active');
        });

        window.addEventListener('fullscreenchange', this.handleResize_, true);
        window.addEventListener('vrdisplaypresentchange', this.handleResize_, true);
        window.addEventListener('resize', this.handleResize_, true);
        window.addEventListener('orientationchange', this.checkIOSorientation, true);
        window.addEventListener('vrdisplayactivate', this.handleVrDisplayActivate_, true);
        window.addEventListener('vrdisplaydeactivate', this.handleVrDisplayDeactivate_, true);

        this.initialized_ = true;
      }

      addCardboardButton_() {
        jQuery('<strong class="fv-fp-cardboard">VR</strong>')
          .insertAfter(root.find('.fp-controls .fp-volume')).click(function() {
            const $e = jQuery(this);

            if (!$e.hasClass('active')) {
              if (api.ready && !api.playing) {
                api.play();
              }
              window.dispatchEvent(new window.Event('vrdisplayactivate'));
            } else {
              window.dispatchEvent(new window.Event('vrdisplaydeactivate'));
            }

            $e.toggleClass('active');
          });
      }

      getVideoEl_() {
        // try to find and cache the video element if on page,
        // reset to NULL if not found yet (i.e. player not yet in "ready" state)
        if (this.video_element === null) {
          this.video_element = root.find('video:first')[0];
          if (typeof (this.video_element) === 'undefined') {
            this.video_element = null;
          }
        }

        return this.video_element;
      }

      reset() {
        if (!this.initialized_) {
          return;
        }

        if (this.omniController) {
          this.omniController.off('audiocontext-suspended');
          this.omniController.dispose();
          this.omniController = undefined;
        }

        if (this.controls3d) {
          this.controls3d.dispose();
          this.controls3d = null;
        }

        if (this.canvasPlayerControls) {
          this.canvasPlayerControls.dispose();
          this.canvasPlayerControls = null;
        }

        if (this.currentSession) {
          this.currentSession.removeEventListener('end', this.onXRSessionEnd_, true);
        }

        window.removeEventListener('resize', this.handleResize_, true);
        window.removeEventListener('vrdisplaypresentchange', this.handleResize_, true);
        window.removeEventListener('vrdisplayactivate', this.handleVrDisplayActivate_, true);
        window.removeEventListener('vrdisplaydeactivate', this.handleVrDisplayDeactivate_, true);

        // remove the cardboard button
        jQuery('.fv-fp-cardboard').remove();

        // TODO: controlbar check for flowplayer
        // show the fullscreen again
        if (browser.IS_IOS/* && this.player_.controlBar && this.player_.controlBar.fullscreenToggle*/) {
          // TODO: convert for flowplayer
          // this.player_.controlBar.fullscreenToggle.show();
        }

        // reset the video element style so that it will be displayed
        const videoElStyle = this.getVideoEl_().style;

        videoElStyle.zIndex = '';
        videoElStyle.opacity = '';

        // set the current projection to the default
        this.currentProjection_ = this.defaultProjection_.toUpperCase();

        // reset the ios touch to click workaround
        if (this.iosRevertTouchToClick_) {
          this.iosRevertTouchToClick_();
        }

        // remove the old canvas
        if (this.renderedCanvas) {
          this.renderedCanvas.parentNode.removeChild(this.renderedCanvas);
        }

        if (this.animationFrameId_) {
          this.cancelAnimationFrame(this.animationFrameId_);
        }

        this.initialized_ = false;
      }

      dispose() {
        this.reset();
      }

      polyfillVersion() {
        return '2.0.3';
      }
    }

    VR.prototype.setTimeout = window.setTimeout;
    VR.prototype.clearTimeout = window.clearTimeout;

    // VR.VERSION = VERSION;

    api.on('ready', function() {
      if (api.video.vr && not_supported()) {
        fv_player_notice(root, 'Your device does not support VR.', 2000);
        return;
      }

      root.toggleClass('is-vr', api.video.vr);

      if (api.video.vr) {
        const
          vr_data = api.video.vrvideo;
        const vr_object = new VR(root, {
          projection: (vr_data.projection ? vr_data.projection : '360'),
          sphereDetail: 128,
          debug: true
        });

        root.data('vr', vr_object);
        vr_object.init();

        // if we're on iOS, we need to add a hidden message that will be displayed
        // instead of canvas when in portrait mode, since that mode screws VR output dimensions
        if (browser.IS_IOS) {
          // add hidden message DIV
          const $hidden_msg_div = jQuery('<div class="fp-vr-ios-msg">While in VR, please make sure to use landscape phone rotation.</div>');

          $hidden_msg_div.css({
            'width': '100%',
            'height': '100%',
            'position': 'absolute',
            'background-color': 'black',
            'display': 'none',
            'padding-top': '20%',
            'z-index': 1000,
            'text-align': 'center',
            'color': 'white'
          });

          root.prepend($hidden_msg_div);
          vr_object.checkIOSorientation();
        }
      }
    });

    jQuery(document).one('click', '.fp-ui', function() {
      if (browser.IS_IOS && ((typeof (api.conf.clip) !== 'undefined' && api.conf.clip.vr) || (typeof (api.conf.playlist[0]) !== 'undefined' && api.conf.playlist[0].vr))) {
        try {
          DeviceMotionEvent.requestPermission().then(response => {
            if (response == 'granted') {
              window.addEventListener('devicemotion', (e) => {});
            }
          }).catch(ex => console.log('error requesting sensors permission: ', ex));
        } catch (ex) {
          console.log('error requesting sensors permission (eval error): ', ex);
        }
      }
    });

    // The video must be allowed to use CORS headers
    // Also, without this HLS won't play on iPhone
    function create_video_tag_with_cors() {
      const
        video_tag_properties = {
          'className': 'fp-engine',
          'crossOrigin': 'anonymous',
          'x-webkit-airplay': 'allow',
          'preload': api.splash ? 'none' : true,
          'autoplay': api.splash ? 'autoplay' : false,
          'webkit-playsinline': true,
          'playsinline': true
        };

      if (!isVRVideo()) {
        delete video_tag_properties.crossOrigin;
      }

      if (videoElement.length == 0) {
        const video_el = flowplayer.common.createElement('video', video_tag_properties);

        flowplayer.common.prepend(flowplayer.common.find('.fp-player', root)[0], video_el);
        videoElement = flowplayer.common.find('video', root);
      }
    }

    // This is something to do with iOS - we need to force user of native subtitles
    // otherwise the CORS won't be accepted - or something like that.
    function video_tag_cors_and_subtitles_disabled_for_load() {
      if (videoElement.length == 0) {
        return;
      }

      if (isVRVideo()) {
        videoElement[0].setAttribute('crossorigin', 'anonymous');
      }

      api.on('load', function() {
        have_native_subtitles_conf = Boolean(api.conf.nativesubtitles);
        have_subtitles_support = Boolean(flowplayer.support.subtitles);
        api.conf.nativesubtitles = true;
        flowplayer.support.subtitles = false;
      }).on('ready', function() {
        api.conf.nativesubtitles = have_native_subtitles_conf;
        flowplayer.support.subtitles = have_subtitles_support;
      });
    }

    if (!not_supported()) {
      create_video_tag_with_cors();
      video_tag_cors_and_subtitles_disabled_for_load();
    }

    // TODO: It could work with a MP4 video, but not HLS
    function not_supported() {
      // Detect iOS < 14
      return flowplayer.support.iOS && parseInt(flowplayer.support.iOS.version) < 14;
    }
  });
}

// export default VR;
