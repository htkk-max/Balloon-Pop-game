// Howler.js - Audio Library
// Refactored for better readability and maintainability

(function() {
  // Cache for storing loaded audio buffers
  var cache = {};
  
  // Audio context
  var ctx = null;
  
  // Flag indicating if Web Audio API is available and being used
  var usingWebAudio = true;
  
  // Flag indicating if no audio support is available
  var noAudio = false;
  
  // Initialize audio context
  function initAudioContext() {
    if (typeof AudioContext !== "undefined") {
      ctx = new AudioContext();
    } else if (typeof webkitAudioContext !== "undefined") {
      ctx = new webkitAudioContext();
    } else if (typeof Audio !== "undefined") {
      usingWebAudio = false;
      try {
        new Audio();
      } catch (e) {
        noAudio = true;
      }
    } else {
      usingWebAudio = false;
      noAudio = true;
    }
  }
  
  // Initialize the audio context
  initAudioContext();
  
  // Master gain node for Web Audio API
  var masterGain = null;
  
  if (usingWebAudio) {
    // Create gain node with compatibility for older browsers
    masterGain = typeof ctx.createGain === "undefined" ? 
      ctx.createGainNode() : ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  }
  /**
   * HowlerGlobal class - Global audio control
   */
  var HowlerGlobal = function() {
    this._volume = 1;
    this._muted = false;
    this.usingWebAudio = usingWebAudio;
    this._howls = [];
  };
  
  HowlerGlobal.prototype = {
    /**
     * Get or set the global volume
     * @param {number} vol - Volume value between 0 and 1
     * @return {number|HowlerGlobal} - Volume value if getter, this if setter
     */
    volume: function(vol) {
      var self = this;
      vol = parseFloat(vol);
      
      // Set volume if a valid value is provided
      if (!isNaN(vol) && vol >= 0 && vol <= 1) {
        self._volume = vol;
        
        // Update Web Audio master gain
        if (usingWebAudio) {
          masterGain.gain.value = vol;
        }
        
        // Update HTML5 audio elements
        for (var key in self._howls) {
          if (self._howls.hasOwnProperty(key) && !self._howls[key]._webAudio) {
            var howl = self._howls[key];
            for (var i = 0; i < howl._audioNode.length; i++) {
              howl._audioNode[i].volume = howl._volume * self._volume;
            }
          }
        }
        
        return self;
      }
      
      // Return current volume
      return usingWebAudio ? masterGain.gain.value : self._volume;
    },
    
    /**
     * Mute all sounds
     * @return {HowlerGlobal} - Returns this for method chaining
     */
    mute: function() {
      this._setMuted(true);
      return this;
    },
    
    /**
     * Unmute all sounds
     * @return {HowlerGlobal} - Returns this for method chaining
     */
    unmute: function() {
      this._setMuted(false);
      return this;
    },
    
    /**
     * Internal method to set muted state
     * @param {boolean} muted - Whether to mute or unmute
     */
    _setMuted: function(muted) {
      var self = this;
      self._muted = muted;
      
      // Update Web Audio master gain
      if (usingWebAudio) {
        masterGain.gain.value = muted ? 0 : self._volume;
      }
      
      // Update HTML5 audio elements
      for (var key in self._howls) {
        if (self._howls.hasOwnProperty(key) && !self._howls[key]._webAudio) {
          var howl = self._howls[key];
          for (var i = 0; i < howl._audioNode.length; i++) {
            howl._audioNode[i].muted = muted;
          }
        }
      }
    }
  };
  
  // Create global Howler instance
  var Howler = new HowlerGlobal();
  // Test element for checking codec support
  var audioTest = null;
  
  // Object to store codec support information
  var codecs = {};
  
  // Check codec support if audio is available
  if (!noAudio) {
    audioTest = new Audio();
    
    // Function to check if a codec is supported
    function checkCodec(codec) {
      var support = audioTest.canPlayType(codec);
      return support !== "" && support !== "no";
    }
    
    // Check support for various codecs
    codecs = {
      mp3: checkCodec("audio/mpeg;"),
      opus: checkCodec('audio/ogg; codecs="opus"'),
      ogg: checkCodec('audio/ogg; codecs="vorbis"'),
      wav: checkCodec('audio/wav; codecs="1"'),
      m4a: checkCodec("audio/x-m4a;") || checkCodec("audio/aac;"),
      webm: checkCodec('audio/webm; codecs="vorbis"')
    };
  }
  /**
   * Howl class - Individual sound control
   * @param {Object} options - Sound configuration options
   */
  var Howl = function(options) {
    var self = this;
    
    // Initialize properties from options
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
    
    // Initialize event callbacks
    self._onload = [options.onload || function() {}];
    self._onloaderror = [options.onloaderror || function() {}];
    self._onend = [options.onend || function() {}];
    self._onpause = [options.onpause || function() {}];
    self._onplay = [options.onplay || function() {}];
    self._onendTimer = [];
    
    // Determine if using Web Audio API
    self._webAudio = usingWebAudio && !self._buffer;
    self._audioNode = [];
    
    // Setup audio node if using Web Audio API
    if (self._webAudio) {
      self._setupAudioNode();
    }
    
    // Add to global Howler list and load the sound
    Howler._howls.push(self);
    self.load();
  };
  Howl.prototype = {
    /**
     * Load the audio file
     * @return {Howl} - Returns this for method chaining
     */
    load: function() {
      var self = this;
      var url = null;
      
      // Check if audio is available
      if (noAudio) {
        self.on("loaderror");
        return self;
      }
      
      // Map of supported codecs
      var canPlay = {
        mp3: codecs.mp3,
        opus: codecs.opus,
        ogg: codecs.ogg,
        wav: codecs.wav,
        m4a: codecs.m4a,
        weba: codecs.webm
      };
      
      // Find a playable URL from the list
      for (var i = 0; i < self._urls.length; i++) {
        var ext;
        
        // Use specified format or extract from URL
        if (self._format) {
          ext = self._format;
        } else {
          var match = self._urls[i].toLowerCase().match(/.+\.([^?]+)(\?|$)/);
          ext = match && match.length >= 2 ? match[1] : 
                self._urls[i].toLowerCase().match(/data\:audio\/([^?]+);/)[1];
        }
        
        // Check if this codec is supported
        if (canPlay[ext]) {
          url = self._urls[i];
          break;
        }
      }
      
      // No playable URL found
      if (!url) {
        self.on("loaderror");
        return self;
      }
      
      self._src = url;
      
      // Load using appropriate method
      if (self._webAudio) {
        loadBuffer(self, url);
      } else {
        // HTML5 Audio loading
        var newNode = new Audio();
        self._audioNode.push(newNode);
        newNode.src = url;
        newNode._pos = 0;
        newNode.preload = "auto";
        newNode.volume = Howler._muted ? 0 : self._volume * Howler.volume();
        cache[url] = self;
        
        // Event listener for when audio is ready to play
        var listener = function() {
          self._duration = newNode.duration;
          
          // Set default sprite if none defined
          if (Object.getOwnPropertyNames(self._sprite).length === 0) {
            self._sprite = {
              _default: [0, self._duration * 1000]
            };
          }
          
          // Mark as loaded and trigger event
          if (!self._loaded) {
            self._loaded = true;
            self.on("load");
          }
          
          // Autoplay if requested
          if (self._autoplay) {
            self.play();
          }
          
          // Clean up event listener
          newNode.removeEventListener("canplaythrough", listener, false);
        };
        
        newNode.addEventListener("canplaythrough", listener, false);
        newNode.load();
      }
      
      return self;
    },
    /**
     * Get or set the URLs for this sound
     * @param {Array|string} urls - URLs to set (optional)
     * @return {Array|Howl} - URLs if getter, this if setter
     */
    urls: function(urls) {
      var self = this;
      
      // Set new URLs if provided
      if (urls) {
        self.stop();
        self._urls = typeof urls === "string" ? [urls] : urls;
        self._loaded = false;
        self.load();
        return self;
      }
      
      // Return current URLs
      return self._urls;
    },
    
    /**
     * Play a sound or sprite
     * @param {string} sprite - Sprite to play (optional)
     * @param {Function} callback - Callback function (optional)
     * @return {Howl} - Returns this for method chaining
     */
    play: function(sprite, callback) {
      var self = this;
      
      // Handle case where sprite is omitted and callback is provided as first argument
      if (typeof sprite === "function") {
        callback = sprite;
      }
      
      // Default to "_default" sprite if none specified
      if (!sprite || typeof sprite === "function") {
        sprite = "_default";
      }
      
      // Wait for sound to load if not loaded yet
      if (!self._loaded) {
        self.on("load", function() {
          self.play(sprite, callback);
        });
        return self;
      }
      
      // Check if sprite exists
      if (!self._sprite[sprite]) {
        if (typeof callback === "function") {
          callback();
        }
        return self;
      }
      
      // Get an inactive node to play the sound
      self._inactiveNode(function(node) {
        node._sprite = sprite;
        
        // Calculate position and duration
        var pos = node._pos > 0 ? node._pos : self._sprite[sprite][0] / 1000;
        var duration = self._sprite[sprite][1] / 1000 - node._pos;
        
        // Determine if sound should loop
        var loop = !!(self._loop || self._sprite[sprite][2]);
        
        // Generate unique sound ID
        var soundId = typeof callback === "string" ? 
                      callback : 
                      Math.round(Date.now() * Math.random()).toString();
        
        var timerId;
        
        // Set up end timer for the sound
        (function() {
          var data = {
            id: soundId,
            sprite: sprite,
            loop: loop
          };
          
          timerId = setTimeout(function() {
            if (!self._webAudio && loop) {
              // Loop for HTML5 audio
              self.stop(data.id, data.timer).play(sprite, data.id);
            }
            
            if (self._webAudio && !loop) {
              // Pause Web Audio node when done
              self._nodeById(data.id).paused = true;
            }
            
            if (!self._webAudio && !loop) {
              // Stop HTML5 audio when done
              self.stop(data.id, data.timer);
            }
            
            // Trigger end event
            self.on("end", soundId);
          }, duration * 1000);
          
          self._onendTimer.push(timerId);
          data.timer = self._onendTimer[self._onendTimer.length - 1];
        })();
        
        // Play using appropriate method
        if (self._webAudio) {
          // Web Audio API playback
          var loopStart = self._sprite[sprite][0] / 1000;
          var loopEnd = self._sprite[sprite][1] / 1000;
          
          node.id = soundId;
          node.paused = false;
          refreshBuffer(self, [loop, loopStart, loopEnd], soundId);
          self._playStart = ctx.currentTime;
          node.gain.value = self._volume;
          
          // Use appropriate method based on browser support
          if (typeof node.bufferSource.start === "undefined") {
            node.bufferSource.noteGrainOn(0, pos, duration);
          } else {
            node.bufferSource.start(0, pos, duration);
          }
        } else {
          // HTML5 Audio playback
          if (node.readyState === 4) {
            // Node is ready to play
            node.id = soundId;
            node.currentTime = pos;
            node.muted = Howler._muted;
            node.volume = self._volume * Howler.volume();
            
            setTimeout(function() {
              node.play();
            }, 0);
          } else {
            // Node is not ready yet, wait for it
            self._clearEndTimer(timerId);
            
            (function() {
              var sound = self;
              var playSprite = sprite;
              var fn = callback;
              var newNode = node;
              
              var completed = function() {
                sound.play(playSprite, fn);
                newNode.removeEventListener("canplaythrough", completed, false);
              };
              
              newNode.addEventListener("canplaythrough", completed, false);
            })();
            
            return self;
          }
        }
        
        // Trigger play event
        self.on("play");
        
        // Call callback if provided
        if (typeof callback === "function") {
          callback(soundId);
        }
        
        return self;
      });
      
      return self;
    },
    /**
     * Pause playback
     * @param {string} id - Sound ID to pause (optional)
     * @param {string} timerId - Timer ID to clear (optional)
     * @return {Howl} - Returns this for method chaining
     */
    pause: function(id, timerId) {
      var self = this;
      
      // Wait for sound to load if not loaded yet
      if (!self._loaded) {
        self.on("play", function() {
          self.pause(id);
        });
        return self;
      }
      
      // Clear end timer
      self._clearEndTimer(timerId || 0);
      
      // Get the active node or the node with the specified ID
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      
      if (activeNode) {
        // Save current position
        activeNode._pos = self.pos(null, id);
        
        if (self._webAudio) {
          // Web Audio API pause
          if (!activeNode.bufferSource) {
            return self;
          }
          
          activeNode.paused = true;
          
          // Use appropriate method based on browser support
          if (typeof activeNode.bufferSource.stop === "undefined") {
            activeNode.bufferSource.noteOff(0);
          } else {
            activeNode.bufferSource.stop(0);
          }
        } else {
          // HTML5 Audio pause
          activeNode.pause();
        }
      }
      
      // Trigger pause event
      self.on("pause");
      
      return self;
    },
    
    /**
     * Stop playback
     * @param {string} id - Sound ID to stop (optional)
     * @param {string} timerId - Timer ID to clear (optional)
     * @return {Howl} - Returns this for method chaining
     */
    stop: function(id, timerId) {
      var self = this;
      
      // Wait for sound to load if not loaded yet
      if (!self._loaded) {
        self.on("play", function() {
          self.stop(id);
        });
        return self;
      }
      
      // Clear end timer
      self._clearEndTimer(timerId || 0);
      
      // Get the active node or the node with the specified ID
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      
      if (activeNode) {
        // Reset position
        activeNode._pos = 0;
        
        if (self._webAudio) {
          // Web Audio API stop
          if (!activeNode.bufferSource) {
            return self;
          }
          
          activeNode.paused = true;
          
          // Use appropriate method based on browser support
          if (typeof activeNode.bufferSource.stop === "undefined") {
            activeNode.bufferSource.noteOff(0);
          } else {
            activeNode.bufferSource.stop(0);
          }
        } else {
          // HTML5 Audio stop
          activeNode.pause();
          activeNode.currentTime = 0;
        }
      }
      
      return self;
    },
    /**
     * Mute this sound
     * @param {string} id - Sound ID to mute (optional)
     * @return {Howl} - Returns this for method chaining
     */
    mute: function(id) {
      var self = this;
      
      // Wait for sound to load if not loaded yet
      if (!self._loaded) {
        self.on("play", function() {
          self.mute(id);
        });
        return self;
      }
      
      // Get the active node or the node with the specified ID
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      
      if (activeNode) {
        if (self._webAudio) {
          // Mute Web Audio node
          activeNode.gain.value = 0;
        } else {
          // Mute HTML5 Audio element
          activeNode.volume = 0;
        }
      }
      
      return self;
    },
    
    /**
     * Unmute this sound
     * @param {string} id - Sound ID to unmute (optional)
     * @return {Howl} - Returns this for method chaining
     */
    unmute: function(id) {
      var self = this;
      
      // Wait for sound to load if not loaded yet
      if (!self._loaded) {
        self.on("play", function() {
          self.unmute(id);
        });
        return self;
      }
      
      // Get the active node or the node with the specified ID
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      
      if (activeNode) {
        if (self._webAudio) {
          // Unmute Web Audio node
          activeNode.gain.value = self._volume;
        } else {
          // Unmute HTML5 Audio element
          activeNode.volume = self._volume;
        }
      }
      
      return self;
    },
    
    /**
     * Get or set the volume for this sound
     * @param {number} vol - Volume value between 0 and 1 (optional)
     * @param {string} id - Sound ID to set volume for (optional)
     * @return {number|Howl} - Volume value if getter, this if setter
     */
    volume: function(vol, id) {
      var self = this;
      vol = parseFloat(vol);
      
      // Set volume if a valid value is provided
      if (!isNaN(vol) && vol >= 0 && vol <= 1) {
        self._volume = vol;
        
        // Wait for sound to load if not loaded yet
        if (!self._loaded) {
          self.on("play", function() {
            self.volume(vol, id);
          });
          return self;
        }
        
        // Get the active node or the node with the specified ID
        var activeNode = id ? self._nodeById(id) : self._activeNode();
        
        if (activeNode) {
          if (self._webAudio) {
            // Set Web Audio node volume
            activeNode.gain.value = vol;
          } else {
            // Set HTML5 Audio element volume
            activeNode.volume = vol * Howler.volume();
          }
        }
        
        return self;
      }
      
      // Return current volume
      return self._volume;
    },
    /**
     * Get or set the loop state
     * @param {boolean} loop - Loop state (optional)
     * @return {boolean|Howl} - Loop state if getter, this if setter
     */
    loop: function(loop) {
      var self = this;
      
      if (typeof loop === "boolean") {
        self._loop = loop;
        return self;
      }
      
      return self._loop;
    },
    
    /**
     * Get or set the sprite definitions
     * @param {Object} sprite - Sprite definitions (optional)
     * @return {Object|Howl} - Sprite definitions if getter, this if setter
     */
    sprite: function(sprite) {
      var self = this;
      
      if (typeof sprite === "object") {
        self._sprite = sprite;
        return self;
      }
      
      return self._sprite;
    },
    
    /**
     * Get or set the current position of playback
     * @param {number} pos - Position in seconds (optional)
     * @param {string} id - Sound ID (optional)
     * @return {number|Howl} - Position if getter, this if setter
     */
    pos: function(pos, id) {
      var self = this;
      
      // Wait for sound to load if not loaded yet
      if (!self._loaded) {
        self.on("load", function() {
          self.pos(pos);
        });
        return typeof pos === "number" ? self : self._pos || 0;
      }
      
      pos = parseFloat(pos);
      var activeNode = id ? self._nodeById(id) : self._activeNode();
      
      if (activeNode) {
        if (self._webAudio) {
          // Web Audio API position handling
          if (pos >= 0) {
            activeNode._pos = pos;
            self.pause(id).play(activeNode._sprite, id);
            return self;
          } else {
            return activeNode._pos + (ctx.currentTime - self._playStart);
          }
        } else {
          // HTML5 Audio position handling
          if (pos >= 0) {
            activeNode.currentTime = pos;
            return self;
          } else {
            return activeNode.currentTime;
          }
        }
      } else {
        // No active node found
        if (pos >= 0) {
          return self;
        } else {
          // Find a paused node and return its position
          for (var i = 0; i < self._audioNode.length; i++) {
            if (self._audioNode[i].paused && self._audioNode[i].readyState === 4) {
              return self._webAudio ? self._audioNode[i]._pos : self._audioNode[i].currentTime;
            }
          }
        }
      }
    },
    
    /**
     * Get or set the 3D spatial position of the sound
     * @param {number} x - X coordinate (optional)
     * @param {number} y - Y coordinate (optional)
     * @param {number} z - Z coordinate (optional)
     * @param {string} id - Sound ID (optional)
     * @return {Array|Howl} - Position array if getter, this if setter
     */
    pos3d: function(x, y, z, id) {
      var self = this;
      
      // Default values for y and z if not provided
      y = typeof y === "undefined" || !y ? 0 : y;
      z = typeof z === "undefined" || !z ? -0.5 : z;
      
      // Wait for sound to load if not loaded yet
      if (!self._loaded) {
        self.on("play", function() {
          self.pos3d(x, y, z, id);
        });
        return self;
      }
      
      if (x >= 0 || x < 0) {
        // Set position
        if (self._webAudio) {
          var activeNode = id ? self._nodeById(id) : self._activeNode();
          
          if (activeNode) {
            self._pos3d = [x, y, z];
            activeNode.panner.setPosition(x, y, z);
          }
        }
      } else {
        // Get position
        return self._pos3d;
      }
      
      return self;
    },
    /**
     * Fade the volume of this sound
     * @param {number} from - Starting volume
     * @param {number} to - Ending volume
     * @param {number} len - Duration of fade in milliseconds
     * @param {Function} callback - Callback function (optional)
     * @param {string} id - Sound ID (optional)
     * @return {Howl} - Returns this for method chaining
     */
    fade: function(from, to, len, callback, id) {
      var self = this;
      
      // Calculate fade parameters
      var dist = Math.abs(from - to);
      var dir = from > to ? "down" : "up";
      var iterations = dist / 0.01;
      var hold = len / iterations;
      
      // Wait for sound to load if not loaded yet
      if (!self._loaded) {
        self.on("load", function() {
          self.fade(from, to, len, callback, id);
        });
        return self;
      }
      
      // Set initial volume
      self.volume(from, id);
      
      // Execute fade
      for (var i = 1; i <= iterations; i++) {
        (function() {
          var change = self._volume + (dir === "up" ? 0.01 : -0.01) * i;
          var vol = Math.round(1000 * change) / 1000;
          var toVol = to;
          
          setTimeout(function() {
            self.volume(vol, id);
            
            // Call callback when fade is complete
            if (vol === toVol && callback) {
              callback();
            }
          }, hold * i);
        })();
      }
      
      return self;
    },
    
    /**
     * Fade in this sound
     * @param {number} to - Target volume
     * @param {number} len - Duration of fade in milliseconds
     * @param {Function} callback - Callback function (optional)
     * @return {Howl} - Returns this for method chaining
     */
    fadeIn: function(to, len, callback) {
      return this.volume(0).play().fade(0, to, len, callback);
    },
    
    /**
     * Fade out this sound
     * @param {number} to - Target volume
     * @param {number} len - Duration of fade in milliseconds
     * @param {Function} callback - Callback function (optional)
     * @param {string} id - Sound ID (optional)
     * @return {Howl} - Returns this for method chaining
     */
    fadeOut: function(to, len, callback, id) {
      var self = this;
      
      return self.fade(self._volume, to, len, function() {
        if (callback) {
          callback();
        }
        
        // Pause sound and trigger end event after fade out
        self.pause(id);
        self.on("end");
      }, id);
    },
    /**
     * Find a node by its ID
     * @param {string} timer - Node ID to find
     * @return {Object} - Audio node with the specified ID
     */
    _nodeById: function(timer) {
      var self = this;
      var node = self._audioNode[0];
      
      // Search for node with matching ID
      for (var i = 0; i < self._audioNode.length; i++) {
        if (self._audioNode[i].id === timer) {
          node = self._audioNode[i];
          break;
        }
      }
      
      return node;
    },
    
    /**
     * Find the currently active (playing) node
     * @return {Object|null} - Active audio node or null if none found
     */
    _activeNode: function() {
      var self = this;
      var node = null;
      
      // Search for a node that is not paused
      for (var i = 0; i < self._audioNode.length; i++) {
        if (!self._audioNode[i].paused) {
          node = self._audioNode[i];
          break;
        }
      }
      
      // Clean up unused nodes
      self._drainPool();
      
      return node;
    },
    
    /**
     * Get an inactive node or create a new one
     * @param {Function} callback - Callback function to receive the node
     */
    _inactiveNode: function(callback) {
      var self = this;
      var node = null;
      
      // Try to find an existing inactive node
      for (var i = 0; i < self._audioNode.length; i++) {
        if (self._audioNode[i].paused && self._audioNode[i].readyState === 4) {
          callback(self._audioNode[i]);
          node = true;
          break;
        }
      }
      
      // Clean up unused nodes
      self._drainPool();
      
      // If we found an inactive node, we're done
      if (node) {
        return;
      }
      
      // Otherwise, create a new node
      var newNode;
      if (self._webAudio) {
        // Create a new Web Audio node
        newNode = self._setupAudioNode();
        callback(newNode);
      } else {
        // Load the audio and use the new node
        self.load();
        newNode = self._audioNode[self._audioNode.length - 1];
        newNode.addEventListener("loadedmetadata", function() {
          callback(newNode);
        });
      }
    },
    
    /**
     * Remove inactive nodes from the pool (keep at most 5)
     */
    _drainPool: function() {
      var self = this;
      var inactive = 0;
      var i;
      
      // Count inactive nodes
      for (i = 0; i < self._audioNode.length; i++) {
        if (self._audioNode[i].paused) {
          inactive++;
        }
      }
      
      // Remove inactive nodes until we have at most 5
      for (i = self._audioNode.length - 1; i >= 0; i--) {
        if (inactive <= 5) {
          break;
        }
        
        if (self._audioNode[i].paused) {
          // Disconnect Web Audio node if applicable
          if (self._webAudio) {
            self._audioNode[i].disconnect(0);
          }
          
          inactive--;
          self._audioNode.splice(i, 1);
        }
      }
    },
    
    /**
     * Clear an end timer
     * @param {number} timerId - Timer ID to clear
     */
    _clearEndTimer: function(timerId) {
      var self = this;
      var timer = self._onendTimer.indexOf(timerId);
      timer = timer >= 0 ? timer : 0;
      
      if (self._onendTimer[timer]) {
        clearTimeout(self._onendTimer[timer]);
        self._onendTimer.splice(timer, 1);
      }
    },
    
    /**
     * Set up a new Web Audio node
     * @return {Object} - New audio node
     */
    _setupAudioNode: function() {
      var self = this;
      var node = self._audioNode;
      var index = self._audioNode.length;
      
      // Create gain node with compatibility for older browsers
      node[index] = typeof ctx.createGain === "undefined" ? 
                   ctx.createGainNode() : ctx.createGain();
      node[index].gain.value = self._volume;
      node[index].paused = true;
      node[index]._pos = 0;
      node[index].readyState = 4;
      node[index].connect(masterGain);
      
      // Create and set up panner for 3D spatial audio
      node[index].panner = ctx.createPanner();
      node[index].panner.setPosition(self._pos3d[0], self._pos3d[1], self._pos3d[2]);
      node[index].panner.connect(node[index]);
      
      return node[index];
    },
    /**
     * Add an event listener or trigger an event
     * @param {string} event - Event name
     * @param {Function} fn - Callback function (optional)
     * @return {Howl} - Returns this for method chaining
     */
    on: function(event, fn) {
      var self = this;
      var events = self["_on" + event];
      
      // Add event listener if function is provided
      if (typeof fn === "function") {
        events.push(fn);
      } else {
        // Trigger event with optional parameter
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
    
    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} fn - Callback function to remove
     * @return {Howl} - Returns this for method chaining
     */
    off: function(event, fn) {
      var self = this;
      var events = self["_on" + event];
      var fnString = fn.toString();
      
      // Find and remove the event listener
      for (var i = 0; i < events.length; i++) {
        if (fnString === events[i].toString()) {
          events.splice(i, 1);
          break;
        }
      }
      
      return self;
    },
    
    /**
     * Unload and destroy this sound
     */
    unload: function() {
      var self = this;
      var nodes = self._audioNode;
      
      // Stop and clean up all audio nodes
      for (var i = 0; i < self._audioNode.length; i++) {
        self.stop(nodes[i].id);
        
        if (!self._webAudio) {
          // Clean up HTML5 Audio element
          nodes[i].src = "";
        } else {
          // Disconnect Web Audio node
          nodes[i].disconnect(0);
        }
      }
      
      // Remove from global Howler list
      var index = Howler._howls.indexOf(self);
      if (index >= 0) {
        Howler._howls.splice(index, 1);
      }
      
      // Remove from cache
      delete cache[self._src];
      
      // Nullify reference
      self = null;
    }
  };
  // Web Audio API helper functions
  if (usingWebAudio) {
    /**
     * Load an audio buffer from a URL
     * @param {Howl} obj - Howl object to load buffer for
     * @param {string} url - URL to load audio from
     */
    var loadBuffer = function(obj, url) {
      // Check if buffer is already cached
      if (url in cache) {
        obj._duration = cache[url].duration;
        loadSound(obj);
        return;
      }
      
      // Load audio file via XHR
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      
      // Handle successful load
      xhr.onload = function() {
        ctx.decodeAudioData(xhr.response, function(buffer) {
          if (buffer) {
            cache[url] = buffer;
            loadSound(obj, buffer);
          }
        });
      };
      
      // Handle load error
      xhr.onerror = function() {
        if (obj._webAudio) {
          // Fall back to HTML5 Audio
          obj._buffer = true;
          obj._webAudio = false;
          obj._audioNode = [];
          delete obj._gainNode;
          obj.load();
        }
      };
      
      // Send request
      try {
        xhr.send();
      } catch (e) {
        xhr.onerror();
      }
    };
    
    /**
     * Process loaded audio buffer
     * @param {Howl} obj - Howl object to process buffer for
     * @param {AudioBuffer} buffer - Audio buffer to process
     */
    var loadSound = function(obj, buffer) {
      obj._duration = buffer ? buffer.duration : obj._duration;
      
      // Set default sprite if none defined
      if (Object.getOwnPropertyNames(obj._sprite).length === 0) {
        obj._sprite = {
          _default: [0, obj._duration * 1000]
        };
      }
      
      // Mark as loaded and trigger event
      if (!obj._loaded) {
        obj._loaded = true;
        obj.on("load");
      }
      
      // Autoplay if requested
      if (obj._autoplay) {
        obj.play();
      }
    };
    
    /**
     * Refresh the audio buffer for a node
     * @param {Howl} obj - Howl object to refresh buffer for
     * @param {Array} loop - Loop parameters [isLooping, loopStart, loopEnd]
     * @param {string} id - Sound ID
     */
    var refreshBuffer = function(obj, loop, id) {
      var node = obj._nodeById(id);
      
      // Create new buffer source
      node.bufferSource = ctx.createBufferSource();
      node.bufferSource.buffer = cache[obj._src];
      node.bufferSource.connect(node.panner);
      
      // Set loop parameters
      node.bufferSource.loop = loop[0];
      if (loop[0]) {
        node.bufferSource.loopStart = loop[1];
        node.bufferSource.loopEnd = loop[1] + loop[2];
      }
      
      // Set playback rate
      node.bufferSource.playbackRate.value = obj._rate;
    };
  }
  // AMD module support
  if (typeof define === "function" && define.amd) {
    define(function() {
      return {
        Howler: Howler,
        Howl: Howl
      };
    });
  }
  
  // Global export
  window.Howler = Howler;
  window.Howl = Howl;
})();

