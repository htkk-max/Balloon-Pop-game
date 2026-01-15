/**
 * Viewporter - Mobile viewport management library
 * Handles viewport adjustments for mobile devices to ensure proper display
 */

var viewporter;

(function() {
  var _viewporter;
  
  // Main viewporter object
  viewporter = {
    forceDetection: false,
    disableLegacyAndroid: true,
    
    /**
     * Check if viewporter should be active for current device
     * @return {boolean} - True if viewporter should be active
     */
    ACTIVE: function() {
      // Disable for legacy Android if configured
      if (viewporter.disableLegacyAndroid && /android 2/i.test(navigator.userAgent)) {
        return false;
      }
      
      // Disable for iPad
      if (/ipad/i.test(navigator.userAgent)) {
        return false;
      }
      
      // Enable for WebOS
      if (/webos/i.test(navigator.userAgent)) {
        return true;
      }
      
      // Enable for touch devices
      if ("ontouchstart" in window) {
        return true;
      }
      
      return false;
    },
    
    READY: false,
    
    /**
     * Check if device is in landscape orientation
     * @return {boolean} - True if in landscape orientation
     */
    isLandscape: function() {
      return window.orientation === 90 || window.orientation === -90;
    },
    
    /**
     * Register a callback for when viewport is ready
     * @param {Function} callback - Callback function
     */
    ready: function(callback) {
      window.addEventListener("viewportready", callback, false);
    },
    
    /**
     * Register a callback for viewport changes
     * @param {Function} callback - Callback function
     */
    change: function(callback) {
      window.addEventListener("viewportchange", callback, false);
    },
    
    /**
     * Refresh the viewport
     */
    refresh: function() {
      if (_viewporter) {
        _viewporter.prepareVisualViewport();
      }
    },
    
    /**
     * Prevent page scrolling on touch devices
     */
    preventPageScroll: function() {
      document.body.addEventListener("touchmove", function(event) {
        event.preventDefault();
      }, false);
      
      document.body.addEventListener("touchstart", function() {
        _viewporter.prepareVisualViewport();
      }, false);
    }
  };
  
  // Initialize viewporter active state
  viewporter.ACTIVE = viewporter.ACTIVE();
  
  // Exit if viewporter is not active
  if (!viewporter.ACTIVE) {
    return;
  }
  
  /**
   * Viewporter class for managing viewport adjustments
   */
  var _Viewporter = function() {
    var that = this;
    
    // Check if device is Android (non-Chrome)
    this.IS_ANDROID = /Android/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    /**
     * Initialize viewporter when DOM is ready
     */
    var _onReady = function() {
      that.prepareVisualViewport();
      
      var orientation = window.orientation;
      
      // Handle orientation changes
      window.addEventListener("orientationchange", function() {
        if (window.orientation !== orientation) {
          that.prepareVisualViewport();
          orientation = window.orientation;
        }
      }, false);
    };
    
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function() {
        _onReady();
      }, false);
    } else {
      _onReady();
    }
  };
  
  _Viewporter.prototype = {
    /**
     * Get device profile if available
     * @return {Object|null} - Device profile or null
     */
    getProfile: function() {
      if (viewporter.forceDetection) {
        return null;
      }
      
      var searchTerm;
      for (searchTerm in viewporter.profiles) {
        if ((new RegExp(searchTerm)).test(navigator.userAgent)) {
          return viewporter.profiles[searchTerm];
        }
      }
      
      return null;
    },
    
    /**
     * Post-process after viewport is ready
     */
    postProcess: function() {
      viewporter.READY = true;
      
      // Trigger appropriate event based on whether this is first update
      this.triggerWindowEvent(!this._firstUpdateExecuted ? "viewportready" : "viewportchange");
      this._firstUpdateExecuted = true;
    },
    
    /**
     * Prepare and adjust the visual viewport
     */
    prepareVisualViewport: function() {
      var that = this;
      
      // Skip for standalone apps (e.g., iOS home screen apps)
      if (navigator.standalone) {
        return this.postProcess();
      }
      
      // Set minimum height to trigger viewport adjustment
      document.documentElement.style.minHeight = "5000px";
      
      var startHeight = window.innerHeight;
      var deviceProfile = this.getProfile();
      var orientation = viewporter.isLandscape() ? "landscape" : "portrait";
      
      // Scroll to trigger viewport adjustment
      window.scrollTo(0, that.IS_ANDROID ? 1 : 0);
      
      var iterations = 40;
      
      // Set up interval to check for viewport adjustment
      var scrollIntervalId = window.setInterval(function() {
        /**
         * Check if Android device matches profile
         * @return {boolean}
         */
        function androidProfileCheck() {
          return deviceProfile ? window.innerHeight === deviceProfile[orientation] : false;
        }
        
        /**
         * Check if iOS inner height has changed
         * @return {boolean}
         */
        function iosInnerHeightCheck() {
          return window.innerHeight > startHeight;
        }
        
        // Scroll to trigger viewport adjustment
        window.scrollTo(0, that.IS_ANDROID ? 1 : 0);
        iterations--;
        
        // Check if viewport has adjusted or we've exceeded iterations
        if ((that.IS_ANDROID ? androidProfileCheck() : iosInnerHeightCheck()) || iterations < 0) {
          // Set document height to viewport height
          document.documentElement.style.minHeight = window.innerHeight + "px";
          
          // Position viewporter element
          var viewporterElement = document.getElementById("viewporter");
          if (viewporterElement) {
            viewporterElement.style.position = "relative";
            viewporterElement.style.height = window.innerHeight + "px";
          }
          
          // Clean up and post-process
          clearInterval(scrollIntervalId);
          that.postProcess();
        }
      }, 10);
    },
    
    /**
     * Trigger a custom window event
     * @param {string} name - Event name
     */
    triggerWindowEvent: function(name) {
      var event = document.createEvent("Event");
      event.initEvent(name, false, false);
      window.dispatchEvent(event);
    }
  };
  
  // Create viewporter instance
  _viewporter = new _Viewporter();
})();

// Device profiles for viewport adjustment
viewporter.profiles = {
  "MZ601": {
    portrait: 696,
    landscape: 1176
  },
  "GT-I9000|GT-I9100|Nexus S": {
    portrait: 508,
    landscape: 295
  },
  "GT-P1000": {
    portrait: 657,
    landscape: 400
  },
  "Desire_A8181|DesireHD_A9191": {
    portrait: 533,
    landscape: 320
  }
};

