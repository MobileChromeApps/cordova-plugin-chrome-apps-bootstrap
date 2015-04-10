// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

exports.defineManualTests = function(rootEl, addButton) {
  var $document = rootEl.ownerDocument;

  $document.addEventListener("pause", function onPause() {
    console.log('Received the pause event');
  });

  $document.addEventListener("resume", function onResume() {
    console.log('Received the resume event');
  });

  addButton('AppWindow.hide()', function() {
    chrome.app.window.current().hide();
  });

  addButton('AppWindow.show()', function() {
    chrome.app.window.current().show();
  });

  addButton('AppWindow.show() after alarm', function() {

    var expectedFireTime = Date.now() + 500;
    var myAlarmName = 'alarmtoshowafterhide';

    chrome.alarms.onAlarm.addListener(function showAlarmHandler(alarm) {
      console.log("Received alarm: " + alarm.name);
      if (alarm.name === myAlarmName) {
        chrome.alarms.onAlarm.removeListener(showAlarmHandler);
        chrome.app.window.current().show();
      }
    });

    chrome.alarms.create(myAlarmName, { when:expectedFireTime });
    chrome.app.window.current().hide();
  });

  // chrome.embed tests
  var wURL = window.URL || window.webkitURL;

  addButton('Get image via XHR (traditional events)', function() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://www.apache.org/images/feather-small.gif', true);
    xhr.responseType = 'blob';
    xhr.onload = function(e) {
      var $document = rootEl.ownerDocument;
      var img = $document.createElement('img');
      img.src = wURL.createObjectURL(this.response);
      rootEl.appendChild(img);
    };
    xhr.send();
  });

  addButton('Get image via XHR (DOM2 Events)', function() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://www.apache.org/images/feather-small.gif', true);
    xhr.responseType = 'blob';
    xhr.addEventListener('load', function(e) {
      var $document = rootEl.ownerDocument;
      var img = $document.createElement('img');
      img.src = wURL.createObjectURL(this.response);
      rootEl.appendChild(img);
    });
    xhr.send();
  });

  addButton('Get image via RAL', function() {
    var wnd = chrome.app.window.current();
    var RAL = window.RAL || wnd.RAL;
    var remoteImage = new RAL.RemoteImage({src:'http://www.apache.org/images/feather-small.gif'});

    rootEl.appendChild(remoteImage.element);
    RAL.Queue.add(remoteImage);
    RAL.Queue.setMaxConnections(4);
    RAL.Queue.start();
  });

};

