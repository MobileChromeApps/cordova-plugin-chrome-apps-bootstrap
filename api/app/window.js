// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var cordova = require('cordova');
var exec = require('cordova/exec');
var Event = require('cordova-plugin-chrome-apps-common.events');
var mobile = require('cordova-plugin-chrome-apps-bootstrap.mobile.impl');
var runtime = require('cordova-plugin-chrome-apps-runtime.runtime');
var ChromeExtensionURLs = require('cordova-plugin-chrome-apps-bootstrap.helpers.ChromeExtensionURLs');
var backgroundapp = require('cordova-plugin-background-app.backgroundapp');

// The AppWindow created by chrome.app.window.create.
var createdAppWindow = null;
var dummyNode = document.createElement('a');

// The temporary tag name used for deferring HTML import processing
var linkReplacementTag = "x-txpspgbc";

function AppWindow() {
  this.contentWindow = mobile.fgWindow;
  this.id = '';
}

function unsupportedApi(api) {
  return function() {
    console.warn(api + ' is not supported on mobile.');
  };
}

AppWindow.prototype = {
  moveTo: unsupportedApi('AppWindow.moveTo'),
  clearAttention: unsupportedApi('AppWindow.clearAttention'),
  drawAttention: unsupportedApi('AppWindow.drawAttention'),
  focus: unsupportedApi('AppWindow.focus'),
  resizeTo: unsupportedApi('AppWindow.resizeTo'),
  maximize: unsupportedApi('AppWindow.maximize'),
  close: unsupportedApi('AppWindow.close'),
  setBounds: unsupportedApi('AppWindow.setBounds'),
  onBoundsChanged: new Event('onBoundsChanged'),
  onClosed: new Event('onClosed')
};
AppWindow.prototype.getBounds = function() {
  return {
    width: 0,
    height: 0,
    left: 0,
    top: 0
  };
};
AppWindow.prototype.hide = function() {
  exec(null, null, 'ChromeAppWindow', 'hide', []);
};
AppWindow.prototype.show = function(focused) {
  if (backgroundapp.show) {
    backgroundapp.show();
  } else {
    console.warn('AppWindow.show() not implemented for ' + cordova.platformId);
  }
};
AppWindow.prototype.restore = function() {
  // Same behaviour as show, given minimize/maximize don't really make sense on mobile
  this.show();
};
AppWindow.prototype.minimize = function() {
  // Same behaviour as hide, given minimize/maximize don't really make sense on mobile
  this.hide();
};

function copyAttributes(srcNode, destNode) {
  var srcAttrs = srcNode.attributes;
  var destAttrs = destNode.attributes;
  for (var i = 0, max = destAttrs.length; i < max; ++i) {
    destNode.removeAttribute(destAttrs[i].name);
  }
  for (var i = 0, attr; attr = srcAttrs[i]; ++i) {
    destNode.setAttribute(attr.name, attr.value);
  }
}

function applyAttributes(attrText, destNode) {
  dummyNode.innerHTML = '<a ' + attrText + '>';
  copyAttributes(dummyNode.firstChild, destNode);
}

// Recreates an array of link / script nodes so that they get executed.
// batch must have at least one node in it.
function evalScriptBatch(batch, afterFunc) {
  var doc = batch[0].ownerDocument;
  var numRemaining = batch.length;
  function onLoadCallback(a) {
    if (!--numRemaining) {
      afterFunc();
    }
  }
  for (var i = 0, node; node = batch[i]; ++i) {
    if (node.nodeName === 'SCRIPT') {
      var replacement = doc.createElement('script');
      copyAttributes(node, replacement);
      replacement.textContent = node.textContent;
      if (node.src) {
        replacement.onload = onLoadCallback;
        replacement.onerror = onLoadCallback;
        replacement.async = false;
        node.parentNode.replaceChild(replacement, node);
      } else {
        node.parentNode.replaceChild(replacement, node);
        onLoadCallback();
      }
    } else {
      var replacement = document.createElement('link');
      copyAttributes(node, replacement);
      replacement.onload = onLoadCallback;
      replacement.onerror = onLoadCallback;
      node.parentNode.replaceChild(replacement, node);
    }
  }
}

// Evals the scripts in order.
function evalScripts(rootNode, afterFunc) {
  var nodes = Array.prototype.slice.call(rootNode.querySelectorAll('script,' + linkReplacementTag));
  var scriptBatches = [[]];

  for (var i = 0, node; node = nodes[i]; ++i) {
    if (node.nodeName === 'SCRIPT') {
      if (node.type && !(/text\/javascript/i.exec(node.type) ||
                           /application\/javascript/i.exec(node.type) ||
                           /application\/dart/i.exec(node.type))) {
        // Ignore these.
      } else {
        if (node.src) {
          scriptBatches[scriptBatches.length-1].push(node);
        } else {
          // Make sure inline scripts execute *after* previous non-inline ones are finished.
          scriptBatches.push([node], []);
        }
      }
    } else {
      scriptBatches[scriptBatches.length-1].push(node);
    }
  }

  function processBatch() {
    var curBatch = scriptBatches.shift();
    if (!curBatch) {
      afterFunc();
    } else if (curBatch.length === 0) {
      processBatch();
    } else {
      evalScriptBatch(curBatch, processBatch);
    }
  }
  processBatch();
}

