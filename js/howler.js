(function () {
  var audioCache = {};
  var audioContext = null;
  var useWebAudio = true;
  var noAudioSupport = false;

  // 检查音频支持
  if (typeof AudioContext !== "undefined") {
    audioContext = new AudioContext();
  } else if (typeof webkitAudioContext !== "undefined") {
    audioContext = new webkitAudioContext();
  } else if (typeof Audio !== "undefined") {
    useWebAudio = false;
    try {
      new Audio();
    } catch (e) {
      noAudioSupport = true;
    }
  } else {
    useWebAudio = false;
    noAudioSupport = true;
  }

  // WebAudio主音量节点
  var masterGainNode;
  if (useWebAudio) {
    masterGainNode = typeof audioContext.createGain === "undefined"
      ? audioContext.createGainNode()
      : audioContext.createGain();
    masterGainNode.gain.value = 1;
    masterGainNode.connect(audioContext.destination);
  }

  // 全局Howler对象
  function HowlerGlobal() {
    this._volume = 1;
    this._muted = false;
    this.usingWebAudio = useWebAudio;
    this._howls = [];
  }

  HowlerGlobal.prototype = {
    volume: function (vol) {
      var self = this;
      if (typeof vol !== "undefined") {
        vol = parseFloat(vol);
        if (vol >= 0 && vol <= 1) {
          self._volume = vol;
          if (useWebAudio) {
            masterGainNode.gain.value = vol;
          }
          for (var key in self._howls) {
            if (self._howls.hasOwnProperty(key) && self._howls[key]._webAudio === false) {
              for (var i = 0; i < self._howls[key]._audioNode.length; i++) {
                self._howls[key]._audioNode[i].volume = self._howls[key]._volume * self._volume;
              }
            }
          }
          return self;
        }
      }
      return useWebAudio ? masterGainNode.gain.value : self._volume;
    },
    mute: function () {
      this._setMuted(true);
      return this;
    },
    unmute: function () {
      this._setMuted(false);
      return this;
    },
    _setMuted: function (muted) {
      var self = this;
      self._muted = muted;
      if (useWebAudio) {
        masterGainNode.gain.value = muted ? 0 : self._volume;
      }
      for (var key in self._howls) {
        if (self._howls.hasOwnProperty(key) && self._howls[key]._webAudio === false) {
          for (var i = 0; i < self._howls[key]._audioNode.length; i++) {
            self._howls[key]._audioNode[i].muted = muted;
          }
        }
      }
    }
  };

  var Howler = new HowlerGlobal();

  // 检查音频格式支持
  var audioTest = null;
  var codecs = {};
  if (!noAudioSupport) {
    audioTest = new Audio();
    codecs = {
      mp3: !!audioTest.canPlayType("audio/mpeg;").replace(/^no$/, ""),
      opus: !!audioTest.canPlayType('audio/ogg; codecs="opus"').replace(/^no$/, ""),
      ogg: !!audioTest.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/, ""),
      wav: !!audioTest.canPlayType('audio/wav; codecs="1"').replace(/^no$/, ""),
      m4a: !!(audioTest.canPlayType("audio/x-m4a;") || audioTest.canPlayType("audio/aac;")).replace(/^no$/, ""),
      webm: !!audioTest.canPlayType('audio/webm; codecs="vorbis"').replace(/^no$/, "")
    };
  }

  // Howl音频对象
  function Howl(options) {
    var self = this;
    self._autoplay = options.autoplay || false;
    self._buffer = options.buffer || false;
    self._duration = options.duration || 0;
    self._format = options.format || null;
    self._loop = options.loop || false;
    self._loaded = false;
    self._sprite = options.sprite || {};
    self._src = options.src || "";
    self._pos3d = options.pos3d || [0, 0, -0.5];
    self._volume = options.volume || 1;
    self._urls = options.urls || [];
    self._rate = options.rate || 1;
    self._onload = [options.onload || function () {}];
    self._onloaderror = [options.onloaderror || function () {}];
    self._onend = [options.onend || function () {}];
    self._onpause = [options.onpause || function () {}];
    self._onplay = [options.onplay || function () {}];
    self._onendTimer = [];
    self._webAudio = useWebAudio && !self._buffer;
    self._audioNode = [];
    if (self._webAudio) {
      self._setupAudioNode();
    }
    Howler._howls.push(self);
    self.load();
  }

  Howl.prototype = {
    load: function () {
      var self = this;
      var url = null;
      if (noAudioSupport) {
        self.on("loaderror");
        return;
      }
      var canPlay = {
        mp3: codecs.mp3,
        opus: codecs.opus,
        ogg: codecs.ogg,
        wav: codecs.wav,
        m4a: codecs.m4a,
        weba: codecs.webm
      };
      for (var i = 0; i < self._urls.length; i++) {
        var ext;
        if (self._format) {
          ext = self._format;
        } else {
          ext = self._urls[i].toLowerCase().match(/.+\.([^?]+)(\?|$)/);
          ext = ext && ext.length >= 2 ? ext[1] : self._urls[i].toLowerCase().match(/data\:audio\/([^?]+);/)[1];
        }
        if (canPlay[ext]) {
          url = self._urls[i];
          break;
        }
      }
      if (!url) {
        self.on("loaderror");
        return;
      }
      self._src = url;
      if (self._webAudio) {
        loadBuffer(self, url);
      } else {
        var newNode = new Audio();
        self._audioNode.push(newNode);
        newNode.src = url;
        newNode._pos = 0;
        newNode.preload = "auto";
        newNode.volume = Howler._muted ? 0 : self._volume * Howler.volume();
        audioCache[url] = self;
        var listener = function () {
          self._duration = newNode.duration;
          if (Object.getOwnPropertyNames(self._sprite).length === 0) {
            self._sprite = {
              _default: [0, self._duration * 1E3]
            };
          }
          if (!self._loaded) {
            self._loaded = true;
            self.on("load");
          }
          if (self._autoplay) {
            self.play();
          }
          newNode.removeEventListener("canplaythrough", listener, false);
        };
        newNode.addEventListener("canplaythrough", listener, false);
        newNode.load();
      }
      return self;
    },
    urls: function (urls) {
      var self = this;
      if (urls) {
        self.stop();
        self._urls = typeof urls === "string" ? [urls] : urls;
        self._loaded = false;
        self.load();
        return self;
      } else {
        return self._urls;
      }
    },
    play: function (sprite, callback) {
      var self = this;
      if (typeof sprite === "function") {
        callback = sprite;
      }
      if (!sprite || typeof sprite === "function") {
        sprite = "_default";
      }
      if (!self._loaded) {
        self.on("load", function () {
          self.play(sprite, callback);
        });
        return self;
      }
      if (!self._sprite[sprite]) {
        if (typeof callback === "function") {
          callback();
        }
        return self;
      }
      self._inactiveNode(function (node) {
        node._sprite = sprite;
        var pos = node._pos > 0 ? node._pos : self._sprite[sprite][0] / 1E3;
        var duration = self._sprite[sprite][1] / 1E3 - node._pos;
        var loop = !!(self._loop || self._sprite[sprite][2]);
        var soundId = typeof callback === "string" ? callback : Math.round(Date.now() * Math.random()) + "";
        var timerId;
        (function () {
          var data = {
            id: soundId,
            sprite: sprite,
            loop: loop
          };
          timerId = setTimeout(function () {
            if (!self._webAudio && loop) {
              self.stop(data.id, data.timer).play(sprite, data.id);
            }
            if (self._webAudio && !loop) {
              self._nodeById(data.id).paused = true;
            }
            if (!self._webAudio && !loop) {
              self.stop(data.id, data.timer);
            }
            self.on("end", soundId);
          }, duration * 1E3);
          self._onendTimer.push(timerId);
          data.timer = self._onendTimer[self._onendTimer.length - 1];
        })();
        if (self._webAudio) {
          var loopStart = self._sprite[sprite][0] / 1E3;
          var loopEnd = self._sprite[sprite][1] / 1E3;
          node.id = soundId;
          node.paused = false;
          refreshBuffer(self, [loop, loopStart, loopEnd], soundId);
          self._playStart = audioContext.currentTime;
          node.gain.value = self._volume;
          if (typeof node.bufferSource.start === "undefined") {
            node.bufferSource.noteGrainOn(0, pos, duration);
          } else {
            node.bufferSource.start(0, pos, duration);
          }
        } else {
          if (node.readyState === 4) {
            node.id = soundId;
            node.currentTime = pos;
            node.muted = Howler._muted;
            node.volume = self._volume * Howler.volume();
            setTimeout(function () {
              node.play();
            }, 0);
          } else {
            self._clearEndTimer(timerId);
            (function () {
              var sound = self;
              var playSprite = sprite;
              var fn = callback;
              var newNode = node;
              var completed = function () {
                sound.play(playSprite, fn);
                newNode.removeEventListener("canplaythrough", completed, false);
              };
              newNode.addEventListener("canplaythrough", completed, false);
            })();
            return self;
          }
        }
        self.on("play");
        if (typeof callback === "function") {
          callback(soundId);
        }
        return self;
      });
      return self;
    },
    pause: function (id, timerId) {
      var self = this;
      if (!self._loaded) {
        self.on("play", function () {
          self.pause(id);
        });
        return self;
      }
      self._clearEndTimer(timerId || 0);
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        activeNode._pos = self.pos(null, id);
        if (self._webAudio) {
          if (!activeNode.bufferSource) {
            return self;
          }
          activeNode.paused = true;
          if (typeof activeNode.bufferSource.stop === "undefined") {
            activeNode.bufferSource.noteOff(0);
          } else {
            activeNode.bufferSource.stop(0);
          }
        } else {
          activeNode.pause();
        }
      }
      self.on("pause");
      return self;
    },
    stop: function (id, timerId) {
      var self = this;
      if (!self._loaded) {
        self.on("play", function () {
          self.stop(id);
        });
        return self;
      }
      self._clearEndTimer(timerId || 0);
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        activeNode._pos = 0;
        if (self._webAudio) {
          if (!activeNode.bufferSource) {
            return self;
          }
          activeNode.paused = true;
          if (typeof activeNode.bufferSource.stop === "undefined") {
            activeNode.bufferSource.noteOff(0);
          } else {
            activeNode.bufferSource.stop(0);
          }
        } else {
          activeNode.pause();
          activeNode.currentTime = 0;
        }
      }
      return self;
    },
    mute: function (id) {
      var self = this;
      if (!self._loaded) {
        self.on("play", function () {
          self.mute(id);
        });
        return self;
      }
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        if (self._webAudio) {
          activeNode.gain.value = 0;
        } else {
          activeNode.volume = 0;
        }
      }
      return self;
    },
    unmute: function (id) {
      var self = this;
      if (!self._loaded) {
        self.on("play", function () {
          self.unmute(id);
        });
        return self;
      }
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        if (self._webAudio) {
          activeNode.gain.value = self._volume;
        } else {
          activeNode.volume = self._volume;
        }
      }
      return self;
    },
    volume: function (vol, id) {
      var self = this;
      vol = parseFloat(vol);
      if (vol >= 0 && vol <= 1) {
        self._volume = vol;
        if (!self._loaded) {
          self.on("play", function () {
            self.volume(vol, id);
          });
          return self;
        }
        var activeNode = id ? self._nodeById(id) : self._activeNode();
        if (activeNode) {
          if (self._webAudio) {
            activeNode.gain.value = vol;
          } else {
            activeNode.volume = vol * Howler.volume();
          }
        }
        return self;
      } else {
        return self._volume;
      }
    },
    loop: function (loop) {
      var self = this;
      if (typeof loop === "boolean") {
        self._loop = loop;
        return self;
      } else {
        return self._loop;
      }
    },
    sprite: function (sprite) {
      var self = this;
      if (typeof sprite === "object") {
        self._sprite = sprite;
        return self;
      } else {
        return self._sprite;
      }
    },
    pos: function (pos, id) {
      var self = this;
      if (!self._loaded) {
        self.on("load", function () {
          self.pos(pos);
        });
        return typeof pos === "number" ? self : self._pos || 0;
      }
      pos = parseFloat(pos);
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        if (self._webAudio) {
          if (pos >= 0) {
            activeNode._pos = pos;
            self.pause(id).play(activeNode._sprite, id);
            return self;
          } else {
            return activeNode._pos + (audioContext.currentTime - self._playStart);
          }
        } else {
          if (pos >= 0) {
            activeNode.currentTime = pos;
            return self;
          } else {
            return activeNode.currentTime;
          }
        }
      } else {
        if (pos >= 0) {
          return self;
        } else {
          for (var i = 0; i < self._audioNode.length; i++) {
            if (self._audioNode[i].paused && self._audioNode[i].readyState === 4) {
              return self._webAudio ? self._audioNode[i]._pos : self._audioNode[i].currentTime;
            }
          }
        }
      }
    },
    pos3d: function (x, y, z, id) {
      var self = this;
      y = typeof y === "undefined" || !y ? 0 : y;
      z = typeof z === "undefined" || !z ? -0.5 : z;
      if (!self._loaded) {
        self.on("play", function () {
          self.pos3d(x, y, z, id);
        });
        return self;
      }
      if (x >= 0 || x < 0) {
        if (self._webAudio) {
          var activeNode = id ? self._nodeById(id) : self._activeNode();
          if (activeNode) {
            self._pos3d = [x, y, z];
            activeNode.panner.setPosition(x, y, z);
          }
        }
      } else {
        return self._pos3d;
      }
      return self;
    },
    fade: function (from, to, len, callback, id) {
      var self = this;
      var dist = Math.abs(from - to);
      var dir = from > to ? "down" : "up";
      var iterations = dist / 0.01;
      var hold = len / iterations;
      if (!self._loaded) {
        self.on("load", function () {
          self.fade(from, to, len, callback, id);
        });
        return self;
      }
      self.volume(from, id);
      for (var i = 1; i <= iterations; i++) {
        (function () {
          var change = self._volume + (dir === "up" ? 0.01 : -0.01) * i;
          var vol = Math.round(1E3 * change) / 1E3;
          var toVol = to;
          setTimeout(function () {
            self.volume(vol, id);
            if (vol === toVol) {
              if (callback) {
                callback();
              }
            }
          }, hold * i);
        })();
      }
    },
    fadeIn: function (to, len, callback) {
      return this.volume(0).play().fade(0, to, len, callback);
    },
    fadeOut: function (to, len, callback, id) {
      var self = this;
      return self.fade(self._volume, to, len, function () {
        if (callback) {
          callback();
        }
        self.pause(id);
        self.on("end");
      }, id);
    },
    _nodeById: function (timer) {
      var self = this;
      var node = self._audioNode[0];
      for (var i = 0; i < self._audioNode.length; i++) {
        if (self._audioNode[i].id === timer) {
          node = self._audioNode[i];
          break;
        }
      }
      return node;
    },
    _activeNode: function () {
      var self = this;
      var node = null;
      for (var i = 0; i < self._audioNode.length; i++) {
        if (!self._audioNode[i].paused) {
          node = self._audioNode[i];
          break;
        }
      }
      self._drainPool();
      return node;
    },
    _inactiveNode: function (callback) {
      var self = this;
      var node = null;
      for (var i = 0; i < self._audioNode.length; i++) {
        if (self._audioNode[i].paused && self._audioNode[i].readyState === 4) {
          callback(self._audioNode[i]);
          node = true;
          break;
        }
      }
      self._drainPool();
      if (node) {
        return;
      }
      var newNode;
      if (self._webAudio) {
        newNode = self._setupAudioNode();
        callback(newNode);
      } else {
        self.load();
        newNode = self._audioNode[self._audioNode.length - 1];
        newNode.addEventListener("loadedmetadata", function () {
          callback(newNode);
        });
      }
    },
    _drainPool: function () {
      var self = this;
      var inactive = 0;
      for (var i = 0; i < self._audioNode.length; i++) {
        if (self._audioNode[i].paused) {
          inactive++;
        }
      }
      for (var i = self._audioNode.length - 1; i >= 0; i--) {
        if (inactive <= 5) {
          break;
        }
        if (self._audioNode[i].paused) {
          if (self._webAudio) {
            self._audioNode[i].disconnect(0);
          }
          inactive--;
          self._audioNode.splice(i, 1);
        }
      }
    },
    _clearEndTimer: function (timerId) {
      var self = this;
      var timer = self._onendTimer.indexOf(timerId);
      timer = timer >= 0 ? timer : 0;
      if (self._onendTimer[timer]) {
        clearTimeout(self._onendTimer[timer]);
        self._onendTimer.splice(timer, 1);
      }
    },
    _setupAudioNode: function () {
      var self = this;
      var node = self._audioNode;
      var index = self._audioNode.length;
      node[index] = typeof ctx.createGain === "undefined" ? ctx.createGainNode() : ctx.createGain();
      node[index].gain.value = self._volume;
      node[index].paused = true;
      node[index]._pos = 0;
      node[index].readyState = 4;
      node[index].connect(masterGain);
      node[index].panner = ctx.createPanner();
      node[index].panner.setPosition(self._pos3d[0], self._pos3d[1], self._pos3d[2]);
      node[index].panner.connect(node[index]);
      return node[index];
    },
    on: function (event, fn) {
      var self = this;
      var events = self["_on" + event];
      if (typeof fn === "function") {
        events.push(fn);
      } else {
        for (var i = 0; i < events.length; i++) {
          if (fn) {
            events[i].call(self, fn);
          } else {
            events[i].call(self);
          }
        }
      }
      return self;
    },
    off: function (event, fn) {
      var self = this;
      var events = self["_on" + event];
      var fnString = fn.toString();
      for (var i = 0; i < events.length; i++) {
        if (fnString === events[i].toString()) {
          events.splice(i, 1);
          break;
        }
      }
      return self;
    },
    unload: function () {
      var self = this;
      var nodes = self._audioNode;
      for (var i = 0; i < self._audioNode.length; i++) {
        self.stop(nodes[i].id);
        if (!self._webAudio) {
          nodes[i].src = "";
        } else {
          nodes[i].disconnect(0);
        }
      }
      var index = Howler._howls.indexOf(self);
      if (index) {
        Howler._howls.splice(index, 1);
      }
      delete audioCache[self._src];
      self = null;
    }
  };

  if (useWebAudio) {
    /**
     * @param {(Object|null)} obj
     * @param {string} url
     * @return {undefined}
     */
    var loadBuffer = function (obj, url) {
      if (url in audioCache) {
        obj._duration = audioCache[url].duration;
        loadSound(obj);
      } else {
        /** @type {XMLHttpRequest} */
        var xhr = new XMLHttpRequest;
        xhr.open("GET", url, true);
        /** @type {string} */
        xhr.responseType = "arraybuffer";
        /**
         * @return {undefined}
         */
        xhr.onload = function () {
          audioContext.decodeAudioData(xhr.response, function (buffer) {
            if (buffer) {
              /** @type {Object} */
              audioCache[url] = buffer;
              loadSound(obj, buffer);
            }
          });
        };
        /**
         * @return {undefined}
         */
        xhr.onerror = function () {
          if (obj._webAudio) {
            obj._buffer = true;
            obj._webAudio = false;
            obj._audioNode = [];
            delete obj._gainNode;
            obj.load();
          }
        };
        try {
          xhr.send();
        } catch (e) {
          xhr.onerror();
        }
      }
    };
    /**
     * @param {(Object|null)} obj
     * @param {Object} buffer
     * @return {undefined}
     */
    var loadSound = function (obj, buffer) {
      obj._duration = buffer ? buffer.duration : obj._duration;
      if (Object.getOwnPropertyNames(obj._sprite).length === 0) {
        obj._sprite = {
          _default: [0, obj._duration * 1E3]
        };
      }
      if (!obj._loaded) {
        obj._loaded = true;
        obj.on("load");
      }
      if (obj._autoplay) {
        obj.play();
      }
    };
    /**
     * @param {(Object|null)} obj
     * @param {(Array|null)} loop
     * @param {string} id
     * @return {undefined}
     */
    var refreshBuffer = function (obj, loop, id) {
      var node = obj._nodeById(id);
      node.bufferSource = audioContext.createBufferSource();
      node.bufferSource.buffer = audioCache[obj._src];
      node.bufferSource.connect(node.panner);
      node.bufferSource.loop = loop[0];
      if (loop[0]) {
        node.bufferSource.loopStart = loop[1];
        node.bufferSource.loopEnd = loop[1] + loop[2];
      }
      node.bufferSource.playbackRate.value = obj._rate;
    };
  }
  // AMD支持
  if (typeof define === "function" && define.amd) {
    define(function () {
      return {
        Howler: Howler,
        Howl: Howl
      };
    });
  }
  window.Howler = Howler;
  window.Howl = Howl;
})();