exports.defineAutoTests = function() {
  'use strict';

  require('cordova-plugin-chrome-apps-test-framework.jasmine_helpers').addJasmineHelpers();

  describe('chrome.app.window', function() {
    var customMatchers = {
      toBeArray : function(util, customEqualityTesters){
        return {
          compare : function(actual, expected){
            var result = {};
            result.pass = Array.isArray(actual);
            result.message = 'Expected ' + actual + ' to be an Array.';
            return result;
          }
        };
      },
      toHaveFunction : function(util, customEqualityTesters) {
        return {
          compare : function(actual, functionName){
            var result = {};
            result.pass = (typeof actual[functionName] === 'function');
            result.message = 'Expected ' + actual + ' to have function ' + functionName;
            return result;
          }
        };
      },
    };

    beforeEach(function(done) {
      jasmine.addMatchers(customMatchers);
      done();
    });

    // TODO: implement runningInBackground
    var runningInBackground = false;
    if (runningInBackground) {
      it('current() should return null', function() {
        expect(chrome.app.window.current()).toBeNull();
      });
      it('getAll() should return an empty array', function() {
        var windows = chrome.app.window.getAll();
        expect(windows).toBeArray();
        expect(windows.length).toEqual(0);
      });
    } else {
      it('current() should return an AppWindow', function() {
        var wnd = chrome.app.window.current();
        expect(wnd).not.toBeNull();
        expect(wnd.onClosed).not.toBeUndefined();
      });
      it('getAll() should return an array containing one AppWindow', function() {
        var windows = chrome.app.window.getAll();
        expect(windows).toBeArray();
        expect(windows.length).toEqual(1);
        expect(windows[0]).not.toBeNull();
        expect(windows[0].onClosed).not.toBeUndefined();
      });
    }
    describe('window.opener', function() {
      if (runningInBackground) {
        it ('should return null', function() {
          expect(window.opener).toBeNull();
        });
  //    } else {
  //      it ('should return the background window', function() {
  //        expect(window.opener).toEqual(chromespec.bgWnd);
  //      });
      }
    });
    describe('AppWindow', function() {
      function getCurrentWindow() {
        var wnd = chrome.app.window.current();
        expect(wnd).not.toBeNull();
        return wnd;
      }

      if (runningInBackground) {
      } else {
        it('hide() should be defined', function() {
          var wnd = getCurrentWindow();
          expect(wnd).toHaveFunction('hide');
        });

        it('minimize() should be defined', function() {
          var wnd = getCurrentWindow();
          expect(wnd).toHaveFunction('minimize');
        });

        it('show() should be defined', function() {
          var wnd = getCurrentWindow();
          expect(wnd).toHaveFunction('show');
        });

        it('restore() should be defined', function() {
          var wnd = getCurrentWindow();
          expect(wnd).toHaveFunction('restore');
        });
      }
    });
  });

  describe("chrome.mobile.impl", function() {

    it('getManifest() should have a name that is a string', function() {
      var manifest = chrome.runtime.getManifest();
      expect(typeof manifest.name).toBe('string'); // .isEqual(jasmine.any(String)) seems to not work
    });
    it('getBackgroundPage() should throw when args are invalid', function() {
      expect(function() {chrome.runtime.getBackgroundPage();}).toThrow();
      expect(function() {chrome.runtime.getBackgroundPage(1);}).toThrow();
    });
    it('getBackgroundPage() should provide a window object asynchronously.', function(done) {
      var bgPage = null;
      chrome.runtime.getBackgroundPage(function(wnd) {
        bgPage = wnd;
        // TODO: implement runningInBackground
        var runningInBackground = false;
        if (runningInBackground) {
          expect(window == bgPage).toBe(true, 'window should == bgPage');
        } else {
          expect(window == bgPage).toBe(false, 'window should != bgPage');
        }
        done();
      });
      expect(bgPage).toBeNull();
    });
    describe('getURL()', function() {
      var prefix;
      beforeEach(function(done) {
        prefix = location.href.replace(/[^\/]*$/, '');
        done();
      });

      it('should throw when args are missing', function() {
        expect(function() {chrome.runtime.getURL();}).toThrow();
      });
      it('should throw when args are invalid', function() {
        expect(function() {chrome.runtime.getURL(3);}).toThrow();
      });
      it('should work for empty path', function() {
        expect(chrome.runtime.getURL('')).toBe(prefix);
      });
      it('should work', function() {
        expect(chrome.runtime.getURL('b')).toBe(prefix + 'b');
      });
      it('should work for root-relative path', function() {
        expect(chrome.runtime.getURL('/b')).toBe(prefix + 'b');
      });
      it('should not change paths that already have the root prefix', function() {
        var fullUrl = location.href;
        expect(chrome.runtime.getURL(fullUrl)).toBe(fullUrl);
      });
    });
    itShouldHaveAnEvent(chrome.runtime, 'onInstalled');
    itShouldHaveAnEvent(chrome.runtime, 'onStartup');
    itShouldHaveAnEvent(chrome.runtime, 'onSuspend');
    itShouldHaveAnEvent(chrome.runtime, 'onSuspendCanceled');
    itShouldHaveAnEvent(chrome.runtime, 'onUpdateAvailable');
    itShouldHaveAPropertyOfType(chrome.runtime, 'id', 'string');
    itShouldHaveAPropertyOfType(chrome.runtime, 'reload', 'function');
    itShouldHaveAPropertyOfType(chrome.runtime, 'requestUpdateCheck', 'function');
  });

  describe('CORS XHR', function() {
    it('should xhr to apache.org', function(done) {
      var win = jasmine.createSpy('win');
      var lose = jasmine.createSpy('lose');
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'http://www.apache.org/');
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            win();
          } else {
            lose();
          }
          expect(win).toHaveBeenCalled();
          expect(lose).not.toHaveBeenCalled();
          done();
        }
      };
      xhr.send();
    });

    it('should not xhr to google.com', function(done) {
      var win = jasmine.createSpy('win');
      var lose = jasmine.createSpy('lose');
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'http://www.google.com/');
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            lose();
          } else {
            win();
          }
          expect(win).toHaveBeenCalled();
          expect(lose).not.toHaveBeenCalled();
          done();
        }
      };
      xhr.send();
    });

  });

  describe('Blob XHR', function() {

    it('should support Blob return types', function(done) {
      var win = jasmine.createSpy('win');
      var lose = jasmine.createSpy('lose');
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'http://www.apache.org/images/feather-small.gif', true);
      xhr.responseType = 'blob';
      xhr.onerror = lose;
      xhr.onload = function(e) {
        if (this.response instanceof Blob) {
         // if ((this.response instanceof chromespec.fgWnd.Blob) || (this.response instanceof chromespec.bgWnd.Blob)) {
          win();
        } else {
          lose();
        }
        expect(win).toHaveBeenCalled();
        expect(lose).not.toHaveBeenCalled();
        done();
      };
      xhr.send();
    });

  });
  describe('XHR: Embed', function() {

    it('should XHR an image back from apache.org', function(done) {
      var win = jasmine.createSpy('win');
      var lose = jasmine.createSpy('lose');
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'http://www.apache.org/images/feather-small.gif', true);
      xhr.responseType = 'blob';
      xhr.onerror = lose;
      xhr.onload = function(e) {
        var img = document.createElement('img');
        img.src = window.webkitURL.createObjectURL(this.response);
        win();
        expect(win).toHaveBeenCalled();
        expect(lose).not.toHaveBeenCalled();
        done();
      };
      xhr.send();
    });
  });

};