function rewritePage(pageContent, filePath, callback) {
  var fgBody = document.body;
  var fgHead = fgBody.previousElementSibling;

  // fgHead.innerHTML causes a DOMException on Android 2.3.
  while (fgHead.lastChild) {
    fgHead.removeChild(fgHead.lastChild);
  }

  // In order to ensure that HTML imports load in the correct order, replace
  // <link> imports with a placeholder tag and re-add them explicitly in evalScripts().
  // RegExp may match more than needed (in odd cases), but doing so is harmless.
  // It also strips off any </link> or <link /> (which are also odd).
  //
  // Do *not* apply this transformation for the HTMLImports polyfill, since the
  // polyfill does not run until DOMContentLoaded (and we block DOMContentLoaded until
  // links are loaded).
  if ('import' in document.createElement('link')) {
      var importFinder = /<link(\s[^>]*\brel\s*=[\s'"]*import[\s\S]*?)(?:\/?>)(?:\s*<\/link>)?/ig;
      pageContent = pageContent.replace(importFinder, '<' + linkReplacementTag + '$1></' + linkReplacementTag + '>');
  }

  var htmlPattern = /(?:<!--[\s\S]*?--[^>]*?>\s*)*<html\b([\s\S]*?)>/ig;
  var htmlMatch = htmlPattern.exec(pageContent);
  if (htmlMatch) {
    // Copy over the attributes of the <html> tag.
    applyAttributes(htmlMatch[1], fgBody.parentNode);
    pageContent = pageContent.slice(htmlPattern.lastIndex);
  } else {
    console.warn('Failed to find <html> tag.');
  }

  // Put everything before the body tag in the head.
  // Ignore <body> within <!-- comments -->, which vulcanize can insert.
  // But pick up everything before <body>, and consider that the <head>.
  // This isn't quite correct, but it's good enough.
  var bodyPattern = /(?:<!--[\s\S]*?--[^>]*?>\s*[\s\S]*?)*<body\b([\s\S]*?)>/gi;
  var bodyMatch = bodyPattern.exec(pageContent);
  if (!bodyMatch) {
    console.warn('Failed to find <body> tag.');
  }
  var headHtml = pageContent.slice(0, bodyPattern.lastIndex); // lastIndex is 0 for no match.
  // Don't bother removing the <body>, </body>, </html>. The browser's sanitizer removes them for us.
  pageContent = pageContent.slice(bodyPattern.lastIndex);
  applyAttributes((bodyMatch && bodyMatch[1]) || '', fgBody); // removes the style attr if no match.

  fgHead.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="' + runtime.getURL('plugins/cordova-plugin-chrome-apps-bootstrap/chromeappstyles.css') + '">');
  fgHead.insertAdjacentHTML('beforeend', headHtml);
  evalScripts(fgHead, function() {
    mobile.eventIframe.insertAdjacentHTML('afterend', pageContent);
    evalScripts(fgBody, callback);
  });
}

exports.create = function(filePath, options, callback) {
  if (createdAppWindow) {
    console.log('ERROR - chrome.app.window.create called multiple times. This is unsupported.');
    return;
  }
  createdAppWindow = new AppWindow();

  var anchorEl = mobile.bgWindow.document.createElement('a');
  anchorEl.href = filePath;
  var resolvedUrl = anchorEl.href;
  // Use background page's XHR so that relative URLs are relative to it.
  var xhr = new XMLHttpRequest();
  xhr.open('GET', resolvedUrl, true);
  // Android pre KK doesn't support onloadend.
  xhr.onload = xhr.onerror = function() {
    // Change the page URL before the callback.
    history.replaceState(null, null, resolvedUrl);
    // Call the callback before the page contents loads.
    if (callback) {
      callback(createdAppWindow);
    }
    var pageContent = xhr.responseText || 'Page load failed.';
    rewritePage(pageContent, filePath, function() {
      ChromeExtensionURLs.releaseReadyWait();
      createdAppWindow.show();
    });
  };
  xhr.send();
};

exports.current = function() {
  return window == mobile.fgWindow ? createdAppWindow : null;
};

exports.getAll = function() {
  return createdAppWindow ? [createdAppWindow] : [];
};
