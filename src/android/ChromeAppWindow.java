// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package org.chromium;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaArgs;
import org.apache.cordova.CordovaPlugin;

import android.app.Activity;
import android.content.Intent;
import android.util.Log;

import org.json.JSONException;

public class ChromeAppWindow extends CordovaPlugin {

    @Override
    public boolean execute(String action, CordovaArgs args, final CallbackContext callbackContext) throws JSONException {
        if ("hide".equals(action)) {
            hide(args, callbackContext);
            return true;
        }

        return false;
    }

    private void hide(final CordovaArgs args, final CallbackContext callbackContext) {
        cordova.getActivity().moveTaskToBack(true);
        callbackContext.success();
    }
}
