// Copyright (c) 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package org.chromium;

import org.apache.cordova.CordovaPlugin;

import android.net.Uri;

public class ChromeExtensionURLs extends CordovaPlugin {

    RequestModifyInterface i18nPlugin;
    private String baseUrl;

    static interface RequestModifyInterface
    {
        public Uri remapChromeUri(Uri uri);
    }

    public Uri remapToRealLocation(Uri uri) {
        // Add this check just to make plugin work with older versions of CCA.
        String base = baseUrl == null ? "file:///android_asset/www" : baseUrl;
        String filePath = uri.getPath();
        uri = Uri.parse(base + filePath);
        uri = webView.getResourceApi().remapUri(uri);
        return uri;
    }

    public static boolean isChromeAppUrl(String url) {
        // Refer to comment in implementation of chrome.runtime.getURL().
        return url.startsWith("chrome-extension:") || url.startsWith("gopher:");
    }

    public static boolean isChromeAppUrl(Uri url) {
        String scheme = url.getScheme();
        return "chrome-extension".equals(scheme) || "gopher".equals(scheme);
    }

    @Override
    public Object onMessage(String id, Object data) {
        if (baseUrl == null && "onPageStarted".equals(id)) {
            String url = (String)data;
            baseUrl = url.replaceAll("/plugins/.*?$", "");
        }
        return null;
    }

    // @Override
    public Boolean shouldAllowNavigation(String url) {
        // Required for iframes.
        if (isChromeAppUrl(url)) {
            return true;
        }
        return null;
    }

    // @Override
    public Boolean shouldAllowRequest(String url) {
        if (isChromeAppUrl(url)) {
            return true;
        }
        return null;
    }

    @Override
    public Uri remapUri(Uri uri) {
        // Check the scheme to see if we need to handle.
        // Also ensure we haven't intercepted it before
        //  If this check wasn't present, the content-loaded section would go into an infinite loop of data retrieval attempts
        if (!isChromeAppUrl(uri)) {
            return null;
        }

        if ("/chrome-content-loaded".equals(uri.getPath())) {
            return Uri.parse("data:text/javascript,Object.defineProperty%28document%2C%20%27readyState%27%2C%20%7Bget%3A%20function%28%29%20%7B%20return%20%27loading%27%7D%2C%20configurable%3A%20true%20%7D%29%3B");
        }

        if (i18nPlugin != null) {
            uri = i18nPlugin.remapChromeUri(uri);
        }
        
        // i18n can return data URIs.
        if (isChromeAppUrl(uri)) {
            uri = remapToRealLocation(uri);
        }

        // We need the input stream below for the modifyResponseInputStream. So we load using a separate request.
        return uri;
    }
}
