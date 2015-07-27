// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#import <AssetsLibrary/ALAsset.h>
#import <AssetsLibrary/ALAssetRepresentation.h>
#import <AssetsLibrary/ALAssetsLibrary.h>

#import <Cordova/CDVPlugin.h>
#import <Cordova/CDVViewController.h>
#import <MobileCoreServices/MobileCoreServices.h>

@interface ChromeExtensionURLs : CDVPlugin
@end

@interface ChromeURLProtocol : NSURLProtocol {
    NSURLConnection* _activeConnection;
}
@end

static ChromeURLProtocol *outstandingDelayRequest = nil;
static NSString* pathPrefix = nil;
static BOOL registeredProtocol = NO;

static NSString* determineMimeType(NSString* path) {
    CFStringRef typeId = UTTypeCreatePreferredIdentifierForTag(kUTTagClassFilenameExtension, (__bridge CFStringRef)[path pathExtension], NULL);
    NSString* mimeType = nil;
    if (typeId) {
        if ([(__bridge NSString*)typeId rangeOfString : @"m4a-audio"].location != NSNotFound) {
            mimeType = @"audio/mp4";
        } else {
            mimeType = (__bridge_transfer NSString*)UTTypeCopyPreferredTagWithClass(typeId, kUTTagClassMIMEType);
        }
        CFRelease(typeId);
    }
    if (!mimeType) {
        // Taken from file plugin
        if ([[path pathExtension] rangeOfString:@"wav"].location != NSNotFound) {
            mimeType = @"audio/wav";
        } else if ([[path pathExtension] rangeOfString:@"css"].location != NSNotFound) {
            mimeType = @"text/css";
        } else {
            mimeType = @"application/octet-stream";
        }
    }
    return mimeType;
}

#pragma mark ChromeExtensionURLs

@implementation ChromeExtensionURLs

- (void)pluginInitialize {
    if (!registeredProtocol) {
        registeredProtocol = YES;
        [NSURLProtocol registerClass:[ChromeURLProtocol class]];
    }
    pathPrefix = nil;
}

- (BOOL)shouldOverrideLoadWithRequest:(NSURLRequest*)request navigationType:(UIWebViewNavigationType)navigationType {
    if (pathPrefix == nil) {
        if ([request.mainDocumentURL.path hasSuffix:@"www/plugins/cordova-plugin-chrome-apps-bootstrap/chromeapp.html"]) {
            pathPrefix = [[[request.mainDocumentURL.path stringByDeletingLastPathComponent] stringByDeletingLastPathComponent] stringByDeletingLastPathComponent];
        }
    }
    return NO;
}

// On a "release" command, trigger the chrome-content-loaded url to finish loading immediately.
- (void)release:(CDVInvokedUrlCommand*)command
{
    CDVPluginResult *pluginResult = nil;

    if (outstandingDelayRequest != nil) {
        NSURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:outstandingDelayRequest.request.URL
                                                              statusCode:200
                                                             HTTPVersion:@"HTTP/1.1"
                                                            headerFields:@{@"Cache-Control": @"no-cache"}];
        [[outstandingDelayRequest client] URLProtocol:outstandingDelayRequest
                                   didReceiveResponse:response
                                   cacheStoragePolicy:NSURLCacheStorageNotAllowed];

        [[outstandingDelayRequest client] URLProtocolDidFinishLoading:outstandingDelayRequest];
        outstandingDelayRequest = nil;
        pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
    } else {
        pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"No outstanding chrome-content-loaded requests"];
    }
    [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
}

@end

#pragma mark ChromeURLProtocol

@implementation ChromeURLProtocol

+ (BOOL)canInitWithRequest:(NSURLRequest*)request
{
    NSURL* url = [request URL];
    // Refer to comment in implementation of chrome.runtime.getURL().
    BOOL isChromeScheme = [[url scheme] isEqualToString:@"chrome-extension"] ||
                          [[url scheme] isEqualToString:@"gopher"];
    return pathPrefix != nil && isChromeScheme && ![[url path] isEqualToString:@"/!gap_exec"];
}

+ (NSURLRequest*)canonicalRequestForRequest:(NSURLRequest*)request
{
    return request;
}

- (void)startLoading
{
    NSURL *url = [[self request] URL];
    NSString *pathString = [url relativePath];
    if ([pathString isEqualToString:@"/chrome-content-loaded"]) {
        // If the request is for the special URL "chrome-extension://<any host>/chrome-content-loaded",
        // then do not return anything yet. Save this URLProtocol instance for future processing.
        outstandingDelayRequest = self;
    } else {
        // pathString always starts with a /.
        NSString *path = [pathPrefix stringByAppendingString:pathString];
        NSData* data = [NSData dataWithContentsOfFile:path options:NSDataReadingMappedIfSafe error:nil];
        
        if (!data) {
            NSDictionary* headers = @{@"Cache-Control": @"no-cache"};
            NSURLResponse *resp = [[NSHTTPURLResponse alloc] initWithURL:url statusCode:404 HTTPVersion:@"HTTP/1.1" headerFields:headers];
            [[self client] URLProtocol:self didReceiveResponse:resp cacheStoragePolicy:NSURLCacheStorageNotAllowed];
        } else {
            NSString* mimeType = determineMimeType(path);
            NSDictionary* headers = @{@"Cache-Control": @"no-cache",
                                      @"Content-Type": mimeType,
                                      @"Content-Length": [@(data.length) description]};
            NSURLResponse *resp = [[NSHTTPURLResponse alloc] initWithURL:url statusCode:200 HTTPVersion:@"HTTP/1.1" headerFields:headers];
            [[self client] URLProtocol:self didReceiveResponse:resp cacheStoragePolicy:NSURLCacheStorageNotAllowed];
            [[self client] URLProtocol:self didLoadData:data];
        }
        [[self client] URLProtocolDidFinishLoading:self];
    }
}

- (void)stopLoading {
}

@end

