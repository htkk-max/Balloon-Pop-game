var viewporter;
(function () {
  var _viewporterInstance;

  viewporter = {
    forceDetection: false,
    disableLegacyAndroid: true,
    ACTIVE: function () {
      if (viewporter.disableLegacyAndroid && /android 2/i.test(navigator.userAgent)) {
        return false;
      }
      if (/ipad/i.test(navigator.userAgent)) {
        return false;
      }
      if (/webos/i.test(navigator.userAgent)) {
        return true;
      }
      if ("ontouchstart" in window) {
        return true;
      }
      return false;
    },
    READY: false,
    isLandscape: function () {
      return window.orientation === 90 || window.orientation === -90;
    },
    ready: function (callback) {
      window.addEventListener("viewportready", callback, false);
    },
    change: function (callback) {
      window.addEventListener("viewportchange", callback, false);
    },
    refresh: function () {
      if (_viewporterInstance) {
        _viewporterInstance.prepareVisualViewport();
      }
    },
    preventPageScroll: function () {
      document.body.addEventListener("touchmove", function (event) {
        event.preventDefault();
      }, false);
      document.body.addEventListener("touchstart", function () {
        _viewporterInstance.prepareVisualViewport();
      }, false);
    }
  };

  viewporter.ACTIVE = viewporter.ACTIVE();

  if (!viewporter.ACTIVE) {
    return;
  }

  function Viewporter() {
    var self = this;
    this.IS_ANDROID = /Android/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

    function onReady() {
      self.prepareVisualViewport();
      var orientation = window.orientation;
      window.addEventListener("orientationchange", function () {
        if (window.orientation !== orientation) {
          self.prepareVisualViewport();
          orientation = window.orientation;
        }
      }, false);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady, false);
    } else {
      onReady();
    }
  }

  Viewporter.prototype = {
    getProfile: function () {
      if (viewporter.forceDetection) {
        return null;
      }
      for (var key in viewporter.profiles) {
        if ((new RegExp(key)).test(navigator.userAgent)) {
          return viewporter.profiles[key];
        }
      }
      return null;
    },
    postProcess: function () {
      viewporter.READY = true;
      this.triggerWindowEvent(!this._firstUpdateExecuted ? "viewportready" : "viewportchange");
      this._firstUpdateExecuted = true;
    },
    prepareVisualViewport: function () {
      var self = this;
      if (navigator.standalone) {
        return this.postProcess();
      }
      document.documentElement.style.minHeight = "5000px";
      var startHeight = window.innerHeight;
      var deviceProfile = this.getProfile();
      var orientation = viewporter.isLandscape() ? "landscape" : "portrait";
      window.scrollTo(0, self.IS_ANDROID ? 1 : 0);
      var iterations = 40;
      var scrollIntervalId = window.setInterval(function () {
        function androidProfileCheck() {
          return deviceProfile ? window.innerHeight === deviceProfile[orientation] : false;
        }
        function iosInnerHeightCheck() {
          return window.innerHeight > startHeight;
        }
        window.scrollTo(0, self.IS_ANDROID ? 1 : 0);
        iterations--;
        if ((self.IS_ANDROID ? androidProfileCheck() : iosInnerHeightCheck()) || iterations < 0) {
          document.documentElement.style.minHeight = window.innerHeight + "px";
          var vp = document.getElementById("viewporter");
          if (vp) {
            vp.style.position = "relative";
            vp.style.height = window.innerHeight + "px";
          }
          clearInterval(scrollIntervalId);
          self.postProcess();
        }
      }, 10);
    },
    triggerWindowEvent: function (name) {
      var event = document.createEvent("Event");
      event.initEvent(name, false, false);
      window.dispatchEvent(event);
    }
  };

  _viewporterInstance = new Viewporter();
})();

